import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json(null)
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || ''
    const brand = searchParams.get('brand') || ''

    const key = buildCacheKey('pricing-summary', { month, brand })
    const data = await cachedQuery(key, async () => {
      const brandFilter = brand
        ? brand === 'NOAHL'
          ? "AND LEFT(o.goods_id, 1) = 'n'"
          : "AND LEFT(o.goods_id, 1) = 'b'"
        : ''

      // NE orders: compare unit_price vs goods_selling_price (list price)
      const neRows = await runQuery<{
        total_orders: number
        total_revenue: number
        full_price_orders: number
        full_price_revenue: number
        discounted_orders: number
        discounted_revenue: number
        total_list_revenue: number
        avg_discount_rate: number
        channel_stats: string
      }>(
        `WITH order_pricing AS (
          SELECT
            o.receive_order_id,
            o.receive_order_row_no,
            o.unit_price,
            o.quantity,
            p.goods_selling_price AS list_price,
            o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS actual_revenue,
            p.goods_selling_price * o.quantity AS list_revenue,
            CASE o.receive_order_shop_id
              WHEN 1 THEN '公式' WHEN 7 THEN '公式'
              WHEN 2 THEN '楽天' WHEN 4 THEN '楽天' WHEN 10 THEN '楽天'
              WHEN 3 THEN 'SHOPLIST' WHEN 5 THEN 'Amazon'
              WHEN 6 THEN 'aupay' WHEN 8 THEN 'サステナ' WHEN 9 THEN 'Yahoo!'
              WHEN 11 THEN 'Rakuten Fashion'
              WHEN 12 THEN 'TikTok' WHEN 13 THEN 'TikTok'
              ELSE 'その他'
            END AS channel
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p
            ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) = @month
            AND p.goods_selling_price > 0
            AND o.unit_price > 0
            ${brandFilter}
        )
        SELECT
          COUNT(*) as total_orders,
          SUM(actual_revenue) as total_revenue,
          COUNTIF(unit_price >= list_price) as full_price_orders,
          SUM(IF(unit_price >= list_price, actual_revenue, 0)) as full_price_revenue,
          COUNTIF(unit_price < list_price) as discounted_orders,
          SUM(IF(unit_price < list_price, actual_revenue, 0)) as discounted_revenue,
          SUM(list_revenue) as total_list_revenue,
          AVG(IF(unit_price < list_price, 1 - SAFE_DIVIDE(unit_price, list_price), NULL)) as avg_discount_rate,
          TO_JSON_STRING(ARRAY_AGG(STRUCT(
            channel,
            COUNT(*) as orders,
            SUM(actual_revenue) as revenue,
            COUNTIF(unit_price >= list_price) as full_price_count,
            COUNTIF(unit_price < list_price) as discounted_count,
            AVG(IF(unit_price < list_price, 1 - SAFE_DIVIDE(unit_price, list_price), NULL)) as avg_discount
          ) ORDER BY SUM(actual_revenue) DESC)) as channel_stats
        FROM order_pricing
        GROUP BY TRUE`,
        { month }
      )

      // ZOZO: direct proper_price vs selling_price
      const zozoRows = await runQuery<{
        total_orders: number
        total_revenue: number
        full_price_orders: number
        full_price_revenue: number
        discounted_orders: number
        discounted_revenue: number
        total_list_revenue: number
        avg_discount_rate: number
      }>(
        `SELECT
          COUNT(*) as total_orders,
          SUM(selling_price * order_quantity) as total_revenue,
          COUNTIF(selling_price >= proper_price) as full_price_orders,
          SUM(IF(selling_price >= proper_price, selling_price * order_quantity, 0)) as full_price_revenue,
          COUNTIF(selling_price < proper_price) as discounted_orders,
          SUM(IF(selling_price < proper_price, selling_price * order_quantity, 0)) as discounted_revenue,
          SUM(proper_price * order_quantity) as total_list_revenue,
          AVG(IF(selling_price < proper_price, 1 - SAFE_DIVIDE(selling_price, proper_price), NULL)) as avg_discount_rate
        FROM \`tiast-data-platform.raw_zozo.zozo_orders\`
        WHERE (cancel_flag = '' OR cancel_flag IS NULL)
          AND order_date IS NOT NULL
          AND FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(order_date, 10))) = @month
          AND proper_price > 0
          AND selling_price > 0
          ${brand ? (brand === 'NOAHL' ? "AND LEFT(brand_code, 1) = 'n'" : "AND LEFT(brand_code, 1) = 'b'") : ''}`,
        { month }
      )

      const ne = neRows[0] || null
      const zozo = zozoRows[0] || null

      let channelStats = []
      try {
        if (ne?.channel_stats) channelStats = JSON.parse(ne.channel_stats as unknown as string)
      } catch { /* ignore */ }

      // Add ZOZO to channel stats
      if (zozo && (Number(zozo.total_orders) || 0) > 0) {
        channelStats.push({
          channel: 'ZOZO',
          orders: Number(zozo.total_orders) || 0,
          revenue: Number(zozo.total_revenue) || 0,
          full_price_count: Number(zozo.full_price_orders) || 0,
          discounted_count: Number(zozo.discounted_orders) || 0,
          avg_discount: Number(zozo.avg_discount_rate) || 0,
        })
      }

      const totalRevenue = (Number(ne?.total_revenue) || 0) + (Number(zozo?.total_revenue) || 0)
      const totalListRevenue = (Number(ne?.total_list_revenue) || 0) + (Number(zozo?.total_list_revenue) || 0)
      const fullPriceRevenue = (Number(ne?.full_price_revenue) || 0) + (Number(zozo?.full_price_revenue) || 0)
      const discountedRevenue = (Number(ne?.discounted_revenue) || 0) + (Number(zozo?.discounted_revenue) || 0)
      const fullPriceOrders = (Number(ne?.full_price_orders) || 0) + (Number(zozo?.full_price_orders) || 0)
      const discountedOrders = (Number(ne?.discounted_orders) || 0) + (Number(zozo?.discounted_orders) || 0)

      return {
        total_revenue: totalRevenue,
        total_list_revenue: totalListRevenue,
        lost_revenue: totalListRevenue - totalRevenue,
        full_price_rate: totalRevenue > 0 ? fullPriceRevenue / totalRevenue : 0,
        full_price_orders: fullPriceOrders,
        discounted_orders: discountedOrders,
        full_price_revenue: fullPriceRevenue,
        discounted_revenue: discountedRevenue,
        avg_discount_rate: (() => {
          const neRate = Number(ne?.avg_discount_rate) || 0
          const zozoRate = Number(zozo?.avg_discount_rate) || 0
          const neCount = Number(ne?.discounted_orders) || 0
          const zozoCount = Number(zozo?.discounted_orders) || 0
          const total = neCount + zozoCount
          return total > 0 ? (neRate * neCount + zozoRate * zozoCount) / total : 0
        })(),
        channel_stats: channelStats,
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[pricing-summary] error:', error)
    return NextResponse.json(null)
  }
}
