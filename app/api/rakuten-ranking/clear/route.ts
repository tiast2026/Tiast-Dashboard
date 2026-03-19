import { NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'

/**
 * 楽天ランキング履歴データを全削除
 *
 * DELETE /api/rakuten-ranking/clear
 */
export async function DELETE() {
  if (!isBigQueryConfigured()) {
    return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
  }

  try {
    const bq = getBigQueryClient()
    const query = `DELETE FROM \`tiast-data-platform.analytics_mart.rakuten_ranking_history\` WHERE TRUE`
    await bq.query({ query, location: 'asia-northeast1' })
    return NextResponse.json({ success: true, message: '楽天ランキング履歴を全削除しました' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
