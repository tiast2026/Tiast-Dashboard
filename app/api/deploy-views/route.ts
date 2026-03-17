import { NextResponse } from 'next/server'
import { isBigQueryConfigured, runQuery } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

/**
 * POST /api/deploy-views
 * BigQueryのVIEWを最新SQLで再作成する
 */
export async function POST() {
  if (!isBigQueryConfigured()) {
    return NextResponse.json({ error: 'BigQuery not configured' }, { status: 500 })
  }

  const results: Record<string, unknown> = {}

  // VIEW 1: mart_sales_by_shop_month
  try {
    await runQuery(`
CREATE OR REPLACE VIEW \`tiast-data-platform.analytics_mart.mart_sales_by_shop_month\` AS

WITH ne_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
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
    END AS shop_name,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
    COUNT(DISTINCT o.receive_order_id) AS order_count,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
      - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit
  FROM \`tiast-data-platform.raw_nextengine.orders\` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND o.receive_order_date IS NOT NULL
  GROUP BY 1, 2, 3
),

zozo_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
    'ZOZO' AS shop_name,
    CASE
      WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    SUM(z.selling_price * z.order_quantity) AS sales_amount,
    COUNT(DISTINCT z.order_number) AS order_count,
    SUM(z.selling_price * z.order_quantity)
      - SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity) AS gross_profit
  FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
  LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p
    ON z.ne_goods_id = p.goods_id
  WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
    AND z.order_date IS NOT NULL
  GROUP BY 1, 2, 3
)

SELECT * FROM ne_sales
UNION ALL
SELECT * FROM zozo_sales
    `)
    results.mart_sales_by_shop_month = 'OK'
  } catch (e) {
    results.mart_sales_by_shop_month = { error: e instanceof Error ? e.message : String(e) }
  }

  // VIEW 2: mart_sales_by_brand_month
  try {
    await runQuery(`
CREATE OR REPLACE VIEW \`tiast-data-platform.analytics_mart.mart_sales_by_brand_month\` AS

WITH ne_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    COALESCE(p.goods_merchandise_name, 'その他') AS category,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
  FROM \`tiast-data-platform.raw_nextengine.orders\` o
  LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p
    ON o.goods_id = p.goods_id
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND o.receive_order_date IS NOT NULL
  GROUP BY 1, 2, 3
),

zozo_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
    CASE
      WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    COALESCE(z.child_category, z.parent_category, 'その他') AS category,
    SUM(z.selling_price * z.order_quantity) AS sales_amount
  FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
  WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
    AND z.order_date IS NOT NULL
  GROUP BY 1, 2, 3
)

SELECT * FROM ne_sales
UNION ALL
SELECT * FROM zozo_sales
    `)
    results.mart_sales_by_brand_month = 'OK'
  } catch (e) {
    results.mart_sales_by_brand_month = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json({
    message: 'VIEW deploy completed',
    results,
  })
}

/**
 * GET /api/deploy-views - show status info
 */
export async function GET() {
  return NextResponse.json({
    info: 'POST to this endpoint to recreate BigQuery VIEWs with latest SQL',
    views: ['mart_sales_by_shop_month', 'mart_sales_by_brand_month'],
  })
}
