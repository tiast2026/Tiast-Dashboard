import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('pricing-genre-monthly', { brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL'
          ? "AND LEFT(o.goods_id, 1) = 'n'"
          : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''
      const zozoBrandFilter = brand
        ? brand === 'NOAHL'
          ? "AND LEFT(z.brand_code, 1) = 'n'"
          : "AND LEFT(z.brand_code, 1) = 'b'"
        : ''

      const rows = await runQuery<{
        order_month: string
        category: string
        avg_price: number
        min_price: number
        max_price: number
        avg_list_price: number
        avg_discount_rate: number
        quantity: number
        revenue: number
        full_price_rate: number
      }>(
        `WITH ne_data AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
            COALESCE(p.goods_merchandise_name, 'その他') AS category,
            o.unit_price AS selling_price,
            p.goods_selling_price AS list_price,
            o.quantity,
            o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS revenue
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND o.unit_price > 0
            AND p.goods_selling_price > 0
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY))
            ${brandFilter}
        ),
        zozo_data AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
            COALESCE(z.child_category, z.parent_category, 'その他') AS category,
            z.selling_price,
            z.proper_price AS list_price,
            z.order_quantity AS quantity,
            z.selling_price * z.order_quantity AS revenue
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND z.selling_price > 0
            AND z.proper_price > 0
            AND PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
            ${zozoBrandFilter}
        ),
        all_data AS (
          SELECT * FROM ne_data
          UNION ALL
          SELECT * FROM zozo_data
        )
        SELECT
          order_month,
          category,
          AVG(selling_price) AS avg_price,
          MIN(selling_price) AS min_price,
          MAX(selling_price) AS max_price,
          AVG(list_price) AS avg_list_price,
          AVG(IF(selling_price < list_price, 1 - SAFE_DIVIDE(selling_price, list_price), 0)) AS avg_discount_rate,
          SUM(quantity) AS quantity,
          SUM(revenue) AS revenue,
          SAFE_DIVIDE(
            COUNTIF(selling_price >= list_price),
            COUNT(*)
          ) AS full_price_rate
        FROM all_data
        WHERE category != 'その他'
        GROUP BY order_month, category
        HAVING SUM(quantity) >= 3
        ORDER BY order_month, SUM(revenue) DESC`
      )

      return rows
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[pricing-genre-monthly] error:', error)
    return NextResponse.json([])
  }
}
