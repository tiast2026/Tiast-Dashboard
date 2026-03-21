import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json(null)

    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('ltv', { brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      // LTV distribution
      const distribution = await runQuery<{
        ltv_bucket: string
        customer_count: number
        total_revenue: number
        avg_orders: number
        avg_ltv: number
      }>(
        `WITH customer_ltv AS (
          SELECT
            o.purchaser_mail_address AS email,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS lifetime_revenue,
            COUNT(DISTINCT o.receive_order_id) AS order_count,
            MIN(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS first_order,
            MAX(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS last_order,
            DATE_DIFF(MAX(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))), MIN(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))), DAY) AS customer_days
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        )
        SELECT
          CASE
            WHEN lifetime_revenue >= 100000 THEN '10万円以上'
            WHEN lifetime_revenue >= 50000 THEN '5-10万円'
            WHEN lifetime_revenue >= 30000 THEN '3-5万円'
            WHEN lifetime_revenue >= 15000 THEN '1.5-3万円'
            WHEN lifetime_revenue >= 5000 THEN '5千-1.5万円'
            ELSE '5千円未満'
          END AS ltv_bucket,
          COUNT(*) AS customer_count,
          SUM(lifetime_revenue) AS total_revenue,
          AVG(order_count) AS avg_orders,
          AVG(lifetime_revenue) AS avg_ltv
        FROM customer_ltv
        GROUP BY 1
        ORDER BY MIN(lifetime_revenue) DESC`
      )

      // Top customers
      const topCustomers = await runQuery<{
        email_hash: string
        lifetime_revenue: number
        order_count: number
        first_order: string
        last_order: string
        customer_days: number
        avg_order_value: number
        favorite_category: string
      }>(
        `WITH customer_ltv AS (
          SELECT
            o.purchaser_mail_address AS email,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS lifetime_revenue,
            COUNT(DISTINCT o.receive_order_id) AS order_count,
            MIN(LEFT(o.receive_order_date, 10)) AS first_order,
            MAX(LEFT(o.receive_order_date, 10)) AS last_order,
            DATE_DIFF(
              MAX(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))),
              MIN(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))),
              DAY
            ) AS customer_days,
            SAFE_DIVIDE(
              SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)),
              COUNT(DISTINCT o.receive_order_id)
            ) AS avg_order_value
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        ),
        customer_category AS (
          SELECT
            o.purchaser_mail_address AS email,
            COALESCE(p.goods_merchandise_name, 'その他') AS category,
            SUM(o.quantity) AS qty
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.purchaser_mail_address IS NOT NULL
            ${brandFilter}
          GROUP BY 1, 2
          QUALIFY ROW_NUMBER() OVER (PARTITION BY o.purchaser_mail_address ORDER BY SUM(o.quantity) DESC) = 1
        )
        SELECT
          MD5(c.email) AS email_hash,
          c.lifetime_revenue,
          c.order_count,
          c.first_order,
          c.last_order,
          c.customer_days,
          c.avg_order_value,
          COALESCE(cc.category, '-') AS favorite_category
        FROM customer_ltv c
        LEFT JOIN customer_category cc ON c.email = cc.email
        ORDER BY c.lifetime_revenue DESC
        LIMIT 50`
      )

      // Cohort retention (by first order month)
      const cohort = await runQuery<{
        cohort_month: string
        months_since: number
        customers: number
        revenue: number
      }>(
        `WITH customer_first AS (
          SELECT
            o.purchaser_mail_address AS email,
            FORMAT_DATE('%Y-%m', MIN(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)))) AS cohort_month
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            ${brandFilter}
          GROUP BY o.purchaser_mail_address
        ),
        monthly_activity AS (
          SELECT
            o.purchaser_mail_address AS email,
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.purchaser_mail_address IS NOT NULL
            AND o.purchaser_mail_address != ''
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 730 DAY))
            ${brandFilter}
          GROUP BY 1, 2
        )
        SELECT
          cf.cohort_month,
          DATE_DIFF(
            PARSE_DATE('%Y-%m', ma.order_month),
            PARSE_DATE('%Y-%m', cf.cohort_month),
            MONTH
          ) AS months_since,
          COUNT(DISTINCT ma.email) AS customers,
          SUM(ma.revenue) AS revenue
        FROM monthly_activity ma
        JOIN customer_first cf ON ma.email = cf.email
        WHERE cf.cohort_month >= FORMAT_DATE('%Y-%m', DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH))
        GROUP BY 1, 2
        HAVING DATE_DIFF(PARSE_DATE('%Y-%m', ma.order_month), PARSE_DATE('%Y-%m', cf.cohort_month), MONTH) <= 12
        ORDER BY 1, 2`
      )

      return { distribution, topCustomers, cohort }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[ltv] error:', error)
    return NextResponse.json(null)
  }
}
