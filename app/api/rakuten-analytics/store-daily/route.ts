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

    const key = buildCacheKey('rakuten-store-daily', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      return runQuery(
        `SELECT
          CAST(date AS STRING) as date,
          SUM(sales_amount) as sales_amount,
          SUM(sales_count) as order_count,
          SUM(access_count) as access_count,
          SUM(unique_users) as unique_users,
          SUM(COALESCE(new_buyers, 0) + COALESCE(repeat_buyers, 0)) as total_buyers,
          SUM(new_buyers) as new_buyers,
          SUM(repeat_buyers) as repeat_buyers,
          SAFE_DIVIDE(SUM(sales_count), NULLIF(SUM(unique_users), 0)) as conversion_rate,
          SAFE_DIVIDE(SUM(sales_amount), NULLIF(SUM(sales_count), 0)) as avg_order_value,
          SUM(deal_sales_amount) as deal_sales_amount,
          SUM(deal_sales_count) as deal_order_count,
          SUM(points_sales_amount) as points_sales_amount,
          SUM(points_cost) as points_cost,
          SUM(coupon_discount_store) as coupon_store,
          SUM(coupon_discount_rakuten) as coupon_rakuten
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}
        GROUP BY date
        ORDER BY date`,
        params
      )
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-store-daily] error:', error)
    return NextResponse.json([])
  }
}
