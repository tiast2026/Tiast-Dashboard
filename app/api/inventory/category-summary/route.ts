import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockCategorySummary } from '@/lib/mock-data'

interface CategorySummaryRow {
  category: string
  brand: string
  stock_retail_value: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const brand = searchParams.get('brand') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockCategorySummary(brand))
    }

    const cacheKey = buildCacheKey('inventory-category-summary', { brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? 'WHERE brand = @brand' : ''

      const query = `
        SELECT
          category,
          brand,
          COALESCE(SUM(stock_retail_value), 0) AS stock_retail_value
        FROM ${tableName('t_md_dashboard')}
        ${brandFilter}
        GROUP BY category, brand
        ORDER BY stock_retail_value DESC
      `

      const params: Record<string, unknown> = {}
      if (brand) {
        params.brand = brand
      }

      return await runQuery<CategorySummaryRow>(query, params)
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
