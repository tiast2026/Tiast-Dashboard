import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json([])

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('channel-profitability', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''
      const zozoBrand = brand
        ? brand === 'NOAHL' ? "AND LEFT(z.brand_code, 1) = 'n'" : "AND LEFT(z.brand_code, 1) = 'b'"
        : ''

      const neRows = await runQuery<{
        channel: string
        revenue: number
        cost: number
        gross_profit: number
        gross_margin: number
        order_count: number
        avg_order_value: number
        avg_unit_price: number
        quantity: number
      }>(
        `SELECT
          CASE o.receive_order_shop_id
            WHEN 1 THEN '公式' WHEN 7 THEN '公式'
            WHEN 2 THEN '楽天' WHEN 4 THEN '楽天' WHEN 10 THEN '楽天'
            WHEN 3 THEN 'SHOPLIST' WHEN 5 THEN 'Amazon'
            WHEN 6 THEN 'aupay' WHEN 8 THEN 'サステナ' WHEN 9 THEN 'Yahoo!'
            WHEN 11 THEN 'Rakuten Fashion'
            WHEN 12 THEN 'TikTok' WHEN 13 THEN 'TikTok'
            ELSE 'その他'
          END AS channel,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue,
          SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS cost,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
            - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit,
          SAFE_DIVIDE(
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
              - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
          ) AS gross_margin,
          COUNT(DISTINCT o.receive_order_id) AS order_count,
          SAFE_DIVIDE(
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)),
            COUNT(DISTINCT o.receive_order_id)
          ) AS avg_order_value,
          AVG(o.unit_price) AS avg_unit_price,
          SUM(o.quantity) AS quantity
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        WHERE CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
          ${brandFilter}
        GROUP BY 1
        ORDER BY revenue DESC`,
        { month }
      )

      const zozoRows = await runQuery<{
        channel: string
        revenue: number
        cost: number
        gross_profit: number
        gross_margin: number
        order_count: number
        avg_order_value: number
        avg_unit_price: number
        quantity: number
      }>(
        `SELECT
          'ZOZO' AS channel,
          SUM(z.selling_price * z.order_quantity) AS revenue,
          SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity) AS cost,
          SUM(z.selling_price * z.order_quantity) - SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity) AS gross_profit,
          SAFE_DIVIDE(
            SUM(z.selling_price * z.order_quantity) - SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity),
            SUM(z.selling_price * z.order_quantity)
          ) AS gross_margin,
          COUNT(DISTINCT z.order_number) AS order_count,
          SAFE_DIVIDE(SUM(z.selling_price * z.order_quantity), COUNT(DISTINCT z.order_number)) AS avg_order_value,
          AVG(z.selling_price) AS avg_unit_price,
          SUM(z.order_quantity) AS quantity
        FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
        LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p ON z.ne_goods_id = p.goods_id
        WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
          AND z.order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) = @month
          ${zozoBrand}`,
        { month }
      )

      return [...neRows, ...zozoRows.filter(r => (Number(r.revenue) || 0) > 0)]
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[channel-profitability] error:', error)
    return NextResponse.json([])
  }
}
