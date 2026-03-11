import { NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured, runQuery } from '@/lib/bigquery'

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

  return NextResponse.json(results, { status: 200 })
}
