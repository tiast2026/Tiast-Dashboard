import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured, tableName } from '@/lib/bigquery'
import { fetchSheetData } from '@/lib/google-sheets'

interface ReviewRecord {
  review_type: string
  product_name: string
  review_url: string
  rating: number
  posted_at: string
  title: string
  review_body: string
  flag: number
  order_number: string
  unhandled_flag: number
  matched_product_code: string | null
}

function escapeSQL(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function extractProductKeyword(name: string): string {
  const cleaned = name
    .replace(/\s+[A-Z]+\([A-Z]+\)\S*/g, '')
    .replace(/\s+[SMLXF]+サイズ/g, '')
    .replace(/\s+フリーサイズ/g, '')
    .replace(/\s+フリー$/g, '')
    .trim()
  const parts = cleaned.split(/\s+/)
  return parts[0] || name
}

const REVIEW_COLUMNS = `
  review_type, product_name, review_url, rating, posted_at,
  title, review_body, flag, order_number, unhandled_flag, matched_product_code
`

/** Combined view of both product and shop review tables */
function allReviewsTable(): string {
  return `(
    SELECT ${REVIEW_COLUMNS}, shop_name FROM ${tableName('rakuten_reviews')}
    UNION ALL
    SELECT review_type, product_name, review_url, rating, posted_at,
           title, review_body, flag, order_number, unhandled_flag,
           CAST(NULL AS STRING) AS matched_product_code, shop_name
    FROM ${tableName('rakuten_shop_reviews')}
  ) AS all_reviews`
}

/**
 * GET /api/reviews?product_code=xxx&product_name=xxx&limit=50&offset=0&search=xxx&rating=4
 */
export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], summary: null, total: 0 })
    }

    const { searchParams } = new URL(request.url)
    const productCode = searchParams.get('product_code')
    const productName = searchParams.get('product_name')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const reviewType = searchParams.get('type')
    const search = searchParams.get('search')
    const ratingFilter = searchParams.get('rating')
    const matchStatus = searchParams.get('match_status') // 'matched' | 'unmatched'
    const brand = searchParams.get('brand') // 'NOAHL' | 'BLACKQUEEN'

    const conditions: string[] = ['1=1']

    if (brand) {
      conditions.push(`shop_name = '${escapeSQL(brand)}'`)
    }
    if (reviewType) {
      conditions.push(`review_type = '${escapeSQL(reviewType)}'`)
    }
    if (ratingFilter) {
      conditions.push(`rating = ${parseInt(ratingFilter)}`)
    }
    if (matchStatus === 'matched') {
      conditions.push(`matched_product_code IS NOT NULL AND matched_product_code != ''`)
    } else if (matchStatus === 'unmatched') {
      conditions.push(`(matched_product_code IS NULL OR matched_product_code = '')`)
    }

    let productFilter = ''
    if (productCode) {
      productFilter = `AND matched_product_code = '${escapeSQL(productCode)}'`
    }

    if (search) {
      const escaped = escapeSQL(search)
      conditions.push(`(product_name LIKE '%${escaped}%' OR title LIKE '%${escaped}%' OR review_body LIKE '%${escaped}%' OR matched_product_code LIKE '%${escaped}%')`)
    }

    const whereClause = conditions.join(' AND ')

    // Fetch reviews
    let reviews = await runQuery<ReviewRecord>(`
      SELECT ${REVIEW_COLUMNS}
      FROM ${allReviewsTable()}
      WHERE ${whereClause} ${productFilter}
      ORDER BY posted_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)

    // Fallback for product_name search
    if (reviews.length === 0 && productCode && productName && !search) {
      const keyword = extractProductKeyword(productName)
      const escaped = escapeSQL(keyword)
      productFilter = `AND product_name LIKE '%${escaped}%'`

      reviews = await runQuery<ReviewRecord>(`
        SELECT ${REVIEW_COLUMNS}
        FROM ${allReviewsTable()}
        WHERE ${whereClause} ${productFilter}
        ORDER BY posted_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    }

    // Get total count for pagination
    const [countRow] = await runQuery<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM ${allReviewsTable()}
      WHERE ${whereClause} ${productFilter}
    `)
    const total = countRow?.cnt || 0

    // Build summary
    let summary = null
    if (reviews.length > 0) {
      const [row] = await runQuery<{
        total_reviews: number; product_reviews: number; shop_reviews: number
        avg_rating: number; positive_count: number; negative_count: number
        matched_count: number; unmatched_count: number
      }>(`
        SELECT
          COUNT(*) AS total_reviews,
          COUNT(CASE WHEN review_type = '商品レビュー' THEN 1 END) AS product_reviews,
          COUNT(CASE WHEN review_type = 'ショップレビュー' THEN 1 END) AS shop_reviews,
          ROUND(AVG(rating), 2) AS avg_rating,
          COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
          COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count,
          COUNT(CASE WHEN matched_product_code IS NOT NULL AND matched_product_code != '' THEN 1 END) AS matched_count,
          COUNT(CASE WHEN review_type = '商品レビュー' AND (matched_product_code IS NULL OR matched_product_code = '') THEN 1 END) AS unmatched_count
        FROM ${allReviewsTable()}
        WHERE ${whereClause} ${productFilter}
      `)
      summary = row || null
    }

    // Enrich with product images from master sheet
    const masterData = await fetchSheetData()
    const imageMap = new Map<string, string>()
    for (const p of masterData) {
      if (p.product_code && p.image_url) {
        imageMap.set(p.product_code, p.image_url)
      }
    }
    const enriched = reviews.map(r => ({
      ...r,
      image_url: r.matched_product_code ? imageMap.get(r.matched_product_code) || null : null,
    }))

    return NextResponse.json({ data: enriched, summary, total })
  } catch (error) {
    console.error('[レビュー取得] エラー:', error)
    return NextResponse.json({ data: [], summary: null, total: 0, error: String(error) }, { status: 500 })
  }
}
