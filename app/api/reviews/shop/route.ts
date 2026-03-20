import { NextRequest, NextResponse } from 'next/server'
import { runQuery, isBigQueryConfigured, tableName } from '@/lib/bigquery'

interface ShopReviewRecord {
  shop_name: string
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
}

/**
 * GET /api/reviews/shop?shop_name=NOAHL&limit=50
 *
 * Fetch shop reviews from the dedicated rakuten_shop_reviews table.
 */
export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ data: [], summary: null })
    }

    const { searchParams } = new URL(request.url)
    const shopName = searchParams.get('shop_name')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

    const shopFilter = shopName
      ? `AND shop_name = '${shopName.replace(/'/g, "\\'")}'`
      : ''

    const reviews = await runQuery<ShopReviewRecord>(`
      SELECT shop_name, review_type, product_name, review_url, rating, posted_at,
             title, review_body, flag, order_number, unhandled_flag
      FROM ${tableName('rakuten_shop_reviews')}
      WHERE 1=1 ${shopFilter}
      ORDER BY posted_at DESC, _imported_at DESC
      LIMIT ${limit}
    `)

    // Summary
    const totalReviews = reviews.length
    const avgRating = totalReviews > 0
      ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / totalReviews * 100) / 100
      : 0
    const positiveCount = reviews.filter(r => r.rating >= 4).length
    const negativeCount = reviews.filter(r => r.rating <= 2).length

    const summary = {
      total_reviews: totalReviews,
      avg_rating: avgRating,
      positive_count: positiveCount,
      negative_count: negativeCount,
    }

    return NextResponse.json({ data: reviews, summary })
  } catch (error) {
    console.error('[ショップレビュー取得] エラー:', error)
    return NextResponse.json({ data: [], summary: null, error: String(error) }, { status: 500 })
  }
}
