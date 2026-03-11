import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'
import { getMockInventoryList } from '@/lib/mock-data'

interface InventoryRow {
  goods_id: string
  product_code: string
  goods_name: string
  brand: string
  category: string
  season: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  stock_retail_value: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  lifecycle_stance: string
  inventory_status: string
  reorder_judgment: string
  recommended_discount: number
  lifecycle_action: string
  is_overstock: boolean
}

const ALLOWED_SORT_COLUMNS = new Set([
  'stock_retail_value', 'total_stock', 'daily_sales', 'stock_days',
  'season_remaining_days', 'goods_name', 'brand', 'category', 'season',
])

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const brand = searchParams.get('brand') || undefined
    const category = searchParams.get('category') || undefined
    const season = searchParams.get('season') || undefined
    const status = searchParams.get('status') || undefined
    const lifecycle = searchParams.get('lifecycle') || undefined
    const alertType = searchParams.get('alert_type') || undefined
    const sortBy = searchParams.get('sort_by') || 'stock_retail_value'
    const sortOrder = searchParams.get('sort_order') || 'desc'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50', 10)))

    if (!isBigQueryConfigured()) {
      return NextResponse.json(getMockInventoryList(page, perPage, brand, category, season))
    }

    const cacheKey = buildCacheKey('inventory-list', {
      brand, category, season, status, lifecycle, alertType,
      sortBy, sortOrder, page: String(page), perPage: String(perPage),
    })

    const data = await cachedQuery(cacheKey, async () => {
      const conditions: string[] = []
      const params: Record<string, unknown> = {}

      if (brand) {
        conditions.push('d.brand = @brand')
        params.brand = brand
      }
      if (category) {
        conditions.push('d.category = @category')
        params.category = category
      }
      if (season) {
        conditions.push('d.season = @season')
        params.season = season
      }
      if (status) {
        conditions.push('d.inventory_status = @status')
        params.status = status
      }
      if (lifecycle) {
        conditions.push('d.lifecycle_stance = @lifecycle')
        params.lifecycle = lifecycle
      }
      if (alertType === 'season_ending') {
        conditions.push('d.season_remaining_days > 0')
        conditions.push('d.season_remaining_days < 30')
        conditions.push('d.total_stock > 0')
      } else if (alertType === 'season_exceeded') {
        conditions.push('d.season_remaining_days <= 0')
        conditions.push('d.total_stock > 0')
      } else if (alertType === 'overstock') {
        conditions.push('h.is_overstock = true')
      }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

      // Validate sort column to prevent SQL injection
      const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'stock_retail_value'
      const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC'
      const sortPrefix = ['goods_name', 'brand', 'category', 'season'].includes(safeSortBy) ? 'd.' : ''
      const sortColumn = safeSortBy === 'stock_days'
        ? 'COALESCE(h.stock_days, d.turnover_days)'
        : `${sortPrefix}${safeSortBy}`

      const offset = (page - 1) * perPage

      // Count query
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM ${tableName('mart_md_dashboard')} d
        LEFT JOIN ${tableName('mart_inventory_health')} h ON d.goods_id = h.goods_id
        ${whereClause}
      `

      // Data query
      const dataQuery = `
        SELECT
          d.goods_id,
          d.product_code,
          d.goods_name,
          d.brand,
          d.category,
          d.season,
          d.total_stock,
          d.free_stock,
          d.zozo_stock,
          d.own_stock,
          d.stock_retail_value,
          d.daily_sales,
          COALESCE(h.stock_days, d.turnover_days) AS stock_days,
          d.season_remaining_days,
          d.lifecycle_stance,
          d.inventory_status,
          h.reorder_judgment,
          h.recommended_discount,
          d.lifecycle_action,
          h.is_overstock
        FROM ${tableName('mart_md_dashboard')} d
        LEFT JOIN ${tableName('mart_inventory_health')} h ON d.goods_id = h.goods_id
        ${whereClause}
        ORDER BY ${sortColumn} ${safeSortOrder}
        LIMIT @limit OFFSET @offset
      `

      params.limit = perPage
      params.offset = offset

      const [countRows, dataRows] = await Promise.all([
        runQuery<{ total: number }>(countQuery, params),
        runQuery<InventoryRow>(dataQuery, params),
      ])

      const total = countRows[0]?.total || 0

      return {
        data: dataRows,
        total,
        page,
        per_page: perPage,
        total_pages: Math.ceil(total / perPage),
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
