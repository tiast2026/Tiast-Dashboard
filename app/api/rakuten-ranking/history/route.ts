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
 *   &genre=100371 (optional: ジャンルID)
 *   &days=30 (optional: 直近N日分, default=90)
 *   &limit=100 (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const productCode = sp.get('product_code')
    const rankingType = sp.get('type')
    const genreId = sp.get('genre')
    const days = parseInt(sp.get('days') || '90', 10)
    const limit = parseInt(sp.get('limit') || '200', 10)

    const cacheKey = buildCacheKey('rakuten-ranking-history-v2', {
      product_code: productCode || undefined,
      type: rankingType || undefined,
      genre: genreId || undefined,
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
        // matched_product_code の完全一致、または item_url に品番が含まれるケースにも対応
        // （過去データで matched_product_code が楽天item_codeのまま保存されている場合の救済）
        conditions.push(
          '(matched_product_code = @product_code OR item_url LIKE CONCAT(\'%/\', @product_code, \'/%\') OR item_url LIKE CONCAT(\'%/\', @product_code))'
        )
        params.product_code = productCode
      }
      if (rankingType) {
        conditions.push('ranking_type = @ranking_type')
        params.ranking_type = rankingType
      }
      if (genreId) {
        conditions.push('genre_id = @genre_id')
        params.genre_id = genreId
      }

      // item_code（楽天APIの一意商品コード）で同一ジャンル・同一日付の重複を排除
      const query = `
        WITH deduped AS (
          SELECT
            *,
            DATE(fetched_at, 'Asia/Tokyo') AS ranked_date,
            ROW_NUMBER() OVER (
              PARTITION BY genre_id, item_code, DATE(fetched_at, 'Asia/Tokyo')
              ORDER BY rank ASC
            ) AS rn
          FROM \`tiast-data-platform.analytics_mart.rakuten_ranking_history\`
          WHERE ${conditions.join(' AND ')}
        )
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
            PARTITION BY genre_id, item_code
          ) AS first_ranked_at,
          MIN(rank) OVER (
            PARTITION BY genre_id, item_code
          ) AS best_rank,
          COUNT(*) OVER (
            PARTITION BY genre_id, item_code
          ) AS rank_count
        FROM deduped
        WHERE rn = 1
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
