import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const shopName = searchParams.get('shop_name') || ''

    const key = buildCacheKey('rakuten-day-of-week', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      return runQuery(
        `SELECT
          day_of_week,
          SUM(sales_amount) as sales_amount,
          SUM(sales_count) as order_count,
          SUM(access_count) as access_count,
          SUM(unique_users) as unique_users,
          SAFE_DIVIDE(SUM(sales_count), NULLIF(SUM(unique_users), 0)) as conversion_rate,
          SAFE_DIVIDE(SUM(sales_amount), NULLIF(SUM(sales_count), 0)) as avg_order_value,
          COUNT(DISTINCT date) as day_count
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}
        GROUP BY day_of_week
        ORDER BY CASE day_of_week
          WHEN '月' THEN 1 WHEN '火' THEN 2 WHEN '水' THEN 3
          WHEN '木' THEN 4 WHEN '金' THEN 5 WHEN '土' THEN 6
          WHEN '日' THEN 7 ELSE 8 END`,
        params
      )
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-day-of-week] error:', error)
    return NextResponse.json([])
  }
}
