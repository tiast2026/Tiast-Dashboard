import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json(null)
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const shopName = searchParams.get('shop_name') || ''

    const key = buildCacheKey('rakuten-funnel', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      const rows = await runQuery<{
        access_count: number
        unique_users: number
        total_buyers: number
        order_count: number
      }>(
        `SELECT
          SUM(access_count) as access_count,
          SUM(unique_users) as unique_users,
          SUM(COALESCE(new_buyers, 0) + COALESCE(repeat_buyers, 0)) as total_buyers,
          SUM(sales_count) as order_count
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}`,
        params
      )

      return rows[0] || null
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-funnel] error:', error)
    return NextResponse.json(null)
  }
}
