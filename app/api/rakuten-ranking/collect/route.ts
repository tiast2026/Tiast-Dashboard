import { NextRequest, NextResponse } from 'next/server'
import {
  fetchRakutenRanking,
  matchOwnProduct,
  saveRankingToBigQuery,
  fetchMasterProductCodes,
  RAKUTEN_GENRES,
} from '@/lib/rakuten-ranking'
import type { RankingCollectResult } from '@/types/ranking'

/**
 * 楽天ランキング取得 & BigQuery保存
 *
 * GET /api/rakuten-ranking/collect
 *   ?genre=all (default) | 100371 | 110729 | ...
 *
 * genre=all の場合、全サブジャンルを順次取得
 * Vercel Cron または手動実行で呼ばれる
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cronからの呼び出し認証
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      if (authHeader) {
        return NextResponse.json({ error: '認証エラー' }, { status: 401 })
      }
    }

    const sp = request.nextUrl.searchParams
    const genreParam = sp.get('genre') || 'all'

    if (!process.env.RAKUTEN_APP_ID || !process.env.RAKUTEN_ACCESS_KEY) {
      return NextResponse.json(
        { error: 'RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY が設定されていません' },
        { status: 500 }
      )
    }

    // 取得対象ジャンルを決定
    const targetGenres = genreParam === 'all'
      ? RAKUTEN_GENRES
      : RAKUTEN_GENRES.filter((g) => g.id === genreParam)

    if (targetGenres.length === 0) {
      return NextResponse.json({ error: `不明なジャンルID: ${genreParam}` }, { status: 400 })
    }

    // 自社商品マスタの品番リスト取得（1回だけ）
    const masterCodes = await fetchMasterProductCodes()

    let totalItems = 0
    let totalOwn = 0
    const allOwnProducts: RankingCollectResult['own_products'] = []
    const genreResults: { genre_id: string; genre_name: string; items: number; own: number }[] = []

    for (const genre of targetGenres) {
      try {
        // 楽天ランキングAPI取得
        const items = await fetchRakutenRanking('daily', genre.id)

        // 自社商品マッチング
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

        // BigQueryに保存
        await saveRankingToBigQuery(items, 'daily', genre.id, matchResults)

        totalItems += items.length
        totalOwn += ownProducts.length
        allOwnProducts.push(...ownProducts)
        genreResults.push({
          genre_id: genre.id,
          genre_name: genre.name,
          items: items.length,
          own: ownProducts.length,
        })

        console.log(
          `[楽天ランキング] ${genre.name}(${genre.id}): ${items.length}件取得、自社商品${ownProducts.length}件`
        )
      } catch (genreError) {
        console.error(`[楽天ランキング] ${genre.name}(${genre.id}) 取得エラー:`, genreError)
        genreResults.push({
          genre_id: genre.id,
          genre_name: genre.name,
          items: 0,
          own: 0,
        })
      }
    }

    const result: RankingCollectResult = {
      fetched_at: new Date().toISOString(),
      ranking_type: 'daily',
      genre_id: genreParam,
      total_items: totalItems,
      own_items: totalOwn,
      own_products: allOwnProducts,
    }

    console.log(
      `[楽天ランキング] 全体: ${targetGenres.length}ジャンル、${totalItems}件取得、自社商品${totalOwn}件`
    )

    return NextResponse.json({ ...result, genre_results: genreResults })
  } catch (e) {
    console.error('楽天ランキング取得エラー:', e)
    const message = e instanceof Error ? e.message : 'ランキング取得に失敗しました'
    const isPermissionError = message.includes('Access Denied') || message.includes('permission') || message.includes('updateData')
    const userMessage = isPermissionError
      ? 'BigQueryへの書き込み権限がありません。GCPコンソールでサービスアカウントに「BigQuery データ編集者」ロールを付与してください。'
      : message
    return NextResponse.json(
      { error: userMessage },
      { status: isPermissionError ? 403 : 500 }
    )
  }
}
