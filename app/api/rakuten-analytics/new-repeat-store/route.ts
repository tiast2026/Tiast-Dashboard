import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const shopName = searchParams.get('shop_name') || ''

    const key = buildCacheKey('rakuten-nr-store', { shopName })
    const data = await cachedQuery(key, async () => {
      const where: string[] = []
      const params: Record<string, string> = {}

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

      return runQuery(
        `SELECT
          month,
          SUM(new_buyers) as new_buyers,
          SUM(new_sales) as new_sales,
          SUM(new_sales_count) as new_sales_count,
          SAFE_DIVIDE(SUM(new_sales), NULLIF(SUM(new_sales_count), 0)) as new_avg_order_value,
          SUM(repeat_buyers) as repeat_buyers,
          SUM(repeat_sales) as repeat_sales,
          SUM(repeat_sales_count) as repeat_sales_count,
          SAFE_DIVIDE(SUM(repeat_sales), NULLIF(SUM(repeat_sales_count), 0)) as repeat_avg_order_value,
          SAFE_DIVIDE(SUM(repeat_buyers), NULLIF(SUM(new_buyers) + SUM(repeat_buyers), 0)) as repeat_rate
        FROM ${tableName('rakuten_new_repeat_store')}
        ${whereClause}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 24`,
        params
      )
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-nr-store] error:', error)
    return NextResponse.json([])
  }
}
