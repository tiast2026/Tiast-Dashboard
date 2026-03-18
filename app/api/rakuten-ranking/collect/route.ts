import { NextRequest, NextResponse } from 'next/server'
import {
  fetchRakutenRanking,
  matchOwnProduct,
  saveRankingToBigQuery,
  fetchMasterProductCodes,
} from '@/lib/rakuten-ranking'
import type { RankingCollectResult } from '@/types/ranking'

// レディースファッション ジャンルID
const GENRE_ID = '100371'

/**
 * 楽天ランキング取得 & BigQuery保存
 *
 * GET /api/rakuten-ranking/collect
 *   ?type=daily (default) | realtime | weekly
 *
 * Vercel Cron または手動実行で呼ばれる
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cronからの呼び出し認証
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // 手動実行の場合はCRON_SECRET未設定でもOK
      if (authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const sp = request.nextUrl.searchParams
    const rankingType = (sp.get('type') || 'daily') as 'realtime' | 'daily' | 'weekly'

    if (!process.env.RAKUTEN_APP_ID) {
      return NextResponse.json(
        { error: 'RAKUTEN_APP_ID is not configured' },
        { status: 500 }
      )
    }

    // 1. 楽天ランキングAPI取得
    const items = await fetchRakutenRanking(rankingType, GENRE_ID)

    // 2. 自社商品マスタの品番リスト取得
    const masterCodes = await fetchMasterProductCodes()

    // 3. 自社商品マッチング
    const matchResults = new Map<number, { isOwn: boolean; matchedCode: string | null }>()
    const ownProducts: RankingCollectResult['own_products'] = []

    for (const item of items) {
      const match = matchOwnProduct(item, masterCodes)
      matchResults.set(item.rank, match)
      if (match.isOwn) {
        ownProducts.push({
          rank: item.rank,
          item_name: item.item_name,
          matched_product_code: match.matchedCode || '',
        })
      }
    }

    // 4. BigQueryに保存
    const savedCount = await saveRankingToBigQuery(items, rankingType, GENRE_ID, matchResults)

    const result: RankingCollectResult = {
      fetched_at: new Date().toISOString(),
      ranking_type: rankingType,
      genre_id: GENRE_ID,
      total_items: items.length,
      own_items: ownProducts.length,
      own_products: ownProducts,
    }

    console.log(
      `[Rakuten Ranking] ${rankingType}: ${items.length} items fetched, ${ownProducts.length} own products found, ${savedCount} rows saved`
    )

    return NextResponse.json(result)
  } catch (e) {
    console.error('Rakuten ranking collect error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to collect ranking' },
      { status: 500 }
    )
  }
}
