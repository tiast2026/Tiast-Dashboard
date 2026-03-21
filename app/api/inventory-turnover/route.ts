import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json({ summary: null, products: [] })

    const { searchParams } = new URL(request.url)
    const brand = searchParams.get('brand') || ''
    const months = searchParams.get('months') || '3'

    const key = buildCacheKey('inventory-turnover', { brand, months })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(s.goods_id, 1) = 'n'" : "AND LEFT(s.goods_id, 1) = 'b'"
        : ''
      const brandFilterO = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      const rows = await runQuery<{
        goods_id: string
        product_name: string
        category: string
        current_stock: number
        avg_monthly_sales: number
        turnover_days: number
        last_sold_date: string
        days_since_last_sale: number
        stock_value: number
        abc_rank: string
      }>(
        `WITH current_stock AS (
          SELECT
            s.goods_id,
            SUM(s.stock_quantity) AS current_stock,
            SUM(s.stock_free_quantity) AS free_stock
          FROM \`tiast-data-platform.raw_nextengine.stock\` s
          WHERE s.stock_quantity > 0
            ${brandFilter}
          GROUP BY s.goods_id
        ),
        recent_sales AS (
          SELECT
            o.goods_id,
            SUM(o.quantity) AS total_qty,
            COUNT(DISTINCT FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)))) AS active_months,
            MAX(LEFT(o.receive_order_date, 10)) AS last_sold_date
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${parseInt(months) * 30} DAY))
            ${brandFilterO}
          GROUP BY o.goods_id
        )
        SELECT
          cs.goods_id,
          MAX(p.goods_name) AS product_name,
          MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
          MAX(cs.current_stock) AS current_stock,
          SAFE_DIVIDE(SUM(rs.total_qty), ${parseInt(months)}) AS avg_monthly_sales,
          CASE
            WHEN SAFE_DIVIDE(SUM(rs.total_qty), ${parseInt(months)}) > 0
            THEN SAFE_DIVIDE(MAX(cs.current_stock), SAFE_DIVIDE(SUM(rs.total_qty), ${parseInt(months)})) * 30
            ELSE 9999
          END AS turnover_days,
          MAX(rs.last_sold_date) AS last_sold_date,
          DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', MAX(rs.last_sold_date)), DAY) AS days_since_last_sale,
          MAX(cs.current_stock) * COALESCE(MAX(p.goods_cost_price), 0) AS stock_value,
          CASE
            WHEN SAFE_DIVIDE(SUM(rs.total_qty), ${parseInt(months)}) >= 10 THEN 'A'
            WHEN SAFE_DIVIDE(SUM(rs.total_qty), ${parseInt(months)}) >= 3 THEN 'B'
            ELSE 'C'
          END AS abc_rank
        FROM current_stock cs
        LEFT JOIN recent_sales rs ON cs.goods_id = rs.goods_id
        LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p ON cs.goods_id = p.goods_id
        GROUP BY cs.goods_id
        ORDER BY MAX(cs.current_stock) * COALESCE(MAX(p.goods_cost_price), 0) DESC
        LIMIT 200`,
      )

      // Summary
      const totalStock = rows.reduce((s, r) => s + (Number(r.current_stock) || 0), 0)
      const totalStockValue = rows.reduce((s, r) => s + (Number(r.stock_value) || 0), 0)
      const deadStock = rows.filter(r => (Number(r.turnover_days) || 9999) > 90)
      const deadStockValue = deadStock.reduce((s, r) => s + (Number(r.stock_value) || 0), 0)
      const avgTurnover = rows.filter(r => (Number(r.turnover_days) || 9999) < 9999)
      const avgDays = avgTurnover.length > 0
        ? avgTurnover.reduce((s, r) => s + (Number(r.turnover_days) || 0), 0) / avgTurnover.length
        : 0

      return {
        summary: {
          total_skus: rows.length,
          total_stock: totalStock,
          total_stock_value: totalStockValue,
          dead_stock_skus: deadStock.length,
          dead_stock_value: deadStockValue,
          dead_stock_rate: totalStockValue > 0 ? deadStockValue / totalStockValue : 0,
          avg_turnover_days: avgDays,
        },
        products: rows,
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[inventory-turnover] error:', error)
    return NextResponse.json({ summary: null, products: [] })
  }
}
