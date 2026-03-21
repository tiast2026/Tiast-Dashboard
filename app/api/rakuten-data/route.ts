import { NextRequest, NextResponse } from 'next/server'
import { isBigQueryConfigured, runQuery } from '@/lib/bigquery'

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'store_data'
    const shopName = searchParams.get('shop_name')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (type === 'store_data') {
      const where: string[] = []
      const params: Record<string, string | number> = {}

      if (shopName) {
        where.push('shop_name = @shopName')
        params.shopName = shopName
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const data = await runQuery(
        `SELECT * FROM \`${PROJECT}.${DATASET}.rakuten_store_data\`
         ${whereClause}
         ORDER BY date DESC, device
         LIMIT @limit OFFSET @offset`,
        { ...params, limit, offset },
      )

      const [countResult] = await runQuery<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM \`${PROJECT}.${DATASET}.rakuten_store_data\`
         ${whereClause}`,
        params,
      ).catch(() => [{ cnt: 0 }])

      // サマリ: 最新インポート情報
      const [summary] = await runQuery<{
        shops: string[]
        min_date: string
        max_date: string
        total_rows: number
      }>(
        `SELECT
           ARRAY_AGG(DISTINCT shop_name) as shops,
           MIN(CAST(date AS STRING)) as min_date,
           MAX(CAST(date AS STRING)) as max_date,
           COUNT(*) as total_rows
         FROM \`${PROJECT}.${DATASET}.rakuten_store_data\``,
      ).catch(() => [{ shops: [], min_date: '', max_date: '', total_rows: 0 }])

      return NextResponse.json({ data, total: countResult?.cnt || 0, summary })
    }

    return NextResponse.json({ error: '不明なtypeです' }, { status: 400 })
  } catch (error) {
    console.error('[楽天データ取得] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
