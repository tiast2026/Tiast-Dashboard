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

    const key = buildCacheKey('rakuten-device', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month', "device != '全デバイス'"]
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      return runQuery(
        `SELECT
          device,
          SUM(sales_amount) as sales_amount,
          SUM(sales_count) as order_count,
          SUM(access_count) as access_count,
          SUM(unique_users) as unique_users,
          SAFE_DIVIDE(SUM(sales_count), NULLIF(SUM(unique_users), 0)) as conversion_rate,
          SAFE_DIVIDE(SUM(sales_amount), NULLIF(SUM(sales_count), 0)) as avg_order_value
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}
        GROUP BY device
        ORDER BY sales_amount DESC`,
        params
      )
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-device] error:', error)
    return NextResponse.json([])
  }
}
