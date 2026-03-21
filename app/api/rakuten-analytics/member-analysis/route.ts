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

    const key = buildCacheKey('rakuten-member', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      const rows = await runQuery<{
        buyers_member: number
        buyers_non_member: number
        deal_new_buyers: number
        deal_repeat_buyers: number
        deal_access_count: number
        deal_buyers_member: number
        deal_buyers_non_member: number
        points_sales_count: number
        total_order_count: number
      }>(
        `SELECT
          SUM(buyers_member) as buyers_member,
          SUM(buyers_non_member) as buyers_non_member,
          SUM(deal_new_buyers) as deal_new_buyers,
          SUM(deal_repeat_buyers) as deal_repeat_buyers,
          SUM(deal_access_count) as deal_access_count,
          SUM(deal_buyers_member) as deal_buyers_member,
          SUM(deal_buyers_non_member) as deal_buyers_non_member,
          SUM(points_sales_count) as points_sales_count,
          SUM(sales_count) as total_order_count
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}`,
        params
      )

      return rows[0] || null
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-member] error:', error)
    return NextResponse.json(null)
  }
}
