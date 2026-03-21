import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json(null)

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('basket-analysis', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      // Cross-sell pairs
      const pairs = await runQuery<{
        product_a: string
        product_a_name: string
        product_b: string
        product_b_name: string
        pair_count: number
        support: number
        confidence_a_to_b: number
        confidence_b_to_a: number
      }>(
        `WITH order_products AS (
          SELECT DISTINCT
            o.receive_order_id,
            p.goods_representation_id AS product_code,
            MAX(p.goods_name) AS product_name
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            AND p.goods_representation_id IS NOT NULL
            ${brandFilter}
          GROUP BY o.receive_order_id, p.goods_representation_id
        ),
        total_orders AS (
          SELECT COUNT(DISTINCT receive_order_id) AS total FROM order_products
        ),
        product_counts AS (
          SELECT product_code, COUNT(DISTINCT receive_order_id) AS order_count
          FROM order_products
          GROUP BY product_code
        ),
        pairs AS (
          SELECT
            a.product_code AS product_a,
            MAX(a.product_name) AS product_a_name,
            b.product_code AS product_b,
            MAX(b.product_name) AS product_b_name,
            COUNT(DISTINCT a.receive_order_id) AS pair_count
          FROM order_products a
          JOIN order_products b ON a.receive_order_id = b.receive_order_id AND a.product_code < b.product_code
          GROUP BY a.product_code, b.product_code
          HAVING COUNT(DISTINCT a.receive_order_id) >= 2
        )
        SELECT
          p.product_a,
          p.product_a_name,
          p.product_b,
          p.product_b_name,
          p.pair_count,
          SAFE_DIVIDE(p.pair_count, t.total) AS support,
          SAFE_DIVIDE(p.pair_count, pa.order_count) AS confidence_a_to_b,
          SAFE_DIVIDE(p.pair_count, pb.order_count) AS confidence_b_to_a
        FROM pairs p
        CROSS JOIN total_orders t
        JOIN product_counts pa ON p.product_a = pa.product_code
        JOIN product_counts pb ON p.product_b = pb.product_code
        ORDER BY p.pair_count DESC
        LIMIT 50`,
        { month }
      )

      // Basket size distribution
      const basketSize = await runQuery<{
        items_in_order: number
        order_count: number
        avg_revenue: number
      }>(
        `WITH order_items AS (
          SELECT
            o.receive_order_id,
            COUNT(DISTINCT p.goods_representation_id) AS items,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            ${brandFilter}
          GROUP BY o.receive_order_id
        )
        SELECT
          LEAST(items, 5) AS items_in_order,
          COUNT(*) AS order_count,
          AVG(revenue) AS avg_revenue
        FROM order_items
        GROUP BY 1
        ORDER BY 1`,
        { month }
      )

      return { pairs, basketSize }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[basket-analysis] error:', error)
    return NextResponse.json(null)
  }
}
