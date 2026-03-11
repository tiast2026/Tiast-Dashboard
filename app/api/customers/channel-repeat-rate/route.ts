import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockChannelRepeatRate } from '@/lib/mock-data'

function getPrevMonths(month: string, count: number): string[] {
  const months: string[] = [month]
  let [y, m] = month.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }
  return months
}

interface RepeatRateRow {
  shop_name: string
  total_count: number
  repeat_count: number
}

interface RepeatRateItem {
  shop_name: string
  repeat_rate: number
  customer_count: number
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
      return NextResponse.json(getMockChannelRepeatRate(month, brand))
    }

    const targetMonths = getPrevMonths(month, 2) // current + 2 preceding = 3 months

    const cacheKey = buildCacheKey('customers-channel-repeat-rate', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? `AND shop_name LIKE CONCAT('%', @brand, '%')` : ''

      const query = `
        SELECT
          shop_name,
          SUM(customer_count) AS total_count,
          SUM(CASE WHEN customer_type = 'リピート' THEN customer_count ELSE 0 END) AS repeat_count
        FROM ${tableName('mart_customer_segments')}
        WHERE order_month IN UNNEST(@targetMonths)
          ${brandFilter}
        GROUP BY shop_name
        ORDER BY repeat_count DESC
      `

      const params: Record<string, unknown> = { targetMonths }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<RepeatRateRow>(query, params)

      const result: RepeatRateItem[] = rows.map((row) => ({
        shop_name: row.shop_name,
        repeat_rate: row.total_count > 0 ? row.repeat_count / row.total_count : 0,
        customer_count: row.total_count,
      }))

      result.sort((a, b) => b.repeat_rate - a.repeat_rate)

      return result
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
