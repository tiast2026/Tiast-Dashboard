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

    const key = buildCacheKey('rakuten-coupon', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      const rows = await runQuery<{
        total_sales: number
        deal_sales: number
        deal_orders: number
        deal_conversion_rate: number
        normal_sales: number
        normal_orders: number
        normal_conversion_rate: number
        points_sales: number
        points_cost: number
        coupon_store: number
        coupon_rakuten: number
        free_shipping: number
      }>(
        `SELECT
          SUM(sales_amount) as total_sales,
          SUM(deal_sales_amount) as deal_sales,
          SUM(deal_sales_count) as deal_orders,
          SAFE_DIVIDE(SUM(deal_sales_count), NULLIF(SUM(deal_unique_users), 0)) as deal_conversion_rate,
          SUM(sales_amount) - SUM(deal_sales_amount) as normal_sales,
          SUM(sales_count) - SUM(deal_sales_count) as normal_orders,
          SAFE_DIVIDE(SUM(sales_count) - SUM(deal_sales_count), NULLIF(SUM(unique_users) - SUM(deal_unique_users), 0)) as normal_conversion_rate,
          SUM(points_sales_amount) as points_sales,
          SUM(points_cost) as points_cost,
          SUM(coupon_discount_store) as coupon_store,
          SUM(coupon_discount_rakuten) as coupon_rakuten,
          SUM(free_shipping_coupon) as free_shipping
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}`,
        params
      )

      return rows[0] || null
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-coupon] error:', error)
    return NextResponse.json(null)
  }
}
