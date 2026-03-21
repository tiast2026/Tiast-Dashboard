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

    const key = buildCacheKey('rakuten-cost-breakdown', { month, shopName })
    const data = await cachedQuery(key, async () => {
      const where = ['FORMAT_DATE("%Y-%m", date) = @month']
      const params: Record<string, string> = { month }

      if (shopName) {
        where.push('shop_name LIKE @shopPattern')
        params.shopPattern = `%${shopName}%`
      }

      const rows = await runQuery<{
        total_sales: number
        tax_amount: number
        shipping_fee: number
        payment_fee: number
        wrapping_fee: number
        coupon_discount_store: number
        coupon_discount_rakuten: number
        free_shipping_coupon: number
        points_cost: number
      }>(
        `SELECT
          SUM(sales_amount) as total_sales,
          SUM(tax_amount) as tax_amount,
          SUM(shipping_fee) as shipping_fee,
          SUM(payment_fee) as payment_fee,
          SUM(wrapping_fee) as wrapping_fee,
          SUM(coupon_discount_store) as coupon_discount_store,
          SUM(coupon_discount_rakuten) as coupon_discount_rakuten,
          SUM(free_shipping_coupon) as free_shipping_coupon,
          SUM(points_cost) as points_cost
        FROM ${tableName('rakuten_store_data')}
        WHERE ${where.join(' AND ')}`,
        params
      )

      return rows[0] || null
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[rakuten-cost-breakdown] error:', error)
    return NextResponse.json(null)
  }
}
