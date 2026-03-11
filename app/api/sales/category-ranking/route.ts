import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockCategoryRanking } from '@/lib/mock-data'

interface CategoryRankingRow {
  category: string
  sales_amount: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month')
    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 })
    }

    const brand = searchParams.get('brand') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockCategoryRanking(month, brand))
    }

    const cacheKey = buildCacheKey('sales-category-ranking', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? 'AND brand = @brand' : ''

      const query = `
        SELECT
          category,
          SUM(sales_amount) AS sales_amount
        FROM ${tableName('t_sales_by_brand_month')}
        WHERE order_month = @month
          ${brandFilter}
        GROUP BY category
        ORDER BY sales_amount DESC
        LIMIT 10
      `

      const params: Record<string, unknown> = { month }
      if (brand) {
        params.brand = brand
      }

      return await runQuery<CategoryRankingRow>(query, params)
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
