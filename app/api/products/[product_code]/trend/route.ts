import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface TrendRow {
  month: string
  quantity: number
  sales_amount: number
}

interface ChannelRow {
  channel: string
  quantity: number
  sales_amount: number
}

const SHOP_NAME_CASE = `
  CASE o.receive_order_shop_id
    WHEN 1 THEN '公式'
    WHEN 7 THEN '公式'
    WHEN 2 THEN '楽天市場'
    WHEN 4 THEN '楽天市場'
    WHEN 10 THEN '楽天市場'
    WHEN 3 THEN 'SHOPLIST'
    WHEN 5 THEN 'Amazon'
    WHEN 6 THEN 'aupay'
    WHEN 8 THEN 'サステナ'
    WHEN 9 THEN 'Yahoo!'
    WHEN 11 THEN 'RakutenFashion'
    WHEN 12 THEN 'TikTok'
    WHEN 13 THEN 'TikTok'
    ELSE CONCAT('その他(', CAST(o.receive_order_shop_id AS STRING), ')')
  END
`

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ product_code: string }> }
) {
  try {
    const { product_code } = await params
    const { searchParams } = request.nextUrl
    const goods_id = searchParams.get('goods_id') || null
    const months = Math.min(Number(searchParams.get('months') || '12'), 24)
    const period = searchParams.get('period') || null
    const channelMonth = searchParams.get('month') || null

    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], prev_year: [], channels: [] })
    }

    const level = goods_id ? 'sku' : 'product'
    const cacheKey = buildCacheKey('product-trend', { product_code, goods_id: goods_id || '', months: String(months), period: period || '', channelMonth: channelMonth || '' })

    const data = await cachedQuery(cacheKey, async () => {
      const filterCol = level === 'sku' ? 'o.goods_id' : 'p.goods_representation_id'
      const filterVal = level === 'sku' ? goods_id : product_code
      const paramName = level === 'sku' ? 'goods_id' : 'product_code'

      // Monthly sales for the last N months
      const trendQuery = `
        SELECT
          FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS month,
          SUM(o.quantity) AS quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE ${filterCol} = @${paramName}
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months} MONTH)
        GROUP BY month
        ORDER BY month
      `

      // Previous year same months for comparison
      const prevYearQuery = `
        SELECT
          FORMAT_DATE('%Y-%m', DATE_ADD(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)), INTERVAL 12 MONTH)) AS month,
          SUM(o.quantity) AS quantity,
          SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
        FROM \`tiast-data-platform.raw_nextengine.orders\` o
        JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
        WHERE ${filterCol} = @${paramName}
          AND CAST(o.cancel_type_id AS STRING) = '0'
          AND CAST(o.row_cancel_flag AS STRING) = '0'
          AND o.receive_order_date IS NOT NULL
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${months + 12} MONTH)
          AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) < DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
        GROUP BY month
        ORDER BY month
      `

      // Channel breakdown filtered by period (NE + ZOZO)
      const neFilterCol = level === 'sku' ? 'o.goods_id' : 'p.goods_representation_id'
      const zozoFilterCol = level === 'sku' ? 'z.ne_goods_id' : 'zp.goods_representation_id'

      // Build date filter conditions based on period
      let neDateFilter: string
      let zozoDateFilter: string
      if (period === 'month' && channelMonth) {
        const [y, mo] = channelMonth.split('-').map(Number)
        const lastDay = new Date(y, mo, 0).getDate()
        const start = `${y}-${String(mo).padStart(2, '0')}-01`
        const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        neDateFilter = `AND LEFT(o.receive_order_date, 10) >= '${start}' AND LEFT(o.receive_order_date, 10) <= '${end}'`
        zozoDateFilter = `AND LEFT(z.order_date, 10) >= '${start.replace(/-/g, '/')}' AND LEFT(z.order_date, 10) <= '${end.replace(/-/g, '/')}'`
      } else if (period === '7d' || period === '30d' || period === '60d') {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 60
        neDateFilter = `AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`
        zozoDateFilter = `AND PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)`
      } else if (period === 'all') {
        neDateFilter = ''
        zozoDateFilter = ''
      } else {
        // Default: current month
        neDateFilter = `AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = FORMAT_DATE('%Y-%m', CURRENT_DATE())`
        zozoDateFilter = `AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) = FORMAT_DATE('%Y-%m', CURRENT_DATE())`
      }

      const channelQuery = `
        WITH ne_channels AS (
          SELECT
            ${SHOP_NAME_CASE} AS channel,
            SUM(o.quantity) AS quantity,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE ${neFilterCol} = @${paramName}
            AND CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            ${neDateFilter}
          GROUP BY channel
        ),
        zozo_channels AS (
          SELECT
            'ZOZO' AS channel,
            SUM(z.order_quantity) AS quantity,
            SUM(z.selling_price * z.order_quantity) AS sales_amount
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          JOIN \`tiast-data-platform.raw_nextengine.products\` zp ON z.ne_goods_id = zp.goods_id
          WHERE ${zozoFilterCol} = @${paramName}
            AND (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            ${zozoDateFilter}
          GROUP BY channel
        )
        SELECT channel, SUM(quantity) AS quantity, SUM(sales_amount) AS sales_amount
        FROM (SELECT * FROM ne_channels UNION ALL SELECT * FROM zozo_channels)
        GROUP BY channel
        ORDER BY sales_amount DESC
      `

      const queryParams = level === 'sku' ? { goods_id: filterVal! } : { product_code: filterVal! }

      const [trendRows, prevYearRows, channelRows] = await Promise.all([
        runQuery<TrendRow>(trendQuery, queryParams),
        runQuery<TrendRow>(prevYearQuery, queryParams).catch(() => [] as TrendRow[]),
        runQuery<ChannelRow>(channelQuery, queryParams).catch(() => [] as ChannelRow[]),
      ])

      return { data: trendRows, prev_year: prevYearRows, channels: channelRows }
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Product trend error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
