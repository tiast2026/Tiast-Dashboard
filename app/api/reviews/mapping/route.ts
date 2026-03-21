import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRmsItems, isRmsConfigured } from '@/lib/rakuten-rms'
import { getBigQueryClient, isBigQueryConfigured, runQuery, tableName } from '@/lib/bigquery'
import { batchScrapeProductCodes } from '@/lib/rakuten-review-scraper'
import {
  writeRmsItemsToSheet,
  fetchReviewMapping,
  getRmsNameToCodeMap,
  getReviewMappingMap,
  appendReviewMappings,
  type RmsItemRow,
} from '@/lib/google-sheets'

// Allow up to 60s for scraping (Vercel Pro)
export const maxDuration = 60

/**
 * POST /api/reviews/mapping
 * Body: { action: 'sync' | 'rematch' | 'status' }
 *
 * action='sync':     RMS API v2.0から全商品を取得 → Google Sheets「RMS商品マスタ」に書き込み
 * action='rematch':  レビューページをスクレイピングして品番を取得 → マッピングシート + BQ更新
 * action='status':   現在のマッピング状況を返す
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { action = 'status' } = body as { action?: string }

    if (action === 'sync') {
      if (!isRmsConfigured()) {
        return NextResponse.json({
          error: 'RMS API未設定。RAKUTEN_RMS_SHOPS 環境変数を設定してください',
        }, { status: 400 })
      }

      console.log('[マッピング同期] RMS API v2.0から商品取得中...')
      const rmsItems = await fetchAllRmsItems()

      // 倉庫商品を除外してSheetに書き込み
      const activeItems = rmsItems.filter(i => !i.hideItem)
      const sheetItems: RmsItemRow[] = activeItems.map(item => ({
        item_url: item.manageNumber,
        item_name: item.itemName,
        item_price: 0,
        item_number: '', // RMS API v2.0では内部IDは取れない
      }))

      await writeRmsItemsToSheet(sheetItems)

      return NextResponse.json({
        success: true,
        total_items: rmsItems.length,
        active_items: activeItems.length,
        hidden_items: rmsItems.length - activeItems.length,
        message: `${activeItems.length}件の商品をRMS商品マスタに書き込みました（倉庫${rmsItems.length - activeItems.length}件除外）`,
      })
    }

    if (action === 'rematch') {
      if (!isBigQueryConfigured()) {
        return NextResponse.json({ error: 'BigQuery未設定' }, { status: 400 })
      }

      // 1. BQからmatched_product_codeがNULLのレビューURLを取得
      console.log('[rematch] matched_product_code未設定のレビューを取得中...')
      const unmatchedRows = await runQuery<{ rakuten_item_id: string; review_url: string }>(`
        SELECT DISTINCT rakuten_item_id, MIN(review_url) AS review_url
        FROM ${tableName('rakuten_reviews')}
        WHERE (matched_product_code IS NULL OR matched_product_code = '')
          AND rakuten_item_id IS NOT NULL
        GROUP BY rakuten_item_id
      `)

      if (unmatchedRows.length === 0) {
        return NextResponse.json({
          success: true,
          message: '未マッチのレビューはありません',
          scraped: 0,
          bq_updated: 0,
        })
      }

      console.log(`[rematch] ${unmatchedRows.length}件の未マッチ商品を処理中...`)

      // 2. 既存マッピングを取得
      const existingMap = await getReviewMappingMap()

      // 3. レビューページをスクレイピングして品番を取得
      const reviewUrls = unmatchedRows.map(r => r.review_url)
      const scrapedMap = await batchScrapeProductCodes(reviewUrls, existingMap)

      // 4. 新しいマッピングをシートに保存
      const newMappings = Array.from(scrapedMap.entries())
        .filter(([id]) => !existingMap.has(id))
        .map(([id, code]) => ({ rakuten_item_id: id, product_code: code }))
      const added = await appendReviewMappings(newMappings)
      console.log(`[rematch] マッピングシート: ${added}件追加`)

      // 5. BigQueryのmatched_product_codeを一括UPDATE
      const allMappings = await fetchReviewMapping(true)
      if (allMappings.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'スクレイピングで品番を取得できませんでした',
          scraped: scrapedMap.size,
          sheet_added: added,
          bq_updated: 0,
        })
      }

      const bq = getBigQueryClient()
      const PROJECT = 'tiast-data-platform'
      const DATASET = 'analytics_mart'
      const TABLE = 'rakuten_reviews'

      const caseWhen = allMappings
        .map(m => `WHEN '${m.rakuten_item_id}' THEN '${m.product_code}'`)
        .join('\n          ')
      const itemIds = allMappings.map(m => `'${m.rakuten_item_id}'`).join(', ')

      const updateQuery = `
        UPDATE \`${PROJECT}.${DATASET}.${TABLE}\`
        SET matched_product_code = CASE rakuten_item_id
          ${caseWhen}
          ELSE matched_product_code
        END
        WHERE rakuten_item_id IN (${itemIds})
          AND (matched_product_code IS NULL OR matched_product_code = '')
      `

      await bq.query({ query: updateQuery, location: 'asia-northeast1' })
      console.log(`[rematch] BigQuery更新完了`)

      return NextResponse.json({
        success: true,
        unmatched_items: unmatchedRows.length,
        scraped: scrapedMap.size,
        sheet_added: added,
        total_mappings: allMappings.length,
        message: `${scrapedMap.size}件の品番をスクレイピングで取得し、BigQueryを更新しました`,
      })
    }

    // --- status ---
    const [manualMapping, rmsNameMap] = await Promise.all([
      fetchReviewMapping(),
      getRmsNameToCodeMap(),
    ])

    return NextResponse.json({
      manual_mapping_count: manualMapping.length,
      rms_items_count: rmsNameMap.size,
      manual_mappings: manualMapping,
    })
  } catch (error) {
    console.error('[マッピング] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
