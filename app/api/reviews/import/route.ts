import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import { fetchReviewCSVFromDrive } from '@/lib/google-drive'
import { fetchSheetData } from '@/lib/google-sheets'

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'
const TABLE = 'rakuten_reviews'

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "\\'").replace(/\\/g, '\\\\')}'`
}

/**
 * Match review order numbers to NE orders to find product codes.
 * Returns a map: order_number → product_code
 */
async function matchOrdersToProducts(
  bq: ReturnType<typeof getBigQueryClient>,
  orderNumbers: string[],
): Promise<Map<string, string>> {
  if (orderNumbers.length === 0) return new Map()

  // Extract the shop-specific order number part
  // Review order format: 338335-20260314-0999912871
  // NE format: receive_order_shop_cut_form_id may be the full or partial number
  const orderMap = new Map<string, string>()

  // Query NE orders to find goods_id matching these order numbers
  const batchSize = 100
  for (let i = 0; i < orderNumbers.length; i += batchSize) {
    const batch = orderNumbers.slice(i, i + batchSize)
    const orderList = batch.map(o => sqlStr(o)).join(',')

    const query = `
      SELECT DISTINCT
        o.receive_order_shop_cut_form_id AS order_number,
        COALESCE(p.goods_representation_id, REGEXP_EXTRACT(o.goods_id, r'^([a-z]+[0-9]+-[0-9]+)')) AS product_code
      FROM \`${PROJECT}.raw_nextengine.orders\` o
      LEFT JOIN \`${PROJECT}.raw_nextengine.products\` p ON o.goods_id = p.goods_id
      WHERE o.receive_order_shop_cut_form_id IN (${orderList})
        AND o.cancel_type_id = '0'
        AND o.row_cancel_flag = '0'
    `

    try {
      const [rows] = await bq.query({ query, location: 'asia-northeast1' })
      for (const row of rows as { order_number: string; product_code: string }[]) {
        if (row.product_code) {
          orderMap.set(row.order_number, row.product_code)
        }
      }
    } catch (e) {
      console.warn('[レビューインポート] NE注文マッチングエラー:', e)
    }
  }

  return orderMap
}

/**
 * Try to match product name to master product codes
 */
function matchByProductName(
  productName: string,
  masterCodes: string[],
): string | null {
  if (!productName) return null
  const nameLower = productName.toLowerCase()

  // Sort by length descending (longer codes first for better matching)
  const sorted = [...masterCodes].sort((a, b) => b.length - a.length)
  for (const code of sorted) {
    if (nameLower.includes(code.toLowerCase())) {
      return code
    }
  }
  return null
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
        { name: 'matched_product_code', type: 'STRING', mode: 'NULLABLE' },
        { name: '_imported_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
      ],
    },
  })
}

/**
 * POST /api/reviews/import
 * Body: { fileId?: string, fileName?: string, folderId?: string, mode?: 'replace' | 'append' }
 *
 * Reads review CSV from Google Drive and imports to BigQuery
 */
export async function POST(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const { fileId, fileName, folderId, mode = 'replace' } = body as {
      fileId?: string
      fileName?: string
      folderId?: string
      mode?: 'replace' | 'append'
    }

    // 1. Read CSV from Google Drive
    console.log('[レビューインポート] Google DriveからCSV取得中...')
    const reviews = await fetchReviewCSVFromDrive(fileId, fileName || 'レビュー', folderId)

    if (reviews.length === 0) {
      return NextResponse.json({ error: 'レビューデータが見つかりません', imported: 0 })
    }

    const bq = getBigQueryClient()
    await ensureTableExists(bq)

    // 2. Collect order numbers for matching
    const orderNumbers = reviews
      .map(r => r.order_number)
      .filter(Boolean)

    // 3. Match via NE orders
    console.log(`[レビューインポート] ${orderNumbers.length}件の注文番号でNEマッチング中...`)
    const uniqueOrders = Array.from(new Set(orderNumbers))
    const orderProductMap = await matchOrdersToProducts(bq, uniqueOrders)
    console.log(`[レビューインポート] NEマッチング結果: ${orderProductMap.size}件`)

    // 4. Get master product codes for name-based matching fallback
    const sheetData = await fetchSheetData()
    const masterCodes = sheetData.map(s => s.product_code).filter(Boolean)

    // 5. Assign matched_product_code to each review
    const enrichedReviews = reviews.map(r => {
      let matchedCode: string | null = null

      // Try order number match first
      if (r.order_number && orderProductMap.has(r.order_number)) {
        matchedCode = orderProductMap.get(r.order_number)!
      }

      // Fallback: match by product name
      if (!matchedCode && r.product_name) {
        matchedCode = matchByProductName(r.product_name, masterCodes)
      }

      return { ...r, matched_product_code: matchedCode }
    })

    // 6. Clear existing data if mode is 'replace'
    if (mode === 'replace') {
      const deleteQuery = `DELETE FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE TRUE`
      await bq.query({ query: deleteQuery, location: 'asia-northeast1' })
      console.log('[レビューインポート] 既存データをクリア')
    }

    // 7. Insert reviews in batches
    const batchSize = 50
    let inserted = 0
    for (let i = 0; i < enrichedReviews.length; i += batchSize) {
      const batch = enrichedReviews.slice(i, i + batchSize)
      const values = batch.map(r =>
        `(${sqlStr(r.review_type)}, ${sqlStr(r.product_name)}, ${sqlStr(r.review_url)}, ` +
        `${r.rating}, ${sqlStr(r.posted_at)}, ${sqlStr(r.title)}, ${sqlStr(r.review_body)}, ` +
        `${r.flag}, ${sqlStr(r.order_number)}, ${r.unhandled_flag}, ` +
        `${r.matched_product_code ? sqlStr(r.matched_product_code) : 'NULL'}, CURRENT_TIMESTAMP())`
      ).join(',\n')

      const query = `
        INSERT INTO \`${PROJECT}.${DATASET}.${TABLE}\`
        (review_type, product_name, review_url, rating, posted_at, title, review_body,
         flag, order_number, unhandled_flag, matched_product_code, _imported_at)
        VALUES ${values}
      `

      await bq.query({ query, location: 'asia-northeast1' })
      inserted += batch.length
    }

    const matched = enrichedReviews.filter(r => r.matched_product_code).length
    const productReviews = enrichedReviews.filter(r => r.review_type === '商品レビュー').length
    const shopReviews = enrichedReviews.filter(r => r.review_type === 'ショップレビュー').length

    console.log(`[レビューインポート] 完了: ${inserted}件 (商品: ${productReviews}, ショップ: ${shopReviews}, マッチ: ${matched})`)

    return NextResponse.json({
      success: true,
      imported: inserted,
      matched,
      product_reviews: productReviews,
      shop_reviews: shopReviews,
    })
  } catch (error) {
    console.error('[レビューインポート] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
