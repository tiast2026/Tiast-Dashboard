import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
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

      // 3. SKU-level inventory directly from stock tables (not mart_md_dashboard)
      //    mart_md_dashboard has WHERE total_stock > 0, which drops zero-stock SKUs
      //    and can cause goods_id mismatch issues.
      const inventoryQuery = `
        WITH sku_stock AS (
          SELECT
            s.goods_id,
            SUM(s.stock_quantity) AS total_stock,
            SUM(s.stock_free_quantity) AS free_stock,
            SUM(COALESCE(s.stock_advance_order_quantity, 0)) AS advance_stock
          FROM \`tiast-data-platform.raw_nextengine.stock\` s
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON s.goods_id = p.goods_id
          WHERE p.goods_representation_id = @product_code
          GROUP BY s.goods_id
        ),
        sku_zozo AS (
          SELECT
            zs.ne_goods_id AS goods_id,
            SUM(zs.stock_quantity) AS zozo_stock
          FROM \`tiast-data-platform.raw_zozo.zozo_stock\` zs
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON zs.ne_goods_id = p.goods_id
          WHERE p.goods_representation_id = @product_code
            AND zs.ne_goods_id IS NOT NULL AND zs.ne_goods_id != ''
          GROUP BY zs.ne_goods_id
        ),
        sku_daily AS (
          SELECT
            o.goods_id,
            SUM(o.quantity) * 1.0 / 30 AS daily_qty,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) / 30 AS daily_sales_amount
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE p.goods_representation_id = @product_code
            AND CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          GROUP BY o.goods_id
        ),
        sku_annual AS (
          SELECT
            o.goods_id,
            SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS annual_cogs
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE p.goods_representation_id = @product_code
            AND CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
          GROUP BY o.goods_id
        ),
        sku_io AS (
          SELECT
            goods_id,
            MAX(io_date) AS last_io_date
          FROM \`tiast-data-platform.raw_nextengine.stock_io_history\`
          WHERE CAST(deleted_flag AS STRING) = '0'
          GROUP BY goods_id
        )
        SELECT
          p.goods_id,
          COALESCE(ss.total_stock, 0) AS total_stock,
          COALESCE(ss.free_stock, 0) AS free_stock,
          COALESCE(ss.advance_stock, 0) AS advance_stock,
          COALESCE(sz.zozo_stock, 0) AS zozo_stock,
          COALESCE(ss.total_stock, 0) - COALESCE(sz.zozo_stock, 0) AS own_stock,
          COALESCE(sd.daily_sales_amount, 0) AS daily_sales,
          SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) AS stock_days,
          CASE
            WHEN COALESCE(ss.total_stock, 0) = 0 THEN '在庫なし'
            WHEN COALESCE(ss.free_stock, 0) <= 0 AND COALESCE(sd.daily_qty, 0) > 0 THEN '欠品'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) > 90 THEN '過剰'
            ELSE '適正'
          END AS inventory_status,
          CASE
            WHEN COALESCE(sd.daily_qty, 0) = 0 AND COALESCE(ss.total_stock, 0) > 0 THEN '衰退期'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) > 90 THEN '安定期'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) < 14 THEN '最盛期'
            ELSE '助走期'
          END AS lifecycle_stance,
          SAFE_DIVIDE(COALESCE(sa.annual_cogs, 0), COALESCE(ss.total_stock, 0) * COALESCE(p.goods_cost_price, 0)) AS turnover_rate_annual,
          SAFE_DIVIDE(365.0, SAFE_DIVIDE(COALESCE(sa.annual_cogs, 0), COALESCE(ss.total_stock, 0) * COALESCE(p.goods_cost_price, 0))) AS turnover_days,
          sio.last_io_date,
          DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(sio.last_io_date, 10)), DAY) AS days_since_last_io,
          DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(sio.last_io_date, 10)), DAY) > 30 AS stagnation_alert,
          CASE
            WHEN COALESCE(ss.free_stock, 0) <= 0 AND COALESCE(sd.daily_qty, 0) > 0 THEN '緊急補充'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) > 180 THEN '値引販売で在庫消化'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) > 90 THEN '発注抑制・在庫圧縮'
            WHEN SAFE_DIVIDE(COALESCE(ss.total_stock, 0), GREATEST(COALESCE(sd.daily_qty, 0), 0.01)) < 14 THEN '追加発注を検討'
            ELSE '現状維持'
          END AS lifecycle_action
        FROM \`tiast-data-platform.raw_nextengine.products\` p
        LEFT JOIN sku_stock ss ON p.goods_id = ss.goods_id
        LEFT JOIN sku_zozo sz ON p.goods_id = sz.goods_id
        LEFT JOIN sku_daily sd ON p.goods_id = sd.goods_id
        LEFT JOIN sku_annual sa ON p.goods_id = sa.goods_id
        LEFT JOIN sku_io sio ON p.goods_id = sio.goods_id
        WHERE p.goods_representation_id = @product_code
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
          selling_price: Number(base.selling_price ?? 0),
          cost_price: Number(base.cost_price ?? 0),
          total_quantity: Number(sales?.total_quantity ?? 0),
          sales_amount: Number(sales?.sales_amount ?? 0),
          gross_profit_rate: Number(sales?.gross_profit_rate ?? 0),
          total_stock: Number(inv?.total_stock ?? 0),
          free_stock: Number(inv?.free_stock ?? 0),
          zozo_stock: Number(inv?.zozo_stock ?? 0),
          own_stock: Number(inv?.own_stock ?? 0),
          daily_sales: Number(inv?.daily_sales ?? 0),
          stock_days: Number(inv?.stock_days ?? 0),
          inventory_status: inv?.inventory_status ?? '',
          lifecycle_stance: inv?.lifecycle_stance ?? '',
          turnover_rate_annual: Number(inv?.turnover_rate_annual ?? 0),
          turnover_days: Number(inv?.turnover_days ?? 0),
          last_io_date: inv?.last_io_date ?? null,
          days_since_last_io: Number(inv?.days_since_last_io ?? 0),
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
