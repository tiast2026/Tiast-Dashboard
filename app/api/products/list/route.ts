import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface ProductRow {
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
}

const VALID_SORT_FIELDS = ['sales_amount', 'gross_profit_rate', 'total_quantity']

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
        FROM ${tableName('t_sales_by_product')} s
        ${whereClause}
      `
      const countRows = await runQuery<{ total: number }>(countQuery, params)
      const total = countRows[0]?.total || 0

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
          pm.sales_end_date
        FROM ${tableName('t_sales_by_product')} s
        LEFT JOIN (
          SELECT DISTINCT
            goods_representation_id,
            image_url,
            sales_start_date,
            sales_end_date
          FROM ${tableName('t_product_master')}
        ) pm ON s.product_code = pm.goods_representation_id
        ${whereClause}
        ORDER BY s.${sort_by} ${orderDirection}
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

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
