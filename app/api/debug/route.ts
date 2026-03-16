import { NextResponse } from 'next/server'
import { isBigQueryConfigured, runQuery } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, unknown> = {
    bigQueryConfigured: isBigQueryConfigured(),
    timestamp: new Date().toISOString(),
  }

  if (!isBigQueryConfigured()) {
    results.error = 'GOOGLE_APPLICATION_CREDENTIALS_JSON is not set'
    return NextResponse.json(results)
  }

  // Test 1: Basic connectivity
  try {
    const rows = await runQuery<{ ok: number }>('SELECT 1 AS ok')
    results.connectivity = { ok: true, rows }
  } catch (e) {
    results.connectivity = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // Test 2: Check if views exist
  const views = [
    'mart_sales_by_shop_month',
    'mart_sales_by_brand_month',
    'mart_product_master',
    'mart_inventory_health',
    'mart_md_dashboard',
    'mart_customer_segments',
  ]

  for (const view of views) {
    try {
      const rows = await runQuery<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tiast-data-platform.analytics_mart.${view}\` LIMIT 1`
      )
      results[view] = { exists: true, rowCount: rows[0]?.cnt ?? 0 }
    } catch (e) {
      results[view] = { exists: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Test 3: Check raw tables
  const rawTables = [
    'raw_nextengine.orders',
    'raw_nextengine.products',
    'raw_nextengine.stock',
    'raw_zozo.zozo_orders',
  ]

  for (const table of rawTables) {
    try {
      const rows = await runQuery<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tiast-data-platform.${table}\``
      )
      results[table] = { exists: true, rowCount: rows[0]?.cnt ?? 0 }
    } catch (e) {
      results[table] = { exists: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Test 4: ZOZO data investigation
  try {
    // Sample ZOZO orders to check data format
    const zozoSample = await runQuery<Record<string, unknown>>(
      `SELECT
        order_number,
        order_date,
        brand_code,
        ne_goods_id,
        product_name,
        selling_price,
        order_quantity,
        cancel_flag,
        LEFT(order_date, 10) AS date_part
      FROM \`tiast-data-platform.raw_zozo.zozo_orders\`
      LIMIT 5`
    )
    results.zozo_sample = zozoSample

    // Check cancel_flag distribution
    const zozoCancelDist = await runQuery<{ cancel_flag: string | null; cnt: number }>(
      `SELECT cancel_flag, COUNT(*) AS cnt
       FROM \`tiast-data-platform.raw_zozo.zozo_orders\`
       GROUP BY cancel_flag
       ORDER BY cnt DESC`
    )
    results.zozo_cancel_distribution = zozoCancelDist

    // Check if ZOZO rows exist in the VIEW
    const zozoInView = await runQuery<{ shop_name: string; cnt: number; total_sales: number }>(
      `SELECT shop_name, COUNT(*) AS cnt, SUM(sales_amount) AS total_sales
       FROM \`tiast-data-platform.analytics_mart.mart_sales_by_shop_month\`
       WHERE shop_name = 'ZOZO'
       GROUP BY shop_name`
    )
    results.zozo_in_view = zozoInView.length > 0 ? zozoInView : 'NO_ZOZO_ROWS_IN_VIEW'

    // Try parsing ZOZO date to see if format works
    const zozoDateTest = await runQuery<{ ok_count: number; fail_count: number }>(
      `SELECT
        COUNTIF(SAFE.PARSE_DATE('%Y/%m/%d', LEFT(order_date, 10)) IS NOT NULL) AS ok_count,
        COUNTIF(SAFE.PARSE_DATE('%Y/%m/%d', LEFT(order_date, 10)) IS NULL) AS fail_count
       FROM \`tiast-data-platform.raw_zozo.zozo_orders\``
    )
    results.zozo_date_parse = zozoDateTest[0] || null
  } catch (e) {
    results.zozo_investigation = { error: e instanceof Error ? e.message : String(e) }
  }

  // Test 5: Directly run ZOZO sales CTE to verify data
  try {
    const zozoDirect = await runQuery<{ order_month: string; shop_brand: string; sales_amount: number; order_count: number }>(
      `SELECT
        FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
        CASE
          WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
          WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
          ELSE 'OTHER'
        END AS shop_brand,
        SUM(z.selling_price * z.order_quantity) AS sales_amount,
        COUNT(DISTINCT z.order_number) AS order_count
      FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
      WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
        AND z.order_date IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1 DESC
      LIMIT 10`
    )
    results.zozo_direct_query = zozoDirect

    // Check VIEW definition source
    const viewDef = await runQuery<{ view_definition: string }>(
      `SELECT view_definition
       FROM \`tiast-data-platform.analytics_mart.INFORMATION_SCHEMA.VIEWS\`
       WHERE table_name = 'mart_sales_by_shop_month'`
    )
    results.view_definition_contains_zozo = viewDef.length > 0
      ? String(viewDef[0].view_definition).includes('zozo')
      : 'VIEW_DEF_NOT_FOUND'

    // Get all distinct shop_names in VIEW
    const shopNames = await runQuery<{ shop_name: string; cnt: number }>(
      `SELECT shop_name, COUNT(*) AS cnt
       FROM \`tiast-data-platform.analytics_mart.mart_sales_by_shop_month\`
       GROUP BY shop_name
       ORDER BY cnt DESC`
    )
    results.view_shop_names = shopNames
  } catch (e) {
    results.zozo_direct_test = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json(results, { status: 200 })
}
