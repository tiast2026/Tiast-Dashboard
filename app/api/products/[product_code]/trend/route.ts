import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface TrendRow {
  month: string
  quantity: number
  sales_amount: number
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ product_code: string }> }
) {
  try {
    const { product_code } = await params
    const { searchParams } = request.nextUrl
    const goods_id = searchParams.get('goods_id') || null
    const months = Math.min(Number(searchParams.get('months') || '12'), 24)

    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], prev_year: [] })
    }

    const level = goods_id ? 'sku' : 'product'
    const cacheKey = buildCacheKey('product-trend', { product_code, goods_id: goods_id || '', months: String(months) })

    const data = await cachedQuery(cacheKey, async () => {
      const filterCol = level === 'sku' ? 'o.goods_id' : 'p.goods_representation_id'
      const filterVal = level === 'sku' ? goods_id : product_code
      const paramName = level === 'sku' ? 'goods_id' : 'product_code'

      // Monthly sales for the last N months
      const trendQuery = `
        SELECT
          FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS month,
          SUM(o.quantity) AS quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE ${filterCol} = @${paramName}
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH)
        GROUP BY month
        ORDER BY month
      `

      // Previous year same months for comparison
      const prevYearQuery = `
        SELECT
          FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)), INTERVAL 12 MONTH)) AS month,
          SUM(o.quantity) AS quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE ${filterCol} = @${paramName}
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months + 12} MONTH)
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) < DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
        GROUP BY month
        ORDER BY month
      `

      const queryParams = level === 'sku' ? { goods_id: filterVal! } : { product_code: filterVal! }

      const [trendRows, prevYearRows] = await Promise.all([
        runQuery<TrendRow>(trendQuery, queryParams),
        runQuery<TrendRow>(prevYearQuery, queryParams).catch(() => [] as TrendRow[]),
      ])

      return { data: trendRows, prev_year: prevYearRows }
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Product trend error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
