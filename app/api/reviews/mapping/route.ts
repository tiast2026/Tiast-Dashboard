import { NextRequest, NextResponse } from 'next/server'
import { fetchAllRmsItems, isRmsConfigured } from '@/lib/rakuten-rms'
import {
  writeRmsItemsToSheet,
  fetchReviewMapping,
  getRmsNameToCodeMap,
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
