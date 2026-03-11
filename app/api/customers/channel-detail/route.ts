import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockChannelDetail } from '@/lib/mock-data'

interface DetailRow {
  shop_name: string
  customer_type: string
  customer_count: number
  sales_amount: number
  order_count: number
}

interface ChannelDetailItem {
  shop_name: string
  new_customers: number
  new_sales: number
  new_avg_order_value: number
  repeat_customers: number
  repeat_sales: number
  repeat_avg_order_value: number
  repeat_rate: number
  new_sales_share: number
  repeat_sales_share: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month')
    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 })
    }

    const brand = searchParams.get('brand') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockChannelDetail(month, brand))
    }

    const cacheKey = buildCacheKey('customers-channel-detail', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? `AND shop_name LIKE CONCAT('%', @brand, '%')` : ''

      const query = `
        SELECT
          shop_name,
          customer_type,
          SUM(customer_count) AS customer_count,
          SUM(sales_amount) AS sales_amount,
          SUM(order_count) AS order_count
        FROM ${tableName('t_customer_segments')}
        WHERE order_month = @month
          ${brandFilter}
        GROUP BY shop_name, customer_type
      `

      const params: Record<string, unknown> = { month }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<DetailRow>(query, params)

      // Group by shop_name
      const shopMap: Record<string, { new: DetailRow | null; repeat: DetailRow | null }> = {}
      for (const row of rows) {
        if (!shopMap[row.shop_name]) {
          shopMap[row.shop_name] = { new: null, repeat: null }
        }
        if (row.customer_type === '新規') {
          shopMap[row.shop_name].new = row
        } else if (row.customer_type === 'リピート') {
          shopMap[row.shop_name].repeat = row
        }
      }

      const result: ChannelDetailItem[] = Object.entries(shopMap).map(([shop_name, data]) => {
        const newCustomers = data.new?.customer_count || 0
        const newSales = data.new?.sales_amount || 0
        const newOrders = data.new?.order_count || 0
        const repeatCustomers = data.repeat?.customer_count || 0
        const repeatSales = data.repeat?.sales_amount || 0
        const repeatOrders = data.repeat?.order_count || 0

        const totalCustomers = newCustomers + repeatCustomers
        const totalSales = newSales + repeatSales

        return {
          shop_name,
          new_customers: newCustomers,
          new_sales: newSales,
          new_avg_order_value: newOrders > 0 ? newSales / newOrders : 0,
          repeat_customers: repeatCustomers,
          repeat_sales: repeatSales,
          repeat_avg_order_value: repeatOrders > 0 ? repeatSales / repeatOrders : 0,
          repeat_rate: totalCustomers > 0 ? repeatCustomers / totalCustomers : 0,
          new_sales_share: totalSales > 0 ? newSales / totalSales : 0,
          repeat_sales_share: totalSales > 0 ? repeatSales / totalSales : 0,
        }
      })

      result.sort((a, b) => (b.new_sales + b.repeat_sales) - (a.new_sales + a.repeat_sales))

      return result
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
