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

/**
 * GET /api/reviews?product_code=xxx&limit=50
 *
 * Fetch reviews, optionally filtered by product_code
 */
export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], summary: null })
    }

    const { searchParams } = new URL(request.url)
    const productCode = searchParams.get('product_code')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const reviewType = searchParams.get('type') // 商品レビュー or ショップレビュー

    let whereClause = 'WHERE 1=1'
    if (productCode) {
      whereClause += ` AND matched_product_code = '${productCode.replace(/'/g, "")}'`
    }
    if (reviewType) {
      whereClause += ` AND review_type = '${reviewType.replace(/'/g, "")}'`
    }

    // Fetch reviews
    const query = `
      SELECT
        review_type,
        product_name,
        review_url,
        rating,
        posted_at,
        title,
        review_body,
        flag,
        order_number,
        unhandled_flag,
        matched_product_code
      FROM ${tableName('rakuten_reviews')}
      ${whereClause}
      ORDER BY posted_at DESC, _imported_at DESC
      LIMIT ${limit}
    `

    const reviews = await runQuery<ReviewRecord>(query)

    // Fetch summary if product_code is specified
    let summary = null
    if (productCode) {
      const summaryQuery = `
        SELECT
          COUNT(*) AS total_reviews,
          COUNT(CASE WHEN review_type = '商品レビュー' THEN 1 END) AS product_reviews,
          COUNT(CASE WHEN review_type = 'ショップレビュー' THEN 1 END) AS shop_reviews,
          ROUND(AVG(rating), 2) AS avg_rating,
          COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
          COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count,
        FROM ${tableName('rakuten_reviews')}
        WHERE matched_product_code = '${productCode.replace(/'/g, "")}'
      `
      const [summaryRow] = await runQuery<{
        total_reviews: number
        product_reviews: number
        shop_reviews: number
        avg_rating: number
        positive_count: number
        negative_count: number
      }>(summaryQuery)
      summary = summaryRow || null
    }

    return NextResponse.json({ data: reviews, summary })
  } catch (error) {
    console.error('[レビュー取得] エラー:', error)
    return NextResponse.json({ data: [], summary: null, error: String(error) }, { status: 500 })
  }
}
