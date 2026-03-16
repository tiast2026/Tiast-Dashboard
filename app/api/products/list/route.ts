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
const VALID_PERIODS = ['all', 'month', '7d', '30d', '60d']

function getDateRange(period: string, month?: string): { start: string; end: string } | null {
  if (period === 'all') return null

  const now = new Date()
  if (period === 'month') {
    const m = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, mo] = m.split('-').map(Number)
    const start = `${y}-${String(mo).padStart(2, '0')}-01`
    const lastDay = new Date(y, mo, 0).getDate()
    const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { start, end }
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 60
  const end = now.toISOString().slice(0, 10)
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - days)
  const start = startDate.toISOString().slice(0, 10)
  return { start, end }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const search = searchParams.get('search') || undefined
    const brand = searchParams.get('brand') || undefined
    const category = searchParams.get('category') || undefined
    const season = searchParams.get('season') || undefined
    const price_tier = searchParams.get('price_tier') || undefined
    const period = searchParams.get('period') || 'month'
    const month = searchParams.get('month') || undefined
    const sort_by = searchParams.get('sort_by') || 'sales_amount'
    const sort_order = searchParams.get('sort_order') || 'desc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const per_page = parseInt(searchParams.get('per_page') || '50', 10)

    if (!VALID_SORT_FIELDS.includes(sort_by)) {
      return NextResponse.json({ error: 'Invalid sort_by field' }, { status: 400 })
    }
    const safePeriod = VALID_PERIODS.includes(period) ? period : 'month'

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockProductsList(page, per_page, brand, category, season, search))
    }

    const cacheKey = buildCacheKey('products-list', {
      search, brand, category, season, price_tier, period: safePeriod, month,
      sort_by, sort_order,
      page: String(page), per_page: String(per_page),
    })

    const dateRange = getDateRange(safePeriod, month)

    // Pre-fetch sheet data for category/season filtering (sheet is authoritative)
    let sheetFilterCodes: string[] | null = null
    if ((category || season) && isSheetsConfigured()) {
      try {
        const sheetData = await fetchSheetData()
        const filtered = sheetData.filter(s => {
          if (category && s.category !== category) return false
          if (season && s.season !== season) return false
          if (brand && s.brand !== brand) return false
          return true
        })
        sheetFilterCodes = filtered.map(s => s.product_code)
      } catch (e) {
        console.error('Failed to pre-fetch sheet data for filtering:', e)
      }
    }

    const data = await cachedQuery(cacheKey, async () => {
      const conditions: string[] = []
      const params: Record<string, unknown> = {}

      if (search) {
        // Support multiple product codes separated by comma or newline
        const terms = search.split(/[,\n\r]+/).map(s => s.trim()).filter(Boolean)
        if (terms.length > 1) {
          const placeholders = terms.map((t, i) => `@search_${i}`)
          conditions.push(`s.product_code IN (${placeholders.join(', ')})`)
          terms.forEach((t, i) => { params[`search_${i}`] = t })
        } else if (terms.length === 1) {
          conditions.push('(s.product_name LIKE CONCAT(\'%\', @search, \'%\') OR s.product_code LIKE CONCAT(\'%\', @search, \'%\'))')
          params.search = terms[0]
        }
      }
      if (brand) {
        conditions.push('s.brand = @brand')
        params.brand = brand
      }
      // Category and season: use sheet-filtered product codes instead of SQL filter
      if (sheetFilterCodes !== null) {
        if (sheetFilterCodes.length === 0) {
          // No matching products in sheet — return empty
          return { data: [], total: 0, page, per_page, total_pages: 0 }
        }
        const placeholders = sheetFilterCodes.map((_, i) => `@sf_${i}`)
        conditions.push(`s.product_code IN (${placeholders.join(', ')})`)
        sheetFilterCodes.forEach((code, i) => { params[`sf_${i}`] = code })
      } else {
        // Fallback to SQL-based filtering when sheet is not available
        if (category) {
          conditions.push('s.category = @category')
          params.category = category
        }
        if (season) {
          conditions.push('s.season = @season')
          params.season = season
        }
      }
      if (price_tier) {
        conditions.push('s.price_tier = @price_tier')
        params.price_tier = price_tier
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const orderDirection = sort_order === 'asc' ? 'ASC' : 'DESC'
      const offset = (page - 1) * per_page

      // Date condition for raw orders (used when period != 'all')
      const neDateCond = dateRange
        ? `AND LEFT(o.receive_order_date, 10) >= '${dateRange.start}' AND LEFT(o.receive_order_date, 10) <= '${dateRange.end}'`
        : ''
      const zozoDateCond = dateRange
        ? `AND LEFT(z.order_date, 10) >= '${dateRange.start}' AND LEFT(z.order_date, 10) <= '${dateRange.end}'`
        : ''

      // Sales CTE: inline version of mart_sales_by_product with optional date filter
      const salesCTE = `
        WITH ne_product_sales AS (
          SELECT
            COALESCE(p.goods_representation_id, o.goods_id) AS product_code,
            MAX(p.goods_name) AS product_name,
            CASE WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL' WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN' ELSE 'OTHER' END AS brand,
            MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
            MAX(CASE
              WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 1 AND 3 THEN '春'
              WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 4 AND 6 THEN '夏'
              WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 7 AND 9 THEN '秋'
              WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 10 AND 12 THEN '冬'
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
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
            SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
              - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit,
            SAFE_DIVIDE(
              SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
                - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
              SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
            ) AS gross_profit_rate
          FROM \`tiast-data-platform.raw_nextengine.orders\` o
          LEFT JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
          WHERE CAST(o.cancel_type_id AS STRING) = '0'
            AND CAST(o.row_cancel_flag AS STRING) = '0'
            AND o.receive_order_date IS NOT NULL
            ${neDateCond}
          GROUP BY 1, 3
        ),
        zozo_product_sales AS (
          SELECT
            COALESCE(z.ne_goods_representation_id, z.brand_code) AS product_code,
            MAX(z.product_name) AS product_name,
            CASE WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL' WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN' ELSE 'OTHER' END AS brand,
            MAX(COALESCE(z.child_category, z.parent_category, 'その他')) AS category,
            '' AS season, '' AS price_tier,
            MAX(z.proper_price) AS selling_price, 0 AS cost_price,
            SUM(z.order_quantity) AS total_quantity,
            COUNT(DISTINCT z.order_number) AS order_count,
            SUM(z.selling_price * z.order_quantity) AS sales_amount,
            0 AS gross_profit, 0 AS gross_profit_rate
          FROM \`tiast-data-platform.raw_zozo.zozo_orders\` z
          WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
            AND z.order_date IS NOT NULL
            ${zozoDateCond}
          GROUP BY 1, 3
        ),
        sales_agg AS (
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
            SELECT * FROM ne_product_sales
            UNION ALL
            SELECT * FROM zozo_product_sales
          )
          GROUP BY product_code
        )`

      const countQuery = `
        ${salesCTE}
        SELECT COUNT(*) AS total FROM sales_agg s ${whereClause}
      `
      const countRows = await runQuery<{ total: number }>(countQuery, params)
      const total = countRows[0]?.total || 0

      const sortTable = ['total_stock', 'stock_days'].includes(sort_by) ? 'inv' : 's'
      const dataQuery = `
        ${salesCTE}
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
        FROM sales_agg s
        LEFT JOIN (
          SELECT DISTINCT goods_representation_id, image_url, sales_start_date, sales_end_date
          FROM ${tableName('mart_product_master')}
        ) pm ON s.product_code = pm.goods_representation_id
        LEFT JOIN (
          WITH prod_stock AS (
            SELECT
              p.goods_representation_id AS product_code,
              SUM(st.stock_quantity) AS total_stock,
              SUM(st.stock_free_quantity) AS free_stock
            FROM \`tiast-data-platform.raw_nextengine.stock\` st
            JOIN \`tiast-data-platform.raw_nextengine.products\` p ON st.goods_id = p.goods_id
            GROUP BY p.goods_representation_id
          ),
          prod_daily AS (
            SELECT
              p.goods_representation_id AS product_code,
              SUM(o.quantity) * 1.0 / 30 AS daily_qty
            FROM \`tiast-data-platform.raw_nextengine.orders\` o
            JOIN \`tiast-data-platform.raw_nextengine.products\` p ON o.goods_id = p.goods_id
            WHERE CAST(o.cancel_type_id AS STRING) = '0'
              AND CAST(o.row_cancel_flag AS STRING) = '0'
              AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            GROUP BY p.goods_representation_id
          )
          SELECT
            ps.product_code,
            COALESCE(ps.total_stock, 0) AS total_stock,
            COALESCE(pd.daily_qty, 0) AS daily_sales,
            CASE WHEN COALESCE(pd.daily_qty, 0) > 0
              THEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), pd.daily_qty)
              ELSE 0 END AS stock_days,
            CASE
              WHEN COALESCE(ps.total_stock, 0) = 0 THEN '在庫なし'
              WHEN COALESCE(pd.daily_qty, 0) > 0 AND SAFE_DIVIDE(COALESCE(ps.total_stock, 0), pd.daily_qty) > 90 THEN '過剰'
              ELSE '適正'
            END AS inventory_status
          FROM prod_stock ps
          LEFT JOIN prod_daily pd ON ps.product_code = pd.product_code
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

            // Recalculate gross profit rate including shipping costs
            const sizeVal = (sheet.size || '').trim()
            let shippingRate = 0
            if (sizeVal.includes('メール') || sizeVal === 'M' || sizeVal === 'メール便') {
              shippingRate = 330
            } else if (sizeVal.includes('宅配') || sizeVal === 'L' || sizeVal === '宅配便') {
              shippingRate = 660
            }
            if (shippingRate > 0 && row.sales_amount > 0) {
              const originalGrossProfit = row.gross_profit_rate * row.sales_amount
              const shippingCost = shippingRate * row.total_quantity
              const adjustedGrossProfit = originalGrossProfit - shippingCost
              row.gross_profit_rate = adjustedGrossProfit / row.sales_amount
            }
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
