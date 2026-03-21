import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json({ summary: null, products: [] })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('abc-analysis', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''
      const zozoBrand = brand
        ? brand === 'NOAHL' ? "AND LEFT(z.brand_code, 1) = 'n'" : "AND LEFT(z.brand_code, 1) = 'b'"
        : ''

      const rows = await runQuery<{
        product_code: string
        product_name: string
        category: string
        revenue: number
        quantity: number
        gross_profit: number
        cumulative_pct: number
        abc_rank: string
      }>(
        `WITH ne_sales AS (
          SELECT
            p.goods_representation_id AS product_code,
            MAX(p.goods_name) AS product_name,
            MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue,
            SUM(o.quantity) AS quantity,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
              - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            AND p.goods_representation_id IS NOT NULL
            ${brandFilter}
          GROUP BY p.goods_representation_id
        ),
        zozo_sales AS (
          SELECT
            z.ne_goods_representation_id AS product_code,
            MAX(z.product_name) AS product_name,
            MAX(COALESCE(z.child_category, z.parent_category, 'その他')) AS category,
            SUM(z.selling_price * z.order_quantity) AS revenue,
            SUM(z.order_quantity) AS quantity,
            SUM(z.selling_price * z.order_quantity) - SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity) AS gross_profit
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p ON z.ne_goods_id = p.goods_id
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) = @month
            AND z.ne_goods_representation_id IS NOT NULL
            ${zozoBrand}
          GROUP BY z.ne_goods_representation_id
        ),
        combined AS (
          SELECT
            COALESCE(n.product_code, z.product_code) AS product_code,
            COALESCE(n.product_name, z.product_name) AS product_name,
            COALESCE(n.category, z.category) AS category,
            COALESCE(n.revenue, 0) + COALESCE(z.revenue, 0) AS revenue,
            COALESCE(n.quantity, 0) + COALESCE(z.quantity, 0) AS quantity,
            COALESCE(n.gross_profit, 0) + COALESCE(z.gross_profit, 0) AS gross_profit
          FROM ne_sales n
          FULL OUTER JOIN zozo_sales z ON n.product_code = z.product_code
        ),
        ranked AS (
          SELECT *,
            SUM(revenue) OVER (ORDER BY revenue DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
              / SUM(revenue) OVER () AS cumulative_pct
          FROM combined
        )
        SELECT *,
          CASE
            WHEN cumulative_pct <= 0.7 THEN 'A'
            WHEN cumulative_pct <= 0.9 THEN 'B'
            ELSE 'C'
          END AS abc_rank
        FROM ranked
        ORDER BY revenue DESC
        LIMIT 300`,
        { month }
      )

      const aItems = rows.filter(r => r.abc_rank === 'A')
      const bItems = rows.filter(r => r.abc_rank === 'B')
      const cItems = rows.filter(r => r.abc_rank === 'C')
      const totalRevenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0)

      return {
        summary: {
          total_skus: rows.length,
          total_revenue: totalRevenue,
          a_count: aItems.length,
          a_revenue: aItems.reduce((s, r) => s + (Number(r.revenue) || 0), 0),
          b_count: bItems.length,
          b_revenue: bItems.reduce((s, r) => s + (Number(r.revenue) || 0), 0),
          c_count: cItems.length,
          c_revenue: cItems.reduce((s, r) => s + (Number(r.revenue) || 0), 0),
        },
        products: rows,
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[abc-analysis] error:', error)
    return NextResponse.json({ summary: null, products: [] })
  }
}
