import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockProductDetail } from '@/lib/mock-data'
import { getSheetProduct, isSheetsConfigured } from '@/lib/google-sheets'

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
  selling_price: number
  cost_price: number
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
      // Fetch sales data directly from raw orders (not mart table which may be stale)
      const salesQuery = `
        WITH ne_sales AS (
          SELECT
            p.goods_representation_id AS product_code,
            MAX(p.goods_name) AS product_name,
            CASE
              WHEN LEFT(p.goods_representation_id, 1) = 'n' THEN 'NOAHL'
              WHEN LEFT(p.goods_representation_id, 1) = 'b' THEN 'BLACKQUEEN'
              ELSE 'OTHER'
            END AS brand,
            MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
            MAX(CASE
              WHEN SAFE_CAST(RIGHT(p.goods_representation_id, 2) AS INT64) BETWEEN 1 AND 3 THEN '春'
              WHEN SAFE_CAST(RIGHT(p.goods_representation_id, 2) AS INT64) BETWEEN 4 AND 6 THEN '夏'
              WHEN SAFE_CAST(RIGHT(p.goods_representation_id, 2) AS INT64) BETWEEN 7 AND 9 THEN '秋'
              WHEN SAFE_CAST(RIGHT(p.goods_representation_id, 2) AS INT64) BETWEEN 10 AND 12 THEN '冬'
              ELSE ''
            END) AS season,
            MAX(CASE
              WHEN p.goods_selling_price < 3000 THEN '~3,000'
              WHEN p.goods_selling_price < 5000 THEN '3,000~5,000'
              WHEN p.goods_selling_price < 8000 THEN '5,000~8,000'
              WHEN p.goods_selling_price < 10000 THEN '8,000~10,000'
              ELSE '10,000~'
            END) AS price_tier,
            MAX(p.goods_selling_price) AS selling_price,
            MAX(p.goods_cost_price) AS cost_price,
            SUM(o.quantity) AS total_quantity,
            COUNT(DISTINCT o.receive_order_id) AS order_count,
            SUM(o.unit_price * o.quantity) AS sales_amount,
            SUM(o.unit_price * o.quantity)
              - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit,
            SAFE_DIVIDE(
              SUM(o.unit_price * o.quantity)
                - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
              SUM(o.unit_price * o.quantity)
            ) AS gross_profit_rate
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p
            ON o.goods_id = p.goods_id
          WHERE p.goods_representation_id = @product_code
            AND CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
          GROUP BY product_code, brand
        ),
        zozo_sales AS (
          SELECT
            COALESCE(z.ne_goods_representation_id, z.brand_code) AS product_code,
            MAX(z.product_name) AS product_name,
            CASE
              WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
              WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
              ELSE 'OTHER'
            END AS brand,
            MAX(COALESCE(z.child_category, z.parent_category, 'その他')) AS category,
            '' AS season,
            '' AS price_tier,
            MAX(z.proper_price) AS selling_price,
            0 AS cost_price,
            SUM(z.order_quantity) AS total_quantity,
            COUNT(DISTINCT z.order_number) AS order_count,
            SUM(z.selling_price * z.order_quantity) AS sales_amount,
            0 AS gross_profit,
            0 AS gross_profit_rate
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE COALESCE(z.ne_goods_representation_id, z.brand_code) = @product_code
            AND (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
          GROUP BY product_code, brand
        )
        SELECT
          product_code,
          MAX(product_name) AS product_name,
          MAX(brand) AS brand,
          MAX(category) AS category,
          MAX(season) AS season,
          MAX(price_tier) AS price_tier,
          MAX(selling_price) AS selling_price,
          MAX(cost_price) AS cost_price,
          SUM(total_quantity) AS total_quantity,
          SUM(order_count) AS order_count,
          SUM(sales_amount) AS sales_amount,
          SUM(gross_profit) AS gross_profit,
          SAFE_DIVIDE(SUM(gross_profit), SUM(sales_amount)) AS gross_profit_rate
        FROM (
          SELECT * FROM ne_sales
          UNION ALL
          SELECT * FROM zozo_sales
        )
        GROUP BY product_code
      `

      // Fetch product master info (image, dates, sku count)
      const masterQuery = `
        SELECT
          MAX(image_url) AS image_url,
          MIN(sales_start_date) AS sales_start_date,
          MAX(sales_end_date) AS sales_end_date,
          COUNT(DISTINCT goods_id) AS sku_count,
          MAX(selling_price) AS selling_price,
          MAX(cost_price) AS cost_price
        FROM ${tableName('mart_product_master')}
        WHERE product_code = @product_code
      `

      // Fetch inventory data per SKU
      // Use products as base table with LEFT JOIN to inventory_health
      // so we always get SKU list even when stock data is missing
      const inventoryQuery = `
        SELECT
          p.goods_id,
          p.goods_name,
          COALESCE(ih.total_stock, 0) AS total_stock,
          COALESCE(ih.free_stock, 0) AS free_stock,
          COALESCE(ih.zozo_stock, 0) AS zozo_stock,
          COALESCE(ih.own_stock, 0) AS own_stock,
          COALESCE(ih.sales_1day, 0) AS sales_1day,
          COALESCE(ih.sales_7days, 0) AS sales_7days,
          COALESCE(ih.sales_30days, 0) AS sales_30days,
          COALESCE(ih.daily_sales, 0) AS daily_sales,
          COALESCE(ih.stock_days, 0) AS stock_days,
          COALESCE(ih.season_remaining_days, 0) AS season_remaining_days,
          COALESCE(ih.is_overstock, false) AS is_overstock,
          COALESCE(ih.is_stockout, false) AS is_stockout,
          COALESCE(ih.reorder_judgment, '不明') AS reorder_judgment,
          ih.recommended_discount,
          COALESCE(ih.selling_price, p.selling_price) AS selling_price,
          COALESCE(ih.cost_price, p.cost_price) AS cost_price
        FROM \`tiast-data-platform.raw_nextengine.products\` p
        LEFT JOIN ${tableName('mart_inventory_health')} ih
          ON p.goods_id = ih.goods_id
        WHERE p.goods_representation_id = @product_code
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
        FROM ${tableName('mart_md_dashboard')}
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
      const master = masterRows[0]

      // Even if no sales data, return product info with inventory
      if (!sales && inventoryRows.length === 0 && !master) {
        return null
      }

      return {
        product_code: sales?.product_code || product_code,
        product_name: sales?.product_name || inventoryRows[0]?.goods_name || product_code,
        brand: sales?.brand || '',
        category: sales?.category || '',
        season: sales?.season || '',
        price_tier: sales?.price_tier || '',
        selling_price: sales?.selling_price || master?.selling_price || 0,
        cost_price: sales?.cost_price || master?.cost_price || 0,
        sku_count: master?.sku_count || inventoryRows.length,
        image_url: master?.image_url || null,
        sales_start_date: master?.sales_start_date || null,
        sales_end_date: master?.sales_end_date || null,
        total_quantity: sales?.total_quantity || 0,
        order_count: sales?.order_count || 0,
        sales_amount: sales?.sales_amount || 0,
        gross_profit: sales?.gross_profit || 0,
        gross_profit_rate: sales?.gross_profit_rate || 0,
        inventory: inventoryRows,
        md_analysis: mdRows,
      }
    })

    if (!data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Overlay spreadsheet master data (image_url, brand, category, season, dates, prices)
    if (isSheetsConfigured()) {
      try {
        const sheet = await getSheetProduct(product_code)
        if (sheet) {
          if (sheet.image_url) data.image_url = sheet.image_url
          if (sheet.brand) data.brand = sheet.brand
          if (sheet.category) data.category = sheet.category
          if (sheet.season) data.season = sheet.season
          if (sheet.sales_start_date) data.sales_start_date = sheet.sales_start_date
          if (sheet.sales_end_date) data.sales_end_date = sheet.sales_end_date
          if (sheet.selling_price) data.selling_price = sheet.selling_price
          if (sheet.cost_price) data.cost_price = sheet.cost_price
        }
      } catch (e) {
        console.error('Failed to fetch sheet data for product detail:', e)
      }
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
