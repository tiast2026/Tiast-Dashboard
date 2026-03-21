import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRmsItems, isRmsConfigured, fetchItemNumberMappings } from '@/lib/rakuten-rms'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import {
  writeRmsItemsToSheet,
  fetchReviewMapping,
  getRmsNameToCodeMap,
  appendReviewMappings,
  type RmsItemRow,
} from '@/lib/google-sheets'

/**
 * POST /api/reviews/mapping
 * Body: { action: 'sync' | 'status' }
 *
 * action='sync':   RMS API v2.0から全商品を取得 → Google Sheets「RMS商品マスタ」に書き込み
 * action='status': 現在のマッピング状況を返す
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
      // 1. RMS APIから楽天商品番号→品番マッピングを取得
      if (!isRmsConfigured()) {
        return NextResponse.json({
          error: 'RMS API未設定。RAKUTEN_RMS_SHOPS 環境変数を設定してください',
        }, { status: 400 })
      }
      if (!isBigQueryConfigured()) {
        return NextResponse.json({ error: 'BigQuery未設定' }, { status: 400 })
      }

      console.log('[rematch] RMS APIから楽天商品番号マッピングを取得中...')
      const rmsMappings = await fetchItemNumberMappings()
      console.log(`[rematch] RMS APIから ${rmsMappings.length}件のマッピング取得`)

      // 2. マッピングシートに書き込み
      const sheetMappings = rmsMappings.map(m => ({
        rakuten_item_id: m.itemNumber,
        product_code: m.manageNumber,
      }))
      const added = await appendReviewMappings(sheetMappings)
      console.log(`[rematch] マッピングシートに ${added}件追加`)

      // 3. BigQueryのmatched_product_codeを更新
      const bq = getBigQueryClient()
      const PROJECT = 'tiast-data-platform'
      const DATASET = 'analytics_mart'
      const TABLE = 'rakuten_reviews'

      // Build CASE WHEN for bulk UPDATE
      const allMappings = await fetchReviewMapping(true)
      if (allMappings.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'マッピングデータが見つかりません',
          rms_mappings: rmsMappings.length,
          sheet_added: added,
          bq_updated: 0,
        })
      }

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

      const [, job] = await bq.query({ query: updateQuery, location: 'asia-northeast1' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobMeta = job as any
      const stats = jobMeta?.metadata?.statistics
      const updatedRows = stats?.numDmlAffectedRows || stats?.query?.numDmlAffectedRows || '不明'

      console.log(`[rematch] BigQuery更新完了: ${updatedRows}行`)

      return NextResponse.json({
        success: true,
        rms_mappings: rmsMappings.length,
        sheet_added: added,
        bq_updated: updatedRows,
        total_mappings: allMappings.length,
        message: `${updatedRows}件のレビューにmatched_product_codeを設定しました`,
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
