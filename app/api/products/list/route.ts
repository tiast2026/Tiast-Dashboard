import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockProductsList } from '@/lib/mock-data'
import { fetchSheetData, isSheetsConfigured } from '@/lib/google-sheets'

interface ProductRow {
  [key: string]: unknown
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  selling_price: number
  cost_price: number
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null
  collaborator: string | null
  size: string
  total_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
}

const VALID_SORT_FIELDS = ['sales_amount', 'gross_profit_rate', 'total_quantity', 'total_stock', 'stock_days']

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const search = searchParams.get('search') || undefined
    const brand = searchParams.get('brand') || undefined
    const category = searchParams.get('category') || undefined
    const season = searchParams.get('season') || undefined
    const price_tier = searchParams.get('price_tier') || undefined
    const sort_by = searchParams.get('sort_by') || 'sales_amount'
    const sort_order = searchParams.get('sort_order') || 'desc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const per_page = parseInt(searchParams.get('per_page') || '50', 10)

    if (!VALID_SORT_FIELDS.includes(sort_by)) {
      return NextResponse.json({ error: 'Invalid sort_by field' }, { status: 400 })
    }

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockProductsList(page, per_page, brand, category, season, search))
    }

    const cacheKey = buildCacheKey('products-list', {
      search, brand, category, season, price_tier,
      sort_by, sort_order,
      page: String(page), per_page: String(per_page),
    })

    const data = await cachedQuery(cacheKey, async () => {
      const conditions: string[] = []
      const params: Record<string, unknown> = {}

      if (search) {
        conditions.push('(s.product_name LIKE CONCAT(\'%\', @search, \'%\') OR s.product_code LIKE CONCAT(\'%\', @search, \'%\'))')
        params.search = search
      }
      if (brand) {
        conditions.push('s.brand = @brand')
        params.brand = brand
      }
      if (category) {
        conditions.push('s.category = @category')
        params.category = category
      }
      if (season) {
        conditions.push('s.season = @season')
        params.season = season
      }
      if (price_tier) {
        conditions.push('s.price_tier = @price_tier')
        params.price_tier = price_tier
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const orderDirection = sort_order === 'asc' ? 'ASC' : 'DESC'
      const offset = (page - 1) * per_page

      const countQuery = `
        SELECT COUNT(*) AS total
        FROM ${tableName('mart_sales_by_product')} s
        ${whereClause}
      `
      const countRows = await runQuery<{ total: number }>(countQuery, params)
      const total = countRows[0]?.total || 0

      const sortTable = ['total_stock', 'stock_days'].includes(sort_by) ? 'inv' : 's'
      const dataQuery = `
        SELECT
          s.product_code,
          s.product_name,
          s.brand,
          s.category,
          s.season,
          s.selling_price,
          s.cost_price,
          s.total_quantity,
          s.sales_amount,
          s.gross_profit_rate,
          pm.image_url,
          pm.sales_start_date,
          pm.sales_end_date,
          COALESCE(inv.total_stock, 0) AS total_stock,
          COALESCE(inv.daily_sales, 0) AS daily_sales,
          COALESCE(inv.stock_days, 0) AS stock_days,
          COALESCE(inv.inventory_status, '') AS inventory_status
        FROM ${tableName('mart_sales_by_product')} s
        LEFT JOIN (
          SELECT DISTINCT
            goods_representation_id,
            image_url,
            sales_start_date,
            sales_end_date
          FROM ${tableName('mart_product_master')}
        ) pm ON s.product_code = pm.goods_representation_id
        LEFT JOIN (
          SELECT
            product_code,
            SUM(total_stock) AS total_stock,
            SUM(daily_sales) AS daily_sales,
            CASE
              WHEN SUM(daily_sales) > 0 THEN SAFE_DIVIDE(SUM(total_stock), SUM(daily_sales))
              ELSE 0
            END AS stock_days,
            CASE
              WHEN SUM(total_stock) = 0 THEN '在庫なし'
              WHEN SUM(daily_sales) > 0 AND SAFE_DIVIDE(SUM(total_stock), SUM(daily_sales)) > 90 THEN '過剰'
              ELSE '適正'
            END AS inventory_status
          FROM ${tableName('mart_md_dashboard')}
          GROUP BY product_code
        ) inv ON s.product_code = inv.product_code
        ${whereClause}
        ORDER BY ${sortTable}.${sort_by} ${orderDirection}
        LIMIT @limit OFFSET @offset
      `
      params.limit = per_page
      params.offset = offset

      const rows = await runQuery<ProductRow>(dataQuery, params)

      return {
        data: rows,
        total,
        page,
        per_page,
        total_pages: Math.ceil(total / per_page),
      }
    })

    // Overlay product master data (Google Sheets = authoritative source for master fields)
    if (data && isSheetsConfigured()) {
      try {
        const sheetData = await fetchSheetData()
        const sheetMap = new Map(sheetData.map(s => [s.product_code, s]))
        for (const row of data.data) {
          const sheet = sheetMap.get(row.product_code)
          if (sheet) {
            // Master fields: always use product master as the source of truth
            if (sheet.season) row.season = sheet.season
            if (sheet.category) row.category = sheet.category
            if (sheet.selling_price) row.selling_price = sheet.selling_price
            if (sheet.cost_price) row.cost_price = sheet.cost_price
            row.sales_start_date = sheet.sales_start_date || row.sales_start_date
            row.sales_end_date = sheet.sales_end_date || row.sales_end_date
            row.collaborator = sheet.collaborator || null
            row.size = sheet.size || ''
            row.image_url = sheet.image_url || row.image_url
            if (sheet.brand) row.brand = sheet.brand
          }
        }
      } catch (e) {
        console.error('Failed to fetch sheet data for product list:', e)
      }
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
