import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured, tableName } from '@/lib/bigquery'

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

/**
 * Extract the core product keyword from a goods_name like:
 * "ドットニットカーディガン ミント×ブラック F(M)フリー" → "ドットニットカーディガン"
 * Strips color/size suffixes and takes the first meaningful word.
 */
function extractProductKeyword(name: string): string {
  // Remove common size patterns: F(M)フリー, Mサイズ, etc.
  const cleaned = name
    .replace(/\s+[A-Z]+\([A-Z]+\)\S*/g, '') // F(M)フリー
    .replace(/\s+[SMLXF]+サイズ/g, '')
    .replace(/\s+フリーサイズ/g, '')
    .replace(/\s+フリー$/g, '')
    .trim()

  // Take first token (the product name before color/size)
  const parts = cleaned.split(/\s+/)
  // Return the first part which is typically the product type name
  return parts[0] || name
}

const REVIEW_COLUMNS = `
  review_type, product_name, review_url, rating, posted_at,
  title, review_body, flag, order_number, unhandled_flag, matched_product_code
`

/**
 * GET /api/reviews?product_code=xxx&product_name=xxx&limit=50
 *
 * Fetch reviews filtered by product_code (matched_product_code) or product_name fallback.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], summary: null })
    }

    const { searchParams } = new URL(request.url)
    const productCode = searchParams.get('product_code')
    const productName = searchParams.get('product_name')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const reviewType = searchParams.get('type')

    const typeFilter = reviewType
      ? ` AND review_type = '${escapeSQL(reviewType)}'`
      : ''

    // Build the product filter: try matched_product_code first, fallback to product_name LIKE
    let productFilter = ''
    if (productCode) {
      productFilter = `AND matched_product_code = '${escapeSQL(productCode)}'`
    }

    // Fetch reviews with product_code filter
    let reviews = await runQuery<ReviewRecord>(`
      SELECT ${REVIEW_COLUMNS}
      FROM ${tableName('rakuten_reviews')}
      WHERE 1=1 ${productFilter} ${typeFilter}
      ORDER BY posted_at DESC, _imported_at DESC
      LIMIT ${limit}
    `)

    // Fallback: if product_code returned no results and product_name is available,
    // search by product_name keyword (partial match)
    if (reviews.length === 0 && productName) {
      const keyword = extractProductKeyword(productName)
      const escaped = escapeSQL(keyword)
      productFilter = `AND product_name LIKE '%${escaped}%'`

      reviews = await runQuery<ReviewRecord>(`
        SELECT ${REVIEW_COLUMNS}
        FROM ${tableName('rakuten_reviews')}
        WHERE 1=1 ${productFilter} ${typeFilter}
        ORDER BY posted_at DESC, _imported_at DESC
        LIMIT ${limit}
      `)
    }

    // Build summary
    let summary = null
    if ((productCode || productName) && reviews.length > 0) {
      // Calculate summary from the fetched reviews (avoid extra query)
      const totalReviews = reviews.length
      const productReviews = reviews.filter(r => r.review_type === '商品レビュー').length
      const shopReviews = reviews.filter(r => r.review_type === 'ショップレビュー').length
      const avgRating = reviews.reduce((s, r) => s + r.rating, 0) / totalReviews
      const positiveCount = reviews.filter(r => r.rating >= 4).length
      const negativeCount = reviews.filter(r => r.rating <= 2).length

      // If we might be missing reviews (hit limit), fetch full count
      if (reviews.length >= limit) {
        const countQuery = `
          SELECT
            COUNT(*) AS total_reviews,
            COUNT(CASE WHEN review_type = '商品レビュー' THEN 1 END) AS product_reviews,
            COUNT(CASE WHEN review_type = 'ショップレビュー' THEN 1 END) AS shop_reviews,
            ROUND(AVG(rating), 2) AS avg_rating,
            COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
            COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count
          FROM ${tableName('rakuten_reviews')}
          WHERE 1=1 ${productFilter}
        `
        const [row] = await runQuery<{
          total_reviews: number; product_reviews: number; shop_reviews: number
          avg_rating: number; positive_count: number; negative_count: number
        }>(countQuery)
        summary = row || null
      } else {
        summary = {
          total_reviews: totalReviews,
          product_reviews: productReviews,
          shop_reviews: shopReviews,
          avg_rating: Math.round(avgRating * 100) / 100,
          positive_count: positiveCount,
          negative_count: negativeCount,
        }
      }
    }

    return NextResponse.json({ data: reviews, summary })
  } catch (error) {
    console.error('[レビュー取得] エラー:', error)
    return NextResponse.json({ data: [], summary: null, error: String(error) }, { status: 500 })
  }
}
