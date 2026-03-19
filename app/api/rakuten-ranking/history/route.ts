import { NextRequest, NextResponse } from 'next/server'
import { runQuery } from '@/lib/bigquery'
import { cachedQuery, buildCacheKey } from '@/lib/cache'
import type { OwnProductRanking } from '@/types/ranking'

/**
 * 自社商品の楽天ランキング履歴を取得
 *
 * GET /api/rakuten-ranking/history
 *   ?product_code=nl-tp01 (optional: 特定商品のみ)
 *   &type=daily (optional: ranking種別)
 *   &days=30 (optional: 直近N日分, default=90)
 *   &limit=100 (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const productCode = sp.get('product_code')
    const rankingType = sp.get('type')
    const days = parseInt(sp.get('days') || '90', 10)
    const limit = parseInt(sp.get('limit') || '200', 10)

    const cacheKey = buildCacheKey('rakuten-ranking-history', {
      product_code: productCode || undefined,
      type: rankingType || undefined,
      days: String(days),
      limit: String(limit),
    })

    const data = await cachedQuery(cacheKey, async () => {
      const conditions: string[] = [
        'is_own_product = TRUE',
        `fetched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${days} DAY)`,
      ]
      const params: Record<string, string> = {}

      if (productCode) {
        conditions.push('matched_product_code = @product_code')
        params.product_code = productCode
      }
      if (rankingType) {
        conditions.push('ranking_type = @ranking_type')
        params.ranking_type = rankingType
      }

      const query = `
        SELECT
          fetched_at,
          ranking_type,
          genre_id,
          rank,
          item_name,
          item_code,
          item_price,
          item_url,
          image_url,
          shop_name,
          matched_product_code,
          review_count,
          review_average,
          MIN(fetched_at) OVER (
            PARTITION BY matched_product_code, ranking_type, genre_id
          ) AS first_ranked_at,
          MIN(rank) OVER (
            PARTITION BY matched_product_code, ranking_type, genre_id
          ) AS best_rank,
          COUNT(*) OVER (
            PARTITION BY matched_product_code, ranking_type, genre_id
          ) AS rank_count
        FROM \`tiast-data-platform.analytics_mart.rakuten_ranking_history\`
        WHERE ${conditions.join(' AND ')}
        ORDER BY fetched_at DESC, rank ASC
        LIMIT ${limit}
      `

      return runQuery<OwnProductRanking>(query, params)
    }, 10 * 60 * 1000) // 10分キャッシュ

    return NextResponse.json(data)
  } catch (e) {
    console.error('楽天ランキング履歴取得エラー:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'ランキング履歴の取得に失敗しました' },
      { status: 500 }
    )
  }
}
