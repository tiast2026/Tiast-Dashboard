import { NextResponse } from 'next/server'
import { runQuery, tableName } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface SeasonSummaryRow {
  season: string
  in_season_amount: number
  exceeded_amount: number
  total_amount: number
}

export async function GET() {
  try {
    const cacheKey = buildCacheKey('inventory-season-summary', {})

    const data = await cachedQuery(cacheKey, async () => {
      const query = `
        SELECT
          season,
          COALESCE(SUM(CASE WHEN season_remaining_days > 0 THEN stock_retail_value ELSE 0 END), 0) AS in_season_amount,
          COALESCE(SUM(CASE WHEN season_remaining_days <= 0 THEN stock_retail_value ELSE 0 END), 0) AS exceeded_amount,
          COALESCE(SUM(stock_retail_value), 0) AS total_amount
        FROM ${tableName('t_md_dashboard')}
        GROUP BY season
        ORDER BY total_amount DESC
      `

      return await runQuery<SeasonSummaryRow>(query)
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
