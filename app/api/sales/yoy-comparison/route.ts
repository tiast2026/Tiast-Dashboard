import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockYoyComparison } from '@/lib/mock-data'

function getLastYearMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${parseInt(y) - 1}-${m}`
}

interface YoyComparisonRow {
  brand: string
  channel: string
  current_sales: number
  previous_year_sales: number
  yoy_ratio: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month')
    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 })
    }

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockYoyComparison(month))
    }

    const lastYearMonth = getLastYearMonth(month)

    const cacheKey = buildCacheKey('sales-yoy-comparison', { month })

    const data = await cachedQuery(cacheKey, async () => {
      const query = `
        SELECT
          COALESCE(cur.shop_brand, prev.shop_brand) AS brand,
          COALESCE(cur.shop_name, prev.shop_name) AS channel,
          IFNULL(cur.sales_amount, 0) AS current_sales,
          IFNULL(prev.sales_amount, 0) AS previous_year_sales,
          SAFE_DIVIDE(cur.sales_amount, prev.sales_amount) AS yoy_ratio
        FROM (
          SELECT
            shop_brand,
            shop_name,
            SUM(sales_amount) AS sales_amount
          FROM ${tableName('t_sales_by_shop_month')}
          WHERE order_month = @month
          GROUP BY shop_brand, shop_name
        ) cur
        FULL OUTER JOIN (
          SELECT
            shop_brand,
            shop_name,
            SUM(sales_amount) AS sales_amount
          FROM ${tableName('t_sales_by_shop_month')}
          WHERE order_month = @lastYearMonth
          GROUP BY shop_brand, shop_name
        ) prev
        ON cur.shop_brand = prev.shop_brand AND cur.shop_name = prev.shop_name
        ORDER BY current_sales DESC
      `

      return await runQuery<YoyComparisonRow>(query, { month, lastYearMonth })
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
