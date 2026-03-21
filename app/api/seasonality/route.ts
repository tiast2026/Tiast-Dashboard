import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json(null)

    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('seasonality', { brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''
      const zozoBrand = brand
        ? brand === 'NOAHL' ? "AND LEFT(z.brand_code, 1) = 'n'" : "AND LEFT(z.brand_code, 1) = 'b'"
        : ''

      // Category × Month over 2 years
      const categoryTrend = await runQuery<{
        year: string
        month_num: number
        category: string
        revenue: number
        quantity: number
        order_count: number
      }>(
        `WITH ne_data AS (
          SELECT
            FORMAT_DATE('%Y', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS year,
            EXTRACT(MONTH FROM PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS month_num,
            COALESCE(p.goods_merchandise_name, 'その他') AS category,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue,
            SUM(o.quantity) AS quantity,
            COUNT(DISTINCT o.receive_order_id) AS order_count
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 730 DAY))
            ${brandFilter}
          GROUP BY 1, 2, 3
        ),
        zozo_data AS (
          SELECT
            FORMAT_DATE('%Y', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS year,
            EXTRACT(MONTH FROM PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS month_num,
            COALESCE(z.child_category, z.parent_category, 'その他') AS category,
            SUM(z.selling_price * z.order_quantity) AS revenue,
            SUM(z.order_quantity) AS quantity,
            COUNT(DISTINCT z.order_number) AS order_count
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY)
            ${zozoBrand}
          GROUP BY 1, 2, 3
        )
        SELECT * FROM ne_data
        UNION ALL
        SELECT * FROM zozo_data
        ORDER BY year, month_num`
      )

      // Overall monthly trend for forecasting
      const monthlyTrend = await runQuery<{
        order_month: string
        revenue: number
        quantity: number
        order_count: number
        yoy_revenue: number | null
      }>(
        `WITH ne_monthly AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue,
            SUM(o.quantity) AS quantity,
            COUNT(DISTINCT o.receive_order_id) AS order_count
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 730 DAY))
            ${brandFilter}
          GROUP BY 1
        ),
        zozo_monthly AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
            SUM(z.selling_price * z.order_quantity) AS revenue,
            SUM(z.order_quantity) AS quantity,
            COUNT(DISTINCT z.order_number) AS order_count
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY)
            ${zozoBrand}
          GROUP BY 1
        ),
        combined AS (
          SELECT
            COALESCE(n.order_month, z.order_month) AS order_month,
            COALESCE(n.revenue, 0) + COALESCE(z.revenue, 0) AS revenue,
            COALESCE(n.quantity, 0) + COALESCE(z.quantity, 0) AS quantity,
            COALESCE(n.order_count, 0) + COALESCE(z.order_count, 0) AS order_count
          FROM ne_monthly n
          FULL OUTER JOIN zozo_monthly z ON n.order_month = z.order_month
        )
        SELECT
          c.order_month,
          c.revenue,
          c.quantity,
          c.order_count,
          prev.revenue AS yoy_revenue
        FROM combined c
        LEFT JOIN combined prev ON FORMAT_DATE('%Y-%m',
          DATE_ADD(PARSE_DATE('%Y-%m', c.order_month), INTERVAL -12 MONTH)
        ) = prev.order_month
        ORDER BY c.order_month`
      )

      return { categoryTrend, monthlyTrend }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[seasonality] error:', error)
    return NextResponse.json(null)
  }
}
