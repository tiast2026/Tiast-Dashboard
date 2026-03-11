import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockBrandComposition } from '@/lib/mock-data'

interface BrandCompositionRow {
  brand: string
  sales_amount: number
  ratio: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month')
    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 })
    }

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockBrandComposition(month))
    }

    const cacheKey = buildCacheKey('sales-brand-composition', { month })

    const data = await cachedQuery(cacheKey, async () => {
      const query = `
        SELECT
          brand,
          SUM(sales_amount) AS sales_amount,
          SAFE_DIVIDE(SUM(sales_amount), SUM(SUM(sales_amount)) OVER ()) AS ratio
        FROM ${tableName('mart_sales_by_brand_month')}
        WHERE order_month = @month
        GROUP BY brand
        ORDER BY sales_amount DESC
      `

      return await runQuery<BrandCompositionRow>(query, { month })
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
