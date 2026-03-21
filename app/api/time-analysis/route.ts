import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) return NextResponse.json(null)

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('time-analysis', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL' ? "AND LEFT(o.goods_id, 1) = 'n'" : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      // Day of week × Hour heatmap
      const heatmap = await runQuery<{
        day_of_week: number
        hour: number
        order_count: number
        revenue: number
      }>(
        `SELECT
          EXTRACT(DAYOFWEEK FROM PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', o.receive_order_date)) AS day_of_week,
          EXTRACT(HOUR FROM PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', o.receive_order_date)) AS hour,
          COUNT(DISTINCT o.receive_order_id) AS order_count,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        WHERE CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
          ${brandFilter}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
        { month }
      )

      // Day of week summary
      const dailySummary = await runQuery<{
        day_of_week: number
        order_count: number
        revenue: number
        avg_order_value: number
      }>(
        `SELECT
          EXTRACT(DAYOFWEEK FROM PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', o.receive_order_date)) AS day_of_week,
          COUNT(DISTINCT o.receive_order_id) AS order_count,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue,
          SAFE_DIVIDE(
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)),
            COUNT(DISTINCT o.receive_order_id)
          ) AS avg_order_value
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        WHERE CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
          ${brandFilter}
        GROUP BY 1
        ORDER BY 1`,
        { month }
      )

      // Peak hours
      const peakHours = await runQuery<{
        hour: number
        order_count: number
        revenue: number
      }>(
        `SELECT
          EXTRACT(HOUR FROM PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', o.receive_order_date)) AS hour,
          COUNT(DISTINCT o.receive_order_id) AS order_count,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS revenue
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        WHERE CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
          ${brandFilter}
        GROUP BY 1
        ORDER BY 1`,
        { month }
      )

      return { heatmap, dailySummary, peakHours }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[time-analysis] error:', error)
    return NextResponse.json(null)
  }
}
