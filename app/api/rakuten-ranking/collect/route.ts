import { NextRequest, NextResponse } from 'next/server'
import {
  fetchRakutenRanking,
  matchOwnProduct,
  saveRankingToBigQuery,
  fetchMasterProductCodes,
  RAKUTEN_GENRES,
} from '@/lib/rakuten-ranking'
import type { RankingCollectResult } from '@/types/ranking'

// Vercel Hobby: 最大60秒、Pro: 最大300秒
export const maxDuration = 60

/**
 * 楽天ランキング取得 & BigQuery保存
 *
 * GET /api/rakuten-ranking/collect
 *   ?genre=all (default) | 100371 | 110729 | ...
 *   &batch=0 (default) — バッチ番号（genre=all時、ジャンルを分割取得）
 *   &batch_size=3 (default) — 1バッチあたりのジャンル数
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
    const allTargetGenres = genreParam === 'all'
      ? RAKUTEN_GENRES
      : RAKUTEN_GENRES.filter((g) => g.id === genreParam)

    if (allTargetGenres.length === 0) {
      return NextResponse.json({ error: `不明なジャンルID: ${genreParam}` }, { status: 400 })
    }

    // バッチ分割: genre=all 時にジャンルを分割して取得
    const batchIndex = parseInt(sp.get('batch') || '0', 10)
    const batchSize = parseInt(sp.get('batch_size') || '3', 10)
    const start = batchIndex * batchSize
    const targetGenres = genreParam === 'all'
      ? allTargetGenres.slice(start, start + batchSize)
      : allTargetGenres

    if (targetGenres.length === 0) {
      return NextResponse.json({
        message: 'このバッチには処理対象のジャンルがありません',
        batch: batchIndex,
        total_genres: allTargetGenres.length,
      })
    }

    const totalBatches = genreParam === 'all' ? Math.ceil(allTargetGenres.length / batchSize) : 1

    // 自社商品マスタの品番リスト取得（1回だけ）
    const masterCodes = await fetchMasterProductCodes()

    let totalItems = 0
    let totalOwn = 0
    let skippedGenres = 0
    const allOwnProducts: RankingCollectResult['own_products'] = []
    const genreResults: { genre_id: string; genre_name: string; items: number; own: number; skipped?: boolean }[] = []

    for (const genre of targetGenres) {
      try {
        // 楽天ランキングAPI取得
        const { items, lastBuildDate } = await fetchRakutenRanking('daily', genre.id)

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

        // BigQueryに保存（ランキング発表日時を渡す）重複時は0件が返る
        const savedCount = await saveRankingToBigQuery(items, 'daily', genre.id, matchResults, lastBuildDate)

        if (savedCount === 0 && items.length > 0) {
          // 既に保存済みのためスキップ
          skippedGenres++
          genreResults.push({
            genre_id: genre.id,
            genre_name: genre.name,
            items: items.length,
            own: ownProducts.length,
            skipped: true,
          })
          console.log(
            `[楽天ランキング] ${genre.name}(${genre.id}): ${items.length}件取得済み（スキップ）`
          )
          continue
        }

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
      `[楽天ランキング] バッチ${batchIndex + 1}/${totalBatches}: ${targetGenres.length}ジャンル、${totalItems}件取得、自社商品${totalOwn}件`
    )

    // 次のバッチがある場合、自動チェーン呼び出し
    const nextBatch = batchIndex + 1
    const hasMore = genreParam === 'all' && nextBatch < totalBatches
    if (hasMore) {
      const baseUrl = request.nextUrl.clone()
      baseUrl.searchParams.set('batch', String(nextBatch))
      baseUrl.searchParams.set('batch_size', String(batchSize))
      // fire-and-forget で次バッチを開始（待たずにレスポンスを返す）
      fetch(baseUrl.toString(), {
        headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
      }).catch((err) => console.error(`[楽天ランキング] 次バッチ(${nextBatch})の呼び出しに失敗:`, err))
    }

    return NextResponse.json({
      ...result,
      genre_results: genreResults,
      skipped_genres: skippedGenres,
      batch: batchIndex,
      total_batches: totalBatches,
      has_more: hasMore,
    })
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
