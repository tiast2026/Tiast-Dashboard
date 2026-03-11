import { NextResponse } from 'next/server'
import { runQuery, tableName } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

interface AlertRow {
  alert_type: string
  count: number
  amount: number
}

export async function GET() {
  try {
    const cacheKey = buildCacheKey('inventory-alerts', {})

    const data = await cachedQuery(cacheKey, async () => {
      const query = `
        SELECT 'overstock' AS alert_type,
               COUNT(*) AS count,
               COALESCE(SUM(h.stock_retail_value), 0) AS amount
        FROM ${tableName('t_inventory_health')} h
        WHERE h.is_overstock = true

        UNION ALL

        SELECT 'season_ending' AS alert_type,
               COUNT(*) AS count,
               COALESCE(SUM(d.stock_retail_value), 0) AS amount
        FROM ${tableName('t_md_dashboard')} d
        WHERE d.season_remaining_days > 0
          AND d.season_remaining_days < 30
          AND d.total_stock > 0

        UNION ALL

        SELECT 'season_exceeded' AS alert_type,
               COUNT(*) AS count,
               COALESCE(SUM(d.stock_retail_value), 0) AS amount
        FROM ${tableName('t_md_dashboard')} d
        WHERE d.season_remaining_days <= 0
          AND d.total_stock > 0
      `

      const rows = await runQuery<AlertRow>(query)

      const result: Record<string, { count: number; amount: number }> = {
        overstock: { count: 0, amount: 0 },
        season_ending: { count: 0, amount: 0 },
        season_exceeded: { count: 0, amount: 0 },
      }

      for (const row of rows) {
        if (result[row.alert_type]) {
          result[row.alert_type] = { count: row.count, amount: row.amount }
        }
      }

      return result
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
