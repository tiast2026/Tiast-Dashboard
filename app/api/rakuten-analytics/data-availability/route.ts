import { NextRequest, NextResponse } from 'next/server'
import { runQuery, tableName, isBigQueryConfigured } from '@/lib/bigquery'
import { buildCacheKey, cachedQuery } from '@/lib/cache'

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ rakuten: false, official: false })
    }

    const { searchParams } = new URL(request.url)
    const shopName = searchParams.get('shop_name') || ''

    const key = buildCacheKey('data-availability', { shopName })
    const result = await cachedQuery(key, async () => {
      const checks = await Promise.allSettled([
        runQuery<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM ${tableName('rakuten_store_data')} WHERE shop_name LIKE @pattern LIMIT 1`,
          { pattern: shopName ? `%${shopName}%` : '%' }
        ),
        runQuery<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM ${tableName('mart_sales_by_shop_month')} WHERE shop_brand LIKE '%公式%' LIMIT 1`,
        ),
      ])

      const rakutenCount = checks[0].status === 'fulfilled' ? (checks[0].value[0]?.cnt || 0) : 0
      const officialCount = checks[1].status === 'fulfilled' ? (checks[1].value[0]?.cnt || 0) : 0

      return { rakuten: rakutenCount > 0, official: officialCount > 0 }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[data-availability] error:', error)
    return NextResponse.json({ rakuten: false, official: false })
  }
}
