import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface SkuTrendRow {
  goods_id: string
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
    const months = Math.min(Number(searchParams.get('months') || '12'), 24)

    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [] })
    }

    const cacheKey = buildCacheKey('sku-trends', { product_code, months: String(months) })

    const data = await cachedQuery(cacheKey, async () => {
      const query = `
        SELECT
          o.goods_id,
          FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS month,
          SUM(o.quantity) AS quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE p.goods_representation_id = @product_code
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH)
        GROUP BY o.goods_id, month
        ORDER BY o.goods_id, month
      `

      return await runQuery<SkuTrendRow>(query, { product_code })
    })

    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('SKU trends error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
