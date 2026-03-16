import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getSkuImagesForProduct, isSheetsConfigured } from '@/lib/google-sheets'

interface SkuSalesRow {
  goods_id: string
  goods_name: string
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
  stagnation_alert: string | null
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
    const cacheKey = buildCacheKey('product-skus', { product_code, period, month: month || '' })

    const data = await cachedQuery(cacheKey, async () => {
      const neDateCond = dateRange
        ? `AND LEFT(o.receive_order_date, 10) >= '${dateRange.start}' AND LEFT(o.receive_order_date, 10) <= '${dateRange.end}'`
        : ''
      const zozoDateCond = dateRange
        ? `AND LEFT(z.order_date, 10) >= '${dateRange.start}' AND LEFT(z.order_date, 10) <= '${dateRange.end}'`
        : ''

      // SKU-level sales from NE + ZOZO
      const salesQuery = `
        WITH ne_sku_sales AS (
          SELECT
            o.goods_id,
            MAX(p.goods_name) AS goods_name,
            SUM(o.quantity) AS total_quantity,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
            SAFE_DIVIDE(
              SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
                - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
              NULLIF(SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)), 0)
            ) AS gross_profit_rate
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE COALESCE(p.goods_representation_id, o.goods_id) = @product_code
            AND CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            ${neDateCond}
          GROUP BY o.goods_id
        ),
        zozo_sku_sales AS (
          SELECT
            z.ne_goods_id AS goods_id,
            MAX(z.product_name) AS goods_name,
            SUM(z.order_quantity) AS total_quantity,
            SUM(z.selling_price * z.order_quantity) AS sales_amount,
            0 AS gross_profit_rate
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE z.ne_goods_representation_id = @product_code
            AND (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            ${zozoDateCond}
          GROUP BY z.ne_goods_id
        )
        SELECT
          COALESCE(n.goods_id, z.goods_id) AS goods_id,
          COALESCE(n.goods_name, z.goods_name) AS goods_name,
          COALESCE(n.total_quantity, 0) + COALESCE(z.total_quantity, 0) AS total_quantity,
          COALESCE(n.sales_amount, 0) + COALESCE(z.sales_amount, 0) AS sales_amount,
          COALESCE(n.gross_profit_rate, 0) AS gross_profit_rate
        FROM ne_sku_sales n
        FULL OUTER JOIN zozo_sku_sales z ON n.goods_id = z.goods_id
        ORDER BY sales_amount DESC
      `

      // SKU-level inventory + MD analysis
      const inventoryQuery = `
        SELECT
          md.goods_id,
          COALESCE(md.total_stock, 0) AS total_stock,
          COALESCE(md.free_stock, 0) AS free_stock,
          COALESCE(md.zozo_stock, 0) AS zozo_stock,
          COALESCE(md.own_stock, 0) AS own_stock,
          COALESCE(md.daily_sales, 0) AS daily_sales,
          CASE WHEN md.daily_sales > 0 THEN SAFE_DIVIDE(md.total_stock, md.daily_sales) ELSE 0 END AS stock_days,
          COALESCE(md.inventory_status, '') AS inventory_status,
          COALESCE(md.lifecycle_stance, '') AS lifecycle_stance,
          COALESCE(md.turnover_rate_annual, 0) AS turnover_rate_annual,
          COALESCE(md.turnover_days, 0) AS turnover_days,
          md.last_io_date,
          COALESCE(md.days_since_last_io, 0) AS days_since_last_io,
          md.stagnation_alert,
          md.lifecycle_action
        FROM ${tableName('mart_md_dashboard')} md
        WHERE md.product_code = @product_code
      `

      const [salesRows, inventoryRows] = await Promise.all([
        runQuery<SkuSalesRow>(salesQuery, { product_code }),
        runQuery<SkuInventoryRow>(inventoryQuery, { product_code }),
      ])

      // Merge sales + inventory by goods_id
      const invMap = new Map(inventoryRows.map(r => [r.goods_id, r]))

      // Also include SKUs that only exist in inventory (no sales in period)
      const salesGoodsIds = new Set(salesRows.map(r => r.goods_id))
      const inventoryOnly = inventoryRows.filter(r => !salesGoodsIds.has(r.goods_id))

      const merged = [
        ...salesRows.map(s => {
          const inv = invMap.get(s.goods_id)
          return {
            goods_id: s.goods_id,
            goods_name: s.goods_name,
            total_quantity: s.total_quantity,
            sales_amount: s.sales_amount,
            gross_profit_rate: s.gross_profit_rate,
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
            stagnation_alert: inv?.stagnation_alert ?? null,
            lifecycle_action: inv?.lifecycle_action ?? null,
          }
        }),
        ...inventoryOnly.map(inv => ({
          goods_id: inv.goods_id,
          goods_name: '',
          total_quantity: 0,
          sales_amount: 0,
          gross_profit_rate: 0,
          total_stock: inv.total_stock,
          free_stock: inv.free_stock,
          zozo_stock: inv.zozo_stock,
          own_stock: inv.own_stock,
          daily_sales: inv.daily_sales,
          stock_days: inv.stock_days,
          inventory_status: inv.inventory_status,
          lifecycle_stance: inv.lifecycle_stance,
          turnover_rate_annual: inv.turnover_rate_annual,
          turnover_days: inv.turnover_days,
          last_io_date: inv.last_io_date,
          days_since_last_io: inv.days_since_last_io,
          stagnation_alert: inv.stagnation_alert,
          lifecycle_action: inv.lifecycle_action,
        })),
      ]

      return merged
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
