import { NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'

/**
 * 楽天ランキング履歴データを全削除（テーブル再作成）
 *
 * DELETE /api/rakuten-ranking/clear
 *
 * BigQueryのstreaming bufferにあるデータはDELETE文で削除できないため、
 * テーブルをDROP & CREATEで再作成する
 */
export async function DELETE() {
  if (!isBigQueryConfigured()) {
    return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
  }

  try {
    const bq = getBigQueryClient()
    const dataset = bq.dataset('analytics_mart')
    const table = dataset.table('rakuten_ranking_history')

    // テーブルを削除
    const [exists] = await table.exists()
    if (exists) {
      await table.delete()
    }

    // テーブルを再作成
    await table.create({
      schema: {
        fields: [
          { name: 'fetched_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'ranking_type', type: 'STRING', mode: 'REQUIRED' },
          { name: 'genre_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'rank', type: 'INT64', mode: 'REQUIRED' },
          { name: 'item_name', type: 'STRING', mode: 'NULLABLE' },
          { name: 'item_code', type: 'STRING', mode: 'NULLABLE' },
          { name: 'item_price', type: 'INT64', mode: 'NULLABLE' },
          { name: 'item_url', type: 'STRING', mode: 'NULLABLE' },
          { name: 'image_url', type: 'STRING', mode: 'NULLABLE' },
          { name: 'shop_name', type: 'STRING', mode: 'NULLABLE' },
          { name: 'review_count', type: 'INT64', mode: 'NULLABLE' },
          { name: 'review_average', type: 'FLOAT64', mode: 'NULLABLE' },
          { name: 'is_own_product', type: 'BOOL', mode: 'NULLABLE' },
          { name: 'matched_product_code', type: 'STRING', mode: 'NULLABLE' },
        ],
      },
      timePartitioning: {
        type: 'DAY',
        field: 'fetched_at',
      },
      clustering: {
        fields: ['genre_id', 'is_own_product'],
      },
    })

    return NextResponse.json({ success: true, message: '楽天ランキング履歴を全削除しました' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
