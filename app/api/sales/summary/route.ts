import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockSalesSummary } from '@/lib/mock-data'

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function getLastYearMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${parseInt(y) - 1}-${m}`
}

interface SummaryRow {
  order_month: string
  sales_amount: number
  order_count: number
  gross_profit: number
}

interface SummaryMetrics {
  sales_amount: number
  order_count: number
  gross_profit_rate: number
  avg_order_value: number
}

function toMetrics(row: SummaryRow | undefined): SummaryMetrics {
  if (!row || row.order_count === 0) {
    return { sales_amount: 0, order_count: 0, gross_profit_rate: 0, avg_order_value: 0 }
  }
  return {
    sales_amount: row.sales_amount,
    order_count: row.order_count,
    gross_profit_rate: row.gross_profit / row.sales_amount,
    avg_order_value: row.sales_amount / row.order_count,
  }
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
      return NextResponse.json(getMockSalesSummary(month, brand))
    }

    const prevMonth = getPrevMonth(month)
    const lastYearMonth = getLastYearMonth(month)

    const cacheKey = buildCacheKey('sales-summary', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilter = brand ? 'AND shop_brand = @brand' : ''

      const query = `
        SELECT
          order_month,
          SUM(sales_amount) AS sales_amount,
          SUM(order_count) AS order_count,
          SUM(gross_profit) AS gross_profit
        FROM ${tableName('t_sales_by_shop_month')}
        WHERE order_month IN (@month, @prevMonth, @lastYearMonth)
          ${brandFilter}
        GROUP BY order_month
      `

      const params: Record<string, unknown> = {
        month,
        prevMonth,
        lastYearMonth,
      }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<SummaryRow>(query, params)

      const currentRow = rows.find((r) => r.order_month === month)
      const prevRow = rows.find((r) => r.order_month === prevMonth)
      const lastYearRow = rows.find((r) => r.order_month === lastYearMonth)

      return {
        current: toMetrics(currentRow),
        previous_month: toMetrics(prevRow),
        previous_year: toMetrics(lastYearRow),
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
