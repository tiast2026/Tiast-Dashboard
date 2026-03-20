import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import { fetchReviewCSVFromDrive } from '@/lib/google-drive'
import { getReviewMappingMap, getRmsNameToCodeMap, fetchRmsItemsFromSheet } from '@/lib/google-sheets'

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'
const TABLE = 'rakuten_reviews'

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}'`
}

/**
 * Extract the Rakuten item number from a review URL.
 * Example: "https://review.rakuten.co.jp/item/1/338335_10002317/..." → "10002317"
 * Shop reviews: "https://review.rakuten.co.jp/shop/4/338335_338335/..." → null
 */
function extractRakutenItemId(reviewUrl: string): string | null {
  if (!reviewUrl) return null
  // Product review URL pattern: /item/1/SHOPID_ITEMID/...
  const match = reviewUrl.match(/review\.rakuten\.co\.jp\/item\/\d+\/\d+_(\d+)\//)
  return match ? match[1] : null
}

async function ensureTableExists(bq: ReturnType<typeof getBigQueryClient>): Promise<void> {
  const dataset = bq.dataset(DATASET)
  const table = dataset.table(TABLE)
  const [exists] = await table.exists()
  if (exists) return

  console.log('[レビュー] テーブルが存在しないため作成します...')
  await table.create({
    schema: {
      fields: [
        { name: 'review_type', type: 'STRING', mode: 'NULLABLE' },
        { name: 'product_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'review_url', type: 'STRING', mode: 'NULLABLE' },
        { name: 'rating', type: 'INT64', mode: 'NULLABLE' },
        { name: 'posted_at', type: 'STRING', mode: 'NULLABLE' },
        { name: 'title', type: 'STRING', mode: 'NULLABLE' },
        { name: 'review_body', type: 'STRING', mode: 'NULLABLE' },
        { name: 'flag', type: 'INT64', mode: 'NULLABLE' },
        { name: 'order_number', type: 'STRING', mode: 'NULLABLE' },
        { name: 'unhandled_flag', type: 'INT64', mode: 'NULLABLE' },
        { name: 'rakuten_item_id', type: 'STRING', mode: 'NULLABLE' },
        { name: 'matched_product_code', type: 'STRING', mode: 'NULLABLE' },
        { name: '_imported_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
      ],
    },
  })
}

/**
 * POST /api/reviews/import
 * Body: { fileId?, fileName?, folderId?, mode: 'replace' | 'append' | 'scan' }
 *
 * mode='scan': CSVから楽天商品番号と商品名を抽出して返す（インポートしない）
 * mode='replace'/'append': BigQueryにインポート
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { fileId, fileName, folderId, mode = 'replace' } = body as {
      fileId?: string
      fileName?: string
      folderId?: string
      mode?: 'replace' | 'append' | 'scan'
    }

    // 1. Read CSV from Google Drive
    console.log('[レビューインポート] Google DriveからCSV取得中...')
    const reviews = await fetchReviewCSVFromDrive(fileId, fileName || 'レビュー', folderId)

    if (reviews.length === 0) {
      return NextResponse.json({ error: 'レビューデータが見つかりません', imported: 0 })
    }

    // --- scan mode: extract unique Rakuten item IDs with product names ---
    if (mode === 'scan') {
      const itemMap = new Map<string, { product_names: Set<string>; count: number }>()
      for (const r of reviews) {
        const itemId = extractRakutenItemId(r.review_url)
        if (!itemId) continue
        const entry = itemMap.get(itemId) || { product_names: new Set(), count: 0 }
        if (r.product_name) entry.product_names.add(r.product_name)
        entry.count++
        itemMap.set(itemId, entry)
      }

      // Check which are already mapped
      let existingMapping = new Map<string, string>()
      try {
        existingMapping = await getReviewMappingMap()
      } catch { /* ignore if sheet doesn't exist */ }

      const items = Array.from(itemMap.entries()).map(([id, info]) => ({
        rakuten_item_id: id,
        product_names: Array.from(info.product_names),
        review_count: info.count,
        mapped_product_code: existingMapping.get(id) || null,
      }))

      return NextResponse.json({
        total_reviews: reviews.length,
        product_reviews: reviews.filter(r => r.review_type === '商品レビュー').length,
        shop_reviews: reviews.filter(r => r.review_type === 'ショップレビュー').length,
        items,
        unmapped: items.filter(i => !i.mapped_product_code).length,
      })
    }

    // --- import mode ---
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
    }

    const bq = getBigQueryClient()
    await ensureTableExists(bq)

    // 2. Load all mapping sources in parallel
    console.log('[レビューインポート] マッピング読み込み中...')
    const [manualMapping, rmsNameMap, rmsItems] = await Promise.all([
      getReviewMappingMap(),         // 手動マッピング: 楽天商品番号 → 品番
      getRmsNameToCodeMap(),         // RMS商品名 → 品番（商品管理番号）
      fetchRmsItemsFromSheet(),      // RMS商品一覧（itemNumber → item_url）
    ])

    // Build rakuten_item_number → product_code map from RMS data
    const rmsItemNumberMap = new Map<string, string>()
    for (const item of rmsItems) {
      if (item.item_number && item.item_url) {
        rmsItemNumberMap.set(item.item_number, item.item_url)
      }
    }

    console.log(`[レビューインポート] マッピング: 手動=${manualMapping.size}, RMS商品番号=${rmsItemNumberMap.size}, RMS商品名=${rmsNameMap.size}`)

    // 3. Assign matched_product_code (3-tier matching)
    const enrichedReviews = reviews.map(r => {
      const rakutenItemId = extractRakutenItemId(r.review_url)
      let matchedCode: string | null = null
      let matchMethod: string | null = null

      // Tier 1: 手動マッピングシート（楽天商品番号 → 品番）
      if (rakutenItemId && manualMapping.has(rakutenItemId)) {
        matchedCode = manualMapping.get(rakutenItemId)!
        matchMethod = 'manual'
      }

      // Tier 2: RMS itemNumber マッチ（楽天内部ID → 商品管理番号）
      if (!matchedCode && rakutenItemId && rmsItemNumberMap.has(rakutenItemId)) {
        matchedCode = rmsItemNumberMap.get(rakutenItemId)!
        matchMethod = 'rms_item_number'
      }

      // Tier 3: 商品名マッチ（レビューの商品名 → RMS商品名 → 品番）
      if (!matchedCode && r.product_name && rmsNameMap.has(r.product_name)) {
        matchedCode = rmsNameMap.get(r.product_name)!
        matchMethod = 'product_name'
      }

      return { ...r, rakuten_item_id: rakutenItemId, matched_product_code: matchedCode, match_method: matchMethod }
    })

    // 4. Clear existing data if mode is 'replace'
    if (mode === 'replace') {
      const deleteQuery = `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE TRUE`
      await bq.query({ query: deleteQuery, location: 'asia-northeast1' })
      console.log('[レビューインポート] 既存データをクリア')
    }

    // 5. Insert reviews in batches
    const batchSize = 50
    let inserted = 0
    for (let i = 0; i < enrichedReviews.length; i += batchSize) {
      const batch = enrichedReviews.slice(i, i + batchSize)
      const values = batch.map(r =>
        `(${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
        `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
        `${r.flag}, ${sqlStr(r.order_number)}, ${r.unhandled_flag}, ` +
        `${r.rakuten_item_id ? sqlStr(r.rakuten_item_id) : 'NULL'}, ` +
        `${r.matched_product_code ? sqlStr(r.matched_product_code) : 'NULL'}, CURRENT_TIMESTAMP())`
      ).join(',\n')

      const query = `
        INSERT INTO \`${PROJECT}.${DATASET}.${TABLE}\`
        (review_type, product_name, review_url, rating, posted_at, title, review_body,
         flag, order_number, unhandled_flag, rakuten_item_id, matched_product_code, _imported_at)
        VALUES ${values}
      `

      await bq.query({ query, location: 'asia-northeast1' })
      inserted += batch.length
    }

    const matched = enrichedReviews.filter(r => r.matched_product_code).length
    const unmatched = enrichedReviews.filter(r => r.rakuten_item_id && !r.matched_product_code)
    const unmatchedItemIds = Array.from(new Set(unmatched.map(r => r.rakuten_item_id!)))
    const productReviews = enrichedReviews.filter(r => r.review_type === '商品レビュー').length
    const shopReviews = enrichedReviews.filter(r => r.review_type === 'ショップレビュー').length

    console.log(`[レビューインポート] 完了: ${inserted}件 (商品: ${productReviews}, ショップ: ${shopReviews}, マッチ: ${matched})`)
    if (unmatchedItemIds.length > 0) {
      console.log(`[レビューインポート] 未マッチの楽天商品番号: ${unmatchedItemIds.join(', ')}`)
    }

    return NextResponse.json({
      success: true,
      imported: inserted,
      matched,
      product_reviews: productReviews,
      shop_reviews: shopReviews,
      unmatched_item_ids: unmatchedItemIds,
    })
  } catch (error) {
    console.error('[レビューインポート] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
