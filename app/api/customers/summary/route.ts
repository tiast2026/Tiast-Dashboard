import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

interface SegmentRow {
  order_month: string
  customer_type: string
  customer_count: number
  sales_amount: number
  order_count: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const month = searchParams.get('month')
    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 })
    }

    const brand = searchParams.get('brand') || undefined
    const prevMonth = getPrevMonth(month)

    const cacheKey = buildCacheKey('customers-summary', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? `AND shop_name LIKE CONCAT('%', @brand, '%')` : ''

      const query = `
        SELECT
          order_month,
          customer_type,
          SUM(customer_count) AS customer_count,
          SUM(sales_amount) AS sales_amount,
          SUM(order_count) AS order_count
        FROM ${tableName('t_customer_segments')}
        WHERE order_month IN (@month, @prevMonth)
          ${brandFilter}
        GROUP BY order_month, customer_type
      `

      const params: Record<string, unknown> = { month, prevMonth }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<SegmentRow>(query, params)

      const getMetrics = (targetMonth: string) => {
        const newRow = rows.find((r) => r.order_month === targetMonth && r.customer_type === '新規')
        const repeatRow = rows.find((r) => r.order_month === targetMonth && r.customer_type === 'リピート')

        const newCustomers = newRow?.customer_count || 0
        const repeatCustomers = repeatRow?.customer_count || 0
        const total = newCustomers + repeatCustomers
        const repeatRate = total > 0 ? repeatCustomers / total : 0

        const newSales = newRow?.sales_amount || 0
        const newOrders = newRow?.order_count || 0
        const repeatSales = repeatRow?.sales_amount || 0
        const repeatOrders = repeatRow?.order_count || 0

        const newAvgOrderValue = newOrders > 0 ? newSales / newOrders : 0
        const repeatAvgOrderValue = repeatOrders > 0 ? repeatSales / repeatOrders : 0

        return {
          new_customers: newCustomers,
          repeat_customers: repeatCustomers,
          repeat_rate: repeatRate,
          new_avg_order_value: newAvgOrderValue,
          repeat_avg_order_value: repeatAvgOrderValue,
        }
      }

      const current = getMetrics(month)
      const prev = getMetrics(prevMonth)

      return {
        new_customers: current.new_customers,
        repeat_customers: current.repeat_customers,
        repeat_rate: current.repeat_rate,
        new_avg_order_value: current.new_avg_order_value,
        repeat_avg_order_value: current.repeat_avg_order_value,
        prev_new_customers: prev.new_customers,
        prev_repeat_customers: prev.repeat_customers,
        prev_repeat_rate: prev.repeat_rate,
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
