import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import {
  fetchAllShopReviewCSVs,
  deleteDriveFiles,
} from '@/lib/google-drive'
import { getReviewMappingMap } from '@/lib/google-sheets'
import { batchScrapeProductCodes } from '@/lib/rakuten-review-scraper'

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'
const TABLE = 'rakuten_reviews'

function sqlStr(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function extractRakutenItemId(reviewUrl: string): string | null {
  if (!reviewUrl) return null
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
        { name: 'shop_name', type: 'STRING', mode: 'NULLABLE' },
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

async function getExistingReviewKeys(
  bq: ReturnType<typeof getBigQueryClient>,
): Promise<Set<string>> {
  try {
    const [rows] = await bq.query({
      query: `SELECT DISTINCT CONCAT(IFNULL(review_url,''), '|', IFNULL(posted_at,'')) AS review_key FROM \`${PROJECT}.${DATASET}.${TABLE}\``,
      location: 'asia-northeast1',
    })
    const set = new Set<string>()
    for (const row of rows as { review_key: string }[]) {
      if (row.review_key) set.add(row.review_key)
    }
    return set
  } catch {
    return new Set()
  }
}

function makeReviewKey(reviewUrl: string, postedAt: string): string {
  return `${reviewUrl || ''}|${postedAt || ''}`
}

/**
 * Core import logic shared by GET (Vercel Cron) and POST (manual).
 */
async function runImport(dryRun = false) {
  if (!isBigQueryConfigured()) {
    return { error: 'BigQuery未設定', status: 500 }
  }

  // 1. Fetch all "reviews*" CSVs from both shop folders
  console.log(`[レビューインポート] NOAHL + BLACKQUEEN のDriveフォルダからreviews CSVを取得中...`)
  const { reviews, fileIds } = await fetchAllShopReviewCSVs()

  if (reviews.length === 0) {
    return {
      success: true,
      message: 'reviews CSVファイルが見つかりません',
      imported: 0,
      skipped_duplicates: 0,
      files_found: 0,
    }
  }

  console.log(`[レビューインポート] ${reviews.length}件のレビュー（${fileIds.length}ファイル）`)

  const bq = getBigQueryClient()
  await ensureTableExists(bq)

  // 2. Duplicate check (review_url + posted_at)
  console.log('[レビューインポート] 既存レビュー取得中（重複チェック用）...')
  const existingKeys = await getExistingReviewKeys(bq)
  console.log(`[レビューインポート] 既存レビュー: ${existingKeys.size}件`)

  const newReviews = reviews.filter(r => !existingKeys.has(makeReviewKey(r.review_url, r.posted_at)))
  const skipped = reviews.length - newReviews.length
  console.log(`[レビューインポート] 新規: ${newReviews.length}件, 重複スキップ: ${skipped}件`)

  if (newReviews.length === 0) {
    if (!dryRun && fileIds.length > 0) {
      console.log(`[レビューインポート] 新規レビューなし。CSVファイルを削除中...`)
      const delResult = await deleteDriveFiles(fileIds.map(f => f.id))
      console.log(`[レビューインポート] ${delResult.deleted}ファイル削除完了`)
    }
    return {
      success: true,
      message: '新規レビューはありません（全て取り込み済み）',
      imported: 0,
      skipped_duplicates: skipped,
      files_found: fileIds.length,
      files_deleted: dryRun ? 0 : fileIds.length,
    }
  }

  // 3. Scrape product codes from review pages
  const productReviewUrls = newReviews
    .map(r => r.review_url)
    .filter(url => url && url.includes('review.rakuten.co.jp/item/'))

  let manualMapping = new Map<string, string>()
  try {
    manualMapping = await getReviewMappingMap()
  } catch { /* ignore */ }

  console.log('[レビューインポート] レビューページから品番をスクレイピング中...')
  const scrapedMapping = await batchScrapeProductCodes(productReviewUrls, manualMapping)
  console.log(`[レビューインポート] スクレイピング結果: ${scrapedMapping.size}件マッチ`)

  // 4. Enrich reviews
  const enrichedReviews = newReviews.map(r => {
    const rakutenItemId = extractRakutenItemId(r.review_url)
    let matchedCode: string | null = null

    if (rakutenItemId && scrapedMapping.has(rakutenItemId)) {
      matchedCode = scrapedMapping.get(rakutenItemId)!
    } else if (rakutenItemId && manualMapping.has(rakutenItemId)) {
      matchedCode = manualMapping.get(rakutenItemId)!
    }

    return { ...r, rakuten_item_id: rakutenItemId, matched_product_code: matchedCode }
  })

  if (dryRun) {
    const matched = enrichedReviews.filter(r => r.matched_product_code).length
    return {
      success: true,
      dry_run: true,
      would_import: enrichedReviews.length,
      would_match: matched,
      skipped_duplicates: skipped,
      files_found: fileIds.map(f => f.name),
    }
  }

  // 5. Insert into BigQuery
  const batchSize = 50
  let inserted = 0
  for (let i = 0; i < enrichedReviews.length; i += batchSize) {
    const batch = enrichedReviews.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${sqlStr(r.shop_name)}, ${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
      `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
      `${r.flag}, ${sqlStr(r.order_number)}, ${r.unhandled_flag}, ` +
      `${r.rakuten_item_id ? sqlStr(r.rakuten_item_id) : 'NULL'}, ` +
      `${r.matched_product_code ? sqlStr(r.matched_product_code) : 'NULL'}, CURRENT_TIMESTAMP())`
    ).join(',\n')

    const query = `
      INSERT INTO \`${PROJECT}.${DATASET}.${TABLE}\`
      (shop_name, review_type, product_name, review_url, rating, posted_at, title, review_body,
       flag, order_number, unhandled_flag, rakuten_item_id, matched_product_code, _imported_at)
      VALUES ${values}
    `

    await bq.query({ query, location: 'asia-northeast1' })
    inserted += batch.length
  }

  // 6. Delete CSV files from Drive
  console.log(`[レビューインポート] CSVファイルを削除中...`)
  const delResult = await deleteDriveFiles(fileIds.map(f => f.id))
  console.log(`[レビューインポート] ${delResult.deleted}ファイル削除完了`)
  if (delResult.errors.length > 0) {
    console.warn(`[レビューインポート] 削除エラー:`, delResult.errors)
  }

  const matched = enrichedReviews.filter(r => r.matched_product_code).length
  const productReviews = enrichedReviews.filter(r => r.review_type === '商品レビュー').length
  const shopReviews = enrichedReviews.filter(r => r.review_type === 'ショップレビュー').length

  console.log(`[レビューインポート] 完了: ${inserted}件新規インポート (商品: ${productReviews}, ショップ: ${shopReviews}, マッチ: ${matched}, 重複スキップ: ${skipped})`)

  return {
    success: true,
    imported: inserted,
    matched,
    skipped_duplicates: skipped,
    product_reviews: productReviews,
    shop_reviews: shopReviews,
    files_processed: fileIds.map(f => f.name),
    files_deleted: delResult.deleted,
  }
}

/**
 * GET /api/reviews/import
 * Vercel Cron Job用。CRON_SECRET認証付き。
 * CSVがなければ何もしない。
 */
export async function GET(request: NextRequest) {
  try {
    // Vercel Cronからの呼び出し認証
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      if (authHeader) {
        return NextResponse.json({ error: '認証エラー' }, { status: 401 })
      }
    }

    const result = await runImport()
    if ('status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[レビューインポート][Cron] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/reviews/import
 * 手動実行用。dryRun対応。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { dryRun = false } = body as { dryRun?: boolean }

    const result = await runImport(dryRun)
    if ('status' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status as number })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('[レビューインポート] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
