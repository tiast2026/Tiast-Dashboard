import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured } from '@/lib/bigquery'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isBigQueryConfigured()) {
    return NextResponse.json({ error: 'BigQuery not configured' }, { status: 500 })
  }

  const { searchParams } = request.nextUrl
  const month = searchParams.get('month') || '2026-03'

  const results: Record<string, unknown> = { month }

  // 1. mart_sales_by_shop_month: 店舗別売上（ダッシュボードKPIのソース）
  try {
    const shopSales = await runQuery<{
      shop_brand: string
      shop_name: string
      sales_amount: number
      order_count: number
      gross_profit: number
    }>(`
      SELECT shop_brand, shop_name, sales_amount, order_count, gross_profit
      FROM \`tiast-data-platform.analytics_mart.mart_sales_by_shop_month\`
      WHERE order_month = @month
      ORDER BY sales_amount DESC
    `, { month })

    const total = shopSales.reduce((s, r) => s + r.sales_amount, 0)
    const totalOrders = shopSales.reduce((s, r) => s + r.order_count, 0)
    const totalProfit = shopSales.reduce((s, r) => s + r.gross_profit, 0)

    results.mart_sales_by_shop_month = {
      total_sales: total,
      total_orders: totalOrders,
      total_gross_profit: totalProfit,
      gross_profit_rate: total > 0 ? (totalProfit / total * 100).toFixed(1) + '%' : '0%',
      avg_order_value: totalOrders > 0 ? Math.round(total / totalOrders) : 0,
      rows: shopSales,
    }
  } catch (e) {
    results.mart_sales_by_shop_month = { error: e instanceof Error ? e.message : String(e) }
  }

  // 2. mart_sales_by_brand_month: ブランド別売上（円グラフのソース）
  try {
    const brandSales = await runQuery<{
      brand: string
      category: string
      sales_amount: number
      order_count: number
    }>(`
      SELECT brand, category, sales_amount, order_count
      FROM \`tiast-data-platform.analytics_mart.mart_sales_by_brand_month\`
      WHERE order_month = @month
      ORDER BY brand, sales_amount DESC
    `, { month })

    const brandTotals: Record<string, number> = {}
    for (const r of brandSales) {
      brandTotals[r.brand] = (brandTotals[r.brand] || 0) + r.sales_amount
    }

    results.mart_sales_by_brand_month = {
      brand_totals: brandTotals,
      grand_total: Object.values(brandTotals).reduce((s, v) => s + v, 0),
      row_count: brandSales.length,
      sample_rows: brandSales.slice(0, 20),
    }
  } catch (e) {
    results.mart_sales_by_brand_month = { error: e instanceof Error ? e.message : String(e) }
  }

  // 3. raw_nextengine.orders: 元データ件数確認
  try {
    const rawOrders = await runQuery<{
      cnt: number
      total_amount: number
    }>(`
      SELECT COUNT(*) AS cnt, SUM(CAST(total_amount AS FLOAT64)) AS total_amount
      FROM \`tiast-data-platform.raw_nextengine.orders\`
      WHERE FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(receive_order_date, 10))) = @month
    `, { month })

    results.raw_orders = rawOrders[0] || { cnt: 0, total_amount: 0 }
  } catch (e) {
    results.raw_orders = { error: e instanceof Error ? e.message : String(e) }
  }

  // 4. テーブルスキーマ確認
  try {
    const schema = await runQuery<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM \`tiast-data-platform.analytics_mart.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = 'mart_sales_by_shop_month'
      ORDER BY ordinal_position
    `)
    results.shop_month_schema = schema
  } catch (e) {
    results.shop_month_schema = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json(results, { status: 200 })
}
