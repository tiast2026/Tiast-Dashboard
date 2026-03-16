import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getSkuImagesForProduct, isSheetsConfigured } from '@/lib/google-sheets'

interface SkuBaseRow {
  goods_id: string
  goods_name: string
  selling_price: number
  cost_price: number
}

interface SkuSalesRow {
  goods_id: string
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
}

interface SkuInventoryRow {
  goods_id: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
  lifecycle_stance: string
  turnover_rate_annual: number
  turnover_days: number
  last_io_date: string | null
  days_since_last_io: number
  stagnation_alert: boolean
  lifecycle_action: string | null
}

function getDateRange(period: string, month?: string): { start: string; end: string } | null {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'month') {
    const m = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, mo] = m.split('-').map(Number)
    const start = `${y}-${String(mo).padStart(2, '0')}-01`
    const lastDay = new Date(y, mo, 0).getDate()
    const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { start, end }
  }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 60
  const end = now.toISOString().slice(0, 10)
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - days)
  const start = startDate.toISOString().slice(0, 10)
  return { start, end }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ product_code: string }> }
) {
  try {
    const { product_code } = await params
    const { searchParams } = request.nextUrl
    const period = searchParams.get('period') || 'month'
    const month = searchParams.get('month') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [] })
    }

    const dateRange = getDateRange(period, month)
    const cacheKey = buildCacheKey('product-skus-v2', { product_code, period, month: month || '' })

    const data = await cachedQuery(cacheKey, async () => {
      // 1. Base SKU list from products table (always available)
      const baseQuery = `
        SELECT
          p.goods_id,
          p.goods_name,
          COALESCE(p.goods_selling_price, 0) AS selling_price,
          COALESCE(p.goods_cost_price, 0) AS cost_price
        FROM \`tiast-data-platform.raw_nextengine.products\` p
        WHERE p.goods_representation_id = @product_code
        ORDER BY p.goods_id
      `

      // 2. SKU-level sales (NE only first, simpler and more reliable)
      const neDateCond = dateRange
        ? `AND LEFT(o.receive_order_date, 10) >= '${dateRange.start}' AND LEFT(o.receive_order_date, 10) <= '${dateRange.end}'`
        : ''

      const salesQuery = `
        SELECT
          o.goods_id,
          SUM(o.quantity) AS total_quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
          SAFE_DIVIDE(
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
              - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
            NULLIF(SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)), 0)
          ) AS gross_profit_rate
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE p.goods_representation_id = @product_code
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          ${neDateCond}
        GROUP BY o.goods_id
      `

      // 3. SKU-level inventory from mart_md_dashboard
      const inventoryQuery = `
        SELECT
          md.goods_id,
          COALESCE(md.total_stock, 0) AS total_stock,
          COALESCE(md.free_stock, 0) AS free_stock,
          COALESCE(md.zozo_stock, 0) AS zozo_stock,
          COALESCE(md.own_stock, 0) AS own_stock,
          COALESCE(md.daily_sales, 0) AS daily_sales,
          COALESCE(md.stock_days, 0) AS stock_days,
          COALESCE(md.inventory_status, '') AS inventory_status,
          COALESCE(md.lifecycle_stance, '') AS lifecycle_stance,
          COALESCE(md.turnover_rate_annual, 0) AS turnover_rate_annual,
          COALESCE(md.turnover_days, 0) AS turnover_days,
          md.last_io_date,
          COALESCE(md.days_since_last_io, 0) AS days_since_last_io,
          COALESCE(md.stagnation_alert, false) AS stagnation_alert,
          md.lifecycle_action
        FROM ${tableName('mart_md_dashboard')} md
        WHERE md.product_code = @product_code
      `

      // Run all three in parallel
      const [baseRows, salesRows, inventoryRows] = await Promise.all([
        runQuery<SkuBaseRow>(baseQuery, { product_code }),
        runQuery<SkuSalesRow>(salesQuery, { product_code }).catch(e => {
          console.error('SKU sales query error:', e)
          return [] as SkuSalesRow[]
        }),
        runQuery<SkuInventoryRow>(inventoryQuery, { product_code }).catch(e => {
          console.error('SKU inventory query error:', e)
          return [] as SkuInventoryRow[]
        }),
      ])

      // Build maps for merging
      const salesMap = new Map(salesRows.map(r => [r.goods_id, r]))
      const invMap = new Map(inventoryRows.map(r => [r.goods_id, r]))

      // Merge: base products + sales + inventory
      return baseRows.map(base => {
        const sales = salesMap.get(base.goods_id)
        const inv = invMap.get(base.goods_id)
        return {
          goods_id: base.goods_id,
          goods_name: base.goods_name,
          selling_price: base.selling_price,
          cost_price: base.cost_price,
          total_quantity: sales?.total_quantity ?? 0,
          sales_amount: sales?.sales_amount ?? 0,
          gross_profit_rate: sales?.gross_profit_rate ?? 0,
          total_stock: inv?.total_stock ?? 0,
          free_stock: inv?.free_stock ?? 0,
          zozo_stock: inv?.zozo_stock ?? 0,
          own_stock: inv?.own_stock ?? 0,
          daily_sales: inv?.daily_sales ?? 0,
          stock_days: inv?.stock_days ?? 0,
          inventory_status: inv?.inventory_status ?? '',
          lifecycle_stance: inv?.lifecycle_stance ?? '',
          turnover_rate_annual: inv?.turnover_rate_annual ?? 0,
          turnover_days: inv?.turnover_days ?? 0,
          last_io_date: inv?.last_io_date ?? null,
          days_since_last_io: inv?.days_since_last_io ?? 0,
          stagnation_alert: inv?.stagnation_alert ?? false,
          lifecycle_action: inv?.lifecycle_action ?? null,
        }
      })
    })

    // Overlay SKU images from Google Sheets
    const skuImages: Record<string, { color: string; size: string; sku_image_url: string }> = {}
    if (isSheetsConfigured()) {
      try {
        const images = await getSkuImagesForProduct(product_code)
        for (const img of images) {
          skuImages[img.sku_code] = { color: img.color, size: img.size, sku_image_url: img.sku_image_url }
        }
      } catch (e) {
        console.error('Failed to fetch SKU images:', e)
      }
    }

    const result = (data || []).map((sku: Record<string, unknown>) => {
      const goodsId = String(sku.goods_id || '')
      const img = skuImages[goodsId]
      return {
        ...sku,
        color: img?.color || '',
        size: img?.size || '',
        sku_image_url: img?.sku_image_url || '',
      }
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('SKU list error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
