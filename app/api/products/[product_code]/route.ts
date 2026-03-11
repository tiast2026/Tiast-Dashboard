import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockProductDetail } from '@/lib/mock-data'

interface SalesRow {
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  price_tier: string
  selling_price: number
  cost_price: number
  total_quantity: number
  order_count: number
  sales_amount: number
  gross_profit: number
  gross_profit_rate: number
}

interface ProductMasterRow {
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null
  sku_count: number
}

interface InventoryRow {
  goods_id: string
  goods_name: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  sales_1day: number
  sales_7days: number
  sales_30days: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  is_overstock: boolean
  is_stockout: boolean
  reorder_judgment: string
  recommended_discount: string | null
  selling_price: number
  cost_price: number
}

interface MdRow {
  goods_id: string
  goods_name: string
  lifecycle_stance: string
  turnover_rate_annual: number
  turnover_days: number
  last_io_date: string | null
  days_since_last_io: number
  stagnation_alert: string | null
  lifecycle_action: string | null
  inventory_status: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ product_code: string }> }
) {
  try {
    const { product_code } = await params

    if (!isBigQueryConfigured()) {
      const mockData = getMockProductDetail(product_code)
      if (!mockData) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      return NextResponse.json(mockData)
    }

    const cacheKey = buildCacheKey('product-detail', { product_code })

    const data = await cachedQuery(cacheKey, async () => {
      // Fetch sales data
      const salesQuery = `
        SELECT
          product_code,
          product_name,
          brand,
          category,
          season,
          price_tier,
          selling_price,
          cost_price,
          total_quantity,
          order_count,
          sales_amount,
          gross_profit,
          gross_profit_rate
        FROM ${tableName('t_sales_by_product')}
        WHERE product_code = @product_code
      `

      // Fetch product master info (image, dates, sku count)
      const masterQuery = `
        SELECT
          MAX(image_url) AS image_url,
          MIN(sales_start_date) AS sales_start_date,
          MAX(sales_end_date) AS sales_end_date,
          COUNT(DISTINCT goods_id) AS sku_count
        FROM ${tableName('t_product_master')}
        WHERE goods_representation_id = @product_code
      `

      // Fetch inventory data per SKU
      const inventoryQuery = `
        SELECT
          goods_id,
          goods_name,
          total_stock,
          free_stock,
          zozo_stock,
          own_stock,
          sales_1day,
          sales_7days,
          sales_30days,
          daily_sales,
          stock_days,
          season_remaining_days,
          is_overstock,
          is_stockout,
          reorder_judgment,
          recommended_discount,
          selling_price,
          cost_price
        FROM ${tableName('t_inventory_health')}
        WHERE product_code = @product_code
      `

      // Fetch MD analysis per SKU
      const mdQuery = `
        SELECT
          goods_id,
          goods_name,
          lifecycle_stance,
          turnover_rate_annual,
          turnover_days,
          last_io_date,
          days_since_last_io,
          stagnation_alert,
          lifecycle_action,
          inventory_status
        FROM ${tableName('t_md_dashboard')}
        WHERE product_code = @product_code
      `

      const queryParams = { product_code }

      const [salesRows, masterRows, inventoryRows, mdRows] = await Promise.all([
        runQuery<SalesRow>(salesQuery, queryParams),
        runQuery<ProductMasterRow>(masterQuery, queryParams),
        runQuery<InventoryRow>(inventoryQuery, queryParams),
        runQuery<MdRow>(mdQuery, queryParams),
      ])

      const sales = salesRows[0]
      if (!sales) {
        return null
      }

      const master = masterRows[0]

      return {
        product_code: sales.product_code,
        product_name: sales.product_name,
        brand: sales.brand,
        category: sales.category,
        season: sales.season,
        price_tier: sales.price_tier,
        selling_price: sales.selling_price,
        cost_price: sales.cost_price,
        sku_count: master?.sku_count || 0,
        image_url: master?.image_url || null,
        sales_start_date: master?.sales_start_date || null,
        sales_end_date: master?.sales_end_date || null,
        total_quantity: sales.total_quantity,
        order_count: sales.order_count,
        sales_amount: sales.sales_amount,
        gross_profit: sales.gross_profit,
        gross_profit_rate: sales.gross_profit_rate,
        inventory: inventoryRows,
        md_analysis: mdRows,
      }
    })

    if (!data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
