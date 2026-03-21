import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json(null)

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('repeat-purchase', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      const rows = await runQuery<{
        customer_type: string
        customer_count: number
        order_count: number
        revenue: number
        avg_order_value: number
        avg_items_per_order: number
      }>(
        `WITH customer_orders AS (
          SELECT
            o.purchaser_mail_address AS email,
            MIN(FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)))) AS first_month,
            COUNT(DISTINCT o.receive_order_id) AS total_orders,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS total_revenue,
            SUM(o.quantity) AS total_items
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        ),
        month_orders AS (
          SELECT
            o.purchaser_mail_address AS email,
            COUNT(DISTINCT o.receive_order_id) AS month_orders,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS month_revenue,
            SUM(o.quantity) AS month_items
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        )
        SELECT
          CASE
            WHEN co.first_month = @month THEN '新規'
            WHEN co.total_orders >= 4 THEN 'ロイヤル(4回以上)'
            WHEN co.total_orders >= 2 THEN 'リピート(2-3回)'
            ELSE '新規'
          END AS customer_type,
          COUNT(DISTINCT mo.email) AS customer_count,
          SUM(mo.month_orders) AS order_count,
          SUM(mo.month_revenue) AS revenue,
          SAFE_DIVIDE(SUM(mo.month_revenue), SUM(mo.month_orders)) AS avg_order_value,
          SAFE_DIVIDE(SUM(mo.month_items), SUM(mo.month_orders)) AS avg_items_per_order
        FROM month_orders mo
        JOIN customer_orders co ON mo.email = co.email
        GROUP BY 1
        ORDER BY revenue DESC`,
        { month }
      )

      // Monthly trend
      const trend = await runQuery<{
        order_month: string
        new_customers: number
        repeat_customers: number
        total_customers: number
        repeat_rate: number
        repeat_revenue_pct: number
      }>(
        `WITH customer_first AS (
          SELECT
            o.purchaser_mail_address AS email,
            MIN(FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)))) AS first_month
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        ),
        monthly AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
            o.purchaser_mail_address AS email,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY))
            ${brandFilter}
          GROUP BY 1, 2
        )
        SELECT
          m.order_month,
          COUNTIF(cf.first_month = m.order_month) AS new_customers,
          COUNTIF(cf.first_month < m.order_month) AS repeat_customers,
          COUNT(DISTINCT m.email) AS total_customers,
          SAFE_DIVIDE(COUNTIF(cf.first_month < m.order_month), COUNT(DISTINCT m.email)) AS repeat_rate,
          SAFE_DIVIDE(
            SUM(IF(cf.first_month < m.order_month, m.revenue, 0)),
            SUM(m.revenue)
          ) AS repeat_revenue_pct
        FROM monthly m
        JOIN customer_first cf ON m.email = cf.email
        GROUP BY m.order_month
        ORDER BY m.order_month`
      )

      return { segments: rows, trend }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[repeat-purchase] error:', error)
    return NextResponse.json(null)
  }
}
