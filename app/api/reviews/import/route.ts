import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import {
  fetchAllShopReviewCSVs,
  deleteDriveFiles,
  type BrandMismatchWarning,
} from '@/lib/google-drive'
import { getReviewMappingMap, appendReviewMappings } from '@/lib/google-sheets'
import { batchScrapeProductCodes } from '@/lib/rakuten-review-scraper'

// Allow up to 300s for this function (Vercel Pro)
export const maxDuration = 300

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'
const TABLE = 'rakuten_reviews'
const SHOP_TABLE = 'rakuten_shop_reviews'
const OFFICIAL_TABLE = 'official_reviews'

function sqlStr(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
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

async function ensureOfficialTableExists(bq: ReturnType<typeof getBigQueryClient>): Promise<void> {
  const dataset = bq.dataset(DATASET)
  const table = dataset.table(OFFICIAL_TABLE)
  const [exists] = await table.exists()
  if (exists) return

  console.log('[レビュー] 公式レビューテーブルが存在しないため作成します...')
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
        { name: 'matched_product_code', type: 'STRING', mode: 'NULLABLE' },
        { name: '_imported_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
      ],
    },
  })
}

async function ensureShopTableExists(bq: ReturnType<typeof getBigQueryClient>): Promise<void> {
  const dataset = bq.dataset(DATASET)
  const table = dataset.table(SHOP_TABLE)
  const [exists] = await table.exists()
  if (exists) return

  console.log('[レビュー] ショップレビューテーブルが存在しないため作成します...')
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
      query: `
        SELECT DISTINCT CONCAT(IFNULL(review_url,''), '|', IFNULL(posted_at,'')) AS review_key
        FROM \`${PROJECT}.${DATASET}.${TABLE}\`
        UNION DISTINCT
        SELECT DISTINCT CONCAT(IFNULL(review_url,''), '|', IFNULL(posted_at,'')) AS review_key
        FROM \`${PROJECT}.${DATASET}.${SHOP_TABLE}\`
        UNION DISTINCT
        SELECT DISTINCT CONCAT(IFNULL(review_url,''), '|', IFNULL(posted_at,'')) AS review_key
        FROM \`${PROJECT}.${DATASET}.${OFFICIAL_TABLE}\`
      `,
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
async function runImport(dryRun = false, reprocess = false) {
  if (!isBigQueryConfigured()) {
    return { error: 'BigQuery未設定', status: 500 }
  }

  // 1. Fetch all "reviews*" CSVs from both shop folders
  console.log(`[レビューインポート] NOAHL + BLACKQUEEN のDriveフォルダからreviews CSVを取得中...`)
  const { reviews, fileIds, debug, csvDebug, brandMismatchWarnings } = await fetchAllShopReviewCSVs()

  if (reviews.length === 0) {
    return {
      success: true,
      message: fileIds.length === 0
        ? 'reviews CSVファイルが見つかりません（Driveフォルダ内にファイルなし。フォルダ共有・ファイル名を確認してください）'
        : 'reviews CSVファイルにレビューデータがありません',
      imported: 0,
      skipped_duplicates: 0,
      files_found: fileIds.length,
      debug,
      csvDebug,
      brandMismatchWarnings,
    }
  }

  console.log(`[レビューインポート] ${reviews.length}件のレビュー（${fileIds.length}ファイル）`)

  const bq = getBigQueryClient()
  await ensureTableExists(bq)
  await ensureShopTableExists(bq)
  await ensureOfficialTableExists(bq)

  // 2. Reprocess: delete all existing reviews first
  if (reprocess) {
    console.log('[レビューインポート] reprocess: 既存レビューを全削除中...')
    await Promise.all([
      bq.query({ query: `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE 1=1`, location: 'asia-northeast1' }),
      bq.query({ query: `DELETE FROM \`${PROJECT}.${DATASET}.${SHOP_TABLE}\` WHERE 1=1`, location: 'asia-northeast1' }),
      bq.query({ query: `DELETE FROM \`${PROJECT}.${DATASET}.${OFFICIAL_TABLE}\` WHERE 1=1`, location: 'asia-northeast1' }),
    ])
    console.log('[レビューインポート] 既存レビュー削除完了')
  }

  // 3. Duplicate check (review_url + posted_at)
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

  // 3. Enrich reviews with rakuten_item_id → matched_product_code via mapping sheet
  const mappingMap = await getReviewMappingMap()
  console.log(`[レビューインポート] レビューマッピング: ${mappingMap.size}件`)

  const enrichedReviews = newReviews.map(r => {
    const rakutenItemId = extractRakutenItemId(r.review_url)
    // Priority: mapping sheet lookup > manage_number from CSV > null
    const mappingValue = rakutenItemId ? mappingMap.get(rakutenItemId) ?? null : null
    const matched = mappingValue || r.manage_number || null
    return { ...r, rakuten_item_id: rakutenItemId, matched_product_code: matched }
  })

  // 3.5 Scrape product codes for reviews that have no matched_product_code (limit to avoid timeout)
  const MAX_SCRAPE = 30
  const unmatchedUrls = enrichedReviews
    .filter(r => !r.matched_product_code && r.rakuten_item_id && r.review_type === '商品レビュー')
    .map(r => r.review_url)
    .slice(0, MAX_SCRAPE)

  if (unmatchedUrls.length > 0) {
    console.log(`[レビューインポート] ${unmatchedUrls.length}件の未マッチレビューをスクレイピング中...`)
    const scrapedMap = await batchScrapeProductCodes(unmatchedUrls, mappingMap)

    // Apply scraped results to enriched reviews
    for (const r of enrichedReviews) {
      if (!r.matched_product_code && r.rakuten_item_id && scrapedMap.has(r.rakuten_item_id)) {
        r.matched_product_code = scrapedMap.get(r.rakuten_item_id)!
      }
    }

    // Save new scraped mappings to sheet
    const scrapedMappings = Array.from(scrapedMap.entries())
      .filter(([id]) => !mappingMap.has(id))
      .map(([id, code]) => ({ rakuten_item_id: id, product_code: code }))
    if (scrapedMappings.length > 0) {
      const added = await appendReviewMappings(scrapedMappings)
      console.log(`[レビューインポート] スクレイピングマッピング自動追加: ${added}件`)
    }
  }

  // 3.6 Auto-populate mapping sheet from reviews that have both rakuten_item_id and manage_number
  const newMappings: Array<{ rakuten_item_id: string; product_code: string }> = []
  for (const r of enrichedReviews) {
    if (r.rakuten_item_id && r.manage_number && !mappingMap.has(r.rakuten_item_id)) {
      newMappings.push({ rakuten_item_id: r.rakuten_item_id, product_code: r.manage_number })
    }
  }
  if (newMappings.length > 0) {
    const seen = new Set<string>()
    const unique = newMappings.filter(m => {
      if (seen.has(m.rakuten_item_id)) return false
      seen.add(m.rakuten_item_id)
      return true
    })
    const added = await appendReviewMappings(unique)
    if (added > 0) {
      console.log(`[レビューインポート] マッピング自動追加: ${added}件`)
    }
  }

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

  // 4. Split into rakuten product / rakuten shop / official, insert into separate tables
  const officialReviewList = enrichedReviews.filter(r => r.review_source === '公式')
  const rakutenProductList = enrichedReviews.filter(r => r.review_source !== '公式' && r.review_type !== 'ショップレビュー')
  const rakutenShopList = enrichedReviews.filter(r => r.review_source !== '公式' && r.review_type === 'ショップレビュー')

  const batchSize = 500
  let inserted = 0

  // 4a. Insert rakuten product reviews into rakuten_reviews
  for (let i = 0; i < rakutenProductList.length; i += batchSize) {
    const batch = rakutenProductList.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${sqlStr(r.shop_name)}, ${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
      `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
      `${r.flag}, ${sqlStr(r.order_number)}, ${r.unhandled_flag}, ` +
      `${r.rakuten_item_id ? sqlStr(r.rakuten_item_id) : 'NULL'}, ` +
      `${r.matched_product_code ? sqlStr(r.matched_product_code) : 'NULL'}, CURRENT_TIMESTAMP())`
    ).join(',\n')

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.${DATASET}.${TABLE}\`
        (shop_name, review_type, product_name, review_url, rating, posted_at, title, review_body,
         flag, order_number, unhandled_flag, rakuten_item_id, matched_product_code, _imported_at)
        VALUES ${values}
      `,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }

  // 4b. Insert rakuten shop reviews into rakuten_shop_reviews
  for (let i = 0; i < rakutenShopList.length; i += batchSize) {
    const batch = rakutenShopList.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${sqlStr(r.shop_name)}, ${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
      `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
      `${r.flag}, ${sqlStr(r.order_number)}, ${r.unhandled_flag}, CURRENT_TIMESTAMP())`
    ).join(',\n')

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.${DATASET}.${SHOP_TABLE}\`
        (shop_name, review_type, product_name, review_url, rating, posted_at, title, review_body,
         flag, order_number, unhandled_flag, _imported_at)
        VALUES ${values}
      `,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }

  // 4c. Insert official reviews into official_reviews
  for (let i = 0; i < officialReviewList.length; i += batchSize) {
    const batch = officialReviewList.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${sqlStr(r.shop_name)}, ${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
      `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
      `${r.matched_product_code ? sqlStr(r.matched_product_code) : 'NULL'}, CURRENT_TIMESTAMP())`
    ).join(',\n')

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.${DATASET}.${OFFICIAL_TABLE}\`
        (shop_name, review_type, product_name, review_url, rating, posted_at, title, review_body,
         matched_product_code, _imported_at)
        VALUES ${values}
      `,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }

  // 5. Delete CSV files from Drive
  console.log(`[レビューインポート] CSVファイルを削除中...`)
  const delResult = await deleteDriveFiles(fileIds.map(f => f.id))
  console.log(`[レビューインポート] ${delResult.deleted}ファイル削除完了`)
  if (delResult.errors.length > 0) {
    console.warn(`[レビューインポート] 削除エラー:`, delResult.errors)
  }

  const matched = [...rakutenProductList, ...officialReviewList].filter(r => r.matched_product_code).length

  console.log(`[レビューインポート] 完了: ${inserted}件新規インポート (楽天商品: ${rakutenProductList.length}, 楽天ショップ: ${rakutenShopList.length}, 公式: ${officialReviewList.length}, マッチ: ${matched}, 重複スキップ: ${skipped})`)

  return {
    success: true,
    imported: inserted,
    matched,
    skipped_duplicates: skipped,
    product_reviews: rakutenProductList.length,
    shop_reviews: rakutenShopList.length,
    official_reviews: officialReviewList.length,
    files_processed: fileIds.map(f => f.name),
    files_deleted: delResult.deleted,
    delete_errors: delResult.errors.length > 0 ? delResult.errors : undefined,
    brandMismatchWarnings,
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
    const { dryRun = false, reprocess = false } = body as { dryRun?: boolean; reprocess?: boolean }

    const result = await runImport(dryRun, reprocess)
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
