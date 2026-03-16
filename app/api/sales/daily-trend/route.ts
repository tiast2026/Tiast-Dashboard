import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockDailySalesTrend } from '@/lib/mock-data'

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function getLastYearMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${parseInt(y) - 1}-${m}`
}

interface DailyRow {
  period: string
  day: number
  sales_amount: number
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
      return NextResponse.json(getMockDailySalesTrend(month, brand))
    }

    const prevMonth = getPrevMonth(month)
    const lastYearMonth = getLastYearMonth(month)

    const cacheKey = buildCacheKey('sales-daily-trend', { month, brand })

    const data = await cachedQuery(cacheKey, async () => {
      const brandFilterNE = brand
        ? `AND CASE WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL' WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN' ELSE 'OTHER' END = @brand`
        : ''
      const brandFilterZOZO = brand
        ? `AND CASE WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL' WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN' ELSE 'OTHER' END = @brand`
        : ''

      const query = `
        WITH ne_daily AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
            EXTRACT(DAY FROM PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS day,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) IN (@month, @prevMonth, @lastYearMonth)
            ${brandFilterNE}
          GROUP BY 1, 2
        ),
        zozo_daily AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
            EXTRACT(DAY FROM PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS day,
            SUM(z.selling_price * z.order_quantity) AS sales_amount
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) IN (@month, @prevMonth, @lastYearMonth)
            ${brandFilterZOZO}
          GROUP BY 1, 2
        ),
        combined AS (
          SELECT order_month, day, SUM(sales_amount) AS sales_amount
          FROM (
            SELECT * FROM ne_daily
            UNION ALL
            SELECT * FROM zozo_daily
          )
          GROUP BY 1, 2
        )
        SELECT
          CASE
            WHEN order_month = @month THEN 'current'
            WHEN order_month = @prevMonth THEN 'prev_month'
            WHEN order_month = @lastYearMonth THEN 'prev_year'
          END AS period,
          day,
          sales_amount
        FROM combined
        ORDER BY day ASC
      `

      const params: Record<string, unknown> = { month, prevMonth, lastYearMonth }
      if (brand) {
        params.brand = brand
      }

      const rows = await runQuery<DailyRow>(query, params)

      // Pivot: create array of { day, current, prev_month, prev_year }
      const dayMap: Record<number, { day: number; current: number; prev_month: number; prev_year: number }> = {}
      for (let d = 1; d <= 31; d++) {
        dayMap[d] = { day: d, current: 0, prev_month: 0, prev_year: 0 }
      }
      for (const row of rows) {
        if (!dayMap[row.day]) continue
        if (row.period === 'current') dayMap[row.day].current = row.sales_amount
        else if (row.period === 'prev_month') dayMap[row.day].prev_month = row.sales_amount
        else if (row.period === 'prev_year') dayMap[row.day].prev_year = row.sales_amount
      }

      // Get days in each month
      const [y, m] = month.split('-').map(Number)
      const daysInMonth = new Date(y, m, 0).getDate()

      return Object.values(dayMap)
        .filter((d) => d.day <= daysInMonth)
        .sort((a, b) => a.day - b.day)
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
