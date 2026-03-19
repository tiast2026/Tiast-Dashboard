import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockSalesMonthlyTrend } from '@/lib/mock-data'

interface TrendRow {
  month: string
  channel_group: string
  sales_amount: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const months = parseInt(searchParams.get('months') || '24', 10)
    const brand = searchParams.get('brand') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockSalesMonthlyTrend(months, brand))
    }

    const cacheKey = buildCacheKey('sales-monthly-trend', {
      months: String(months),
      brand,
    })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? 'AND shop_brand = @brand' : ''

      const query = `
        SELECT
          order_month AS month,
          CASE
            WHEN shop_name IN ('楽天市場', 'RakutenFashion') OR shop_name LIKE '%楽天%' THEN '楽天系'
            WHEN shop_name = '公式' OR shop_name LIKE '%公式%' THEN '公式系'
            WHEN shop_name IN ('TikTok') OR UPPER(shop_name) LIKE '%TIKTOK%' THEN 'TikTok系'
            ELSE 'その他'
          END AS channel_group,
          SUM(sales_amount) AS sales_amount
        FROM ${tableName('mart_sales_by_shop_month')}
        WHERE order_month >= FORMAT_DATE('%Y-%m', DATE_SUB(CURRENT_DATE(), INTERVAL @months MONTH))
          ${brandFilter}
        GROUP BY order_month, channel_group
        ORDER BY order_month ASC, channel_group ASC
      `

      const params: Record<string, unknown> = { months }
      if (brand) {
        params.brand = brand
      }

      return await runQuery<TrendRow>(query, params)
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
