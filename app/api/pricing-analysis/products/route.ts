import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('pricing-products', { month, brand })
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
        product_code: string
        product_name: string
        list_price: number
        total_quantity: number
        total_revenue: number
        full_price_quantity: number
        discounted_quantity: number
        avg_selling_price: number
        min_selling_price: number
        max_discount_rate: number
        avg_discount_rate: number
        min_price_date: string
        days_since_min_price: number
        channels_sold: string
      }>(
        `WITH ne_items AS (
          SELECT
            p.goods_representation_id AS product_code,
            MAX(p.goods_name) AS product_name,
            MAX(p.goods_selling_price) AS list_price,
            o.unit_price AS selling_price,
            o.quantity,
            o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS revenue,
            PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) AS order_date,
            CASE o.receive_order_shop_id
              WHEN 1 THEN '公式' WHEN 7 THEN '公式'
              WHEN 2 THEN '楽天' WHEN 4 THEN '楽天' WHEN 10 THEN '楽天'
              WHEN 11 THEN 'RF' WHEN 12 THEN 'TikTok' WHEN 13 THEN 'TikTok'
              ELSE 'その他'
            END AS channel
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            AND p.goods_selling_price > 0
            AND o.unit_price > 0
            AND p.goods_representation_id IS NOT NULL
            ${brandFilter}
        ),
        zozo_items AS (
          SELECT
            z.ne_goods_representation_id AS product_code,
            MAX(z.product_name) AS product_name,
            MAX(z.proper_price) AS list_price,
            z.selling_price,
            z.order_quantity AS quantity,
            z.selling_price * z.order_quantity AS revenue,
            PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) AS order_date,
            'ZOZO' AS channel
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) = @month
            AND z.proper_price > 0
            AND z.selling_price > 0
            AND z.ne_goods_representation_id IS NOT NULL
            ${zozoBrandFilter}
        ),
        all_items AS (
          SELECT * FROM ne_items
          UNION ALL
          SELECT * FROM zozo_items
        ),
        -- Historical min price (past 12 months)
        ne_history AS (
          SELECT
            p.goods_representation_id AS product_code,
            MIN(o.unit_price) AS min_price,
            MIN(IF(o.unit_price = (
              SELECT MIN(o2.unit_price)
              FROM \`tiast-data-platform.raw_nextengine.orders\` o2
              JOIN \`tiast-data-platform.raw_nextengine.products\` p2 ON o2.goods_id = p2.goods_id
              WHERE p2.goods_representation_id = p.goods_representation_id
                AND CAST(o2.cancel_type_id AS STRING) = '0'
                AND CAST(o2.row_cancel_flag AS STRING) = '0'
                AND o2.unit_price > 0
                AND o2.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY))
            ), PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)), NULL)) AS min_price_date
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.unit_price > 0
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY))
            ${brandFilter}
          GROUP BY p.goods_representation_id
        )
        SELECT
          a.product_code,
          MAX(a.product_name) AS product_name,
          MAX(a.list_price) AS list_price,
          SUM(a.quantity) AS total_quantity,
          SUM(a.revenue) AS total_revenue,
          SUM(IF(a.selling_price >= a.list_price, a.quantity, 0)) AS full_price_quantity,
          SUM(IF(a.selling_price < a.list_price, a.quantity, 0)) AS discounted_quantity,
          AVG(a.selling_price) AS avg_selling_price,
          MIN(a.selling_price) AS min_selling_price,
          MAX(IF(a.selling_price < a.list_price, 1 - SAFE_DIVIDE(a.selling_price, a.list_price), 0)) AS max_discount_rate,
          AVG(IF(a.selling_price < a.list_price, 1 - SAFE_DIVIDE(a.selling_price, a.list_price), NULL)) AS avg_discount_rate,
          CAST(h.min_price_date AS STRING) AS min_price_date,
          DATE_DIFF(CURRENT_DATE(), h.min_price_date, DAY) AS days_since_min_price,
          STRING_AGG(DISTINCT a.channel, ', ' ORDER BY a.channel) AS channels_sold
        FROM all_items a
        LEFT JOIN ne_history h ON a.product_code = h.product_code
        GROUP BY a.product_code, h.min_price_date
        ORDER BY SUM(a.revenue) DESC
        LIMIT 100`,
        { month }
      )

      return rows
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[pricing-products] error:', error)
    return NextResponse.json([])
  }
}
