import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json([])
    }

    const { searchParams } = new URL(request.url)
    const productCode = searchParams.get('product_code') || ''

    if (!productCode) {
      return NextResponse.json([])
    }

    const key = buildCacheKey('pricing-history', { productCode })
    const data = await cachedQuery(key, async () => {
      const rows = await runQuery<{
        month: string
        channel: string
        min_price: number
        avg_price: number
        max_price: number
        list_price: number
        quantity: number
        is_historical_low: boolean
      }>(
        `WITH ne_monthly AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS month,
            CASE o.receive_order_shop_id
              WHEN 1 THEN '公式' WHEN 7 THEN '公式'
              WHEN 2 THEN '楽天' WHEN 4 THEN '楽天' WHEN 10 THEN '楽天'
              WHEN 11 THEN 'RF' WHEN 12 THEN 'TikTok' WHEN 13 THEN 'TikTok'
              ELSE 'その他'
            END AS channel,
            MIN(o.unit_price) AS min_price,
            AVG(o.unit_price) AS avg_price,
            MAX(o.unit_price) AS max_price,
            MAX(p.goods_selling_price) AS list_price,
            SUM(o.quantity) AS quantity
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.unit_price > 0
            AND p.goods_representation_id = @productCode
            AND o.receive_order_date >= FORMAT_TIMESTAMP('%Y-%m-%d 00:00:00', TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY))
          GROUP BY 1, 2
        ),
        zozo_monthly AS (
          SELECT
            FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS month,
            'ZOZO' AS channel,
            MIN(z.selling_price) AS min_price,
            AVG(z.selling_price) AS avg_price,
            MAX(z.selling_price) AS max_price,
            MAX(z.proper_price) AS list_price,
            SUM(z.order_quantity) AS quantity
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.selling_price > 0
            AND z.ne_goods_representation_id = @productCode
            AND z.order_date IS NOT NULL
            AND PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
          GROUP BY 1, 2
        ),
        all_data AS (
          SELECT * FROM ne_monthly
          UNION ALL
          SELECT * FROM zozo_monthly
        ),
        global_min AS (
          SELECT MIN(min_price) AS overall_min FROM all_data
        )
        SELECT
          a.month,
          a.channel,
          a.min_price,
          a.avg_price,
          a.max_price,
          a.list_price,
          a.quantity,
          a.min_price <= g.overall_min AS is_historical_low
        FROM all_data a
        CROSS JOIN global_min g
        ORDER BY a.month, a.channel`,
        { productCode }
      )

      return rows
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[pricing-history] error:', error)
    return NextResponse.json([])
  }
}
