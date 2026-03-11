import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockCustomerMonthlyTrend } from '@/lib/mock-data'

interface TrendRow {
  order_month: string
  customer_type: string
  customer_count: number
}

interface TrendItem {
  month: string
  new_count: number
  repeat_count: number
  repeat_rate: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const months = parseInt(searchParams.get('months') || '24', 10)
    const brand = searchParams.get('brand') || undefined

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockCustomerMonthlyTrend(months, brand))
    }

    const cacheKey = buildCacheKey('customers-monthly-trend', {
      months: String(months),
      brand,
    })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? `AND shop_name LIKE CONCAT('%', @brand, '%')` : ''

      const query = `
        SELECT
          order_month,
          customer_type,
          SUM(customer_count) AS customer_count
        FROM ${tableName('t_customer_segments')}
        WHERE order_month >= FORMAT_DATE('%Y-%m', DATE_SUB(CURRENT_DATE(), INTERVAL @months MONTH))
          ${brandFilter}
        GROUP BY order_month, customer_type
        ORDER BY order_month ASC
      `

      const params: Record<string, unknown> = { months }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<TrendRow>(query, params)

      // Pivot by month
      const grouped: Record<string, { new_count: number; repeat_count: number }> = {}
      for (const row of rows) {
        if (!grouped[row.order_month]) {
          grouped[row.order_month] = { new_count: 0, repeat_count: 0 }
        }
        if (row.customer_type === '新規') {
          grouped[row.order_month].new_count = row.customer_count
        } else if (row.customer_type === 'リピート') {
          grouped[row.order_month].repeat_count = row.customer_count
        }
      }

      const result: TrendItem[] = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => {
          const total = data.new_count + data.repeat_count
          return {
            month,
            new_count: data.new_count,
            repeat_count: data.repeat_count,
            repeat_rate: total > 0 ? data.repeat_count / total : 0,
          }
        })

      return result
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
