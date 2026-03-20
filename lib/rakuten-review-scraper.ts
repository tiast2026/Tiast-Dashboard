/**
 * 楽天レビューページスクレイピング
 *
 * レビューURLから商品ページURLを取得し、品番（商品管理番号）を抽出する。
 * 例: review.rakuten.co.jp/item/1/338335_10002317/...
 *   → item.rakuten.co.jp/noahl/nltp244-2502/
 *   → 品番: nltp244-2502
 */

// Rate limiting: 1 request per second
const REQUEST_INTERVAL_MS = 1000
let lastRequestTime = 0

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const wait = REQUEST_INTERVAL_MS - (now - lastRequestTime)
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait))
  }
  lastRequestTime = Date.now()
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TiastDashboard/1.0)',
    },
  })
}

/**
 * Extract product code (品番/商品管理番号) from a Rakuten review URL
 * by fetching the review page and finding the product page link.
 *
 * @returns product code or null if not found
 */
export async function scrapeProductCodeFromReview(reviewUrl: string): Promise<string | null> {
  if (!reviewUrl) return null

  // Only process product review URLs (not shop reviews)
  if (!reviewUrl.includes('review.rakuten.co.jp/item/')) return null

  try {
    const res = await rateLimitedFetch(reviewUrl)
    if (!res.ok) {
      console.warn(`[スクレイピング] HTTP ${res.status}: ${reviewUrl}`)
      return null
    }

    const html = await res.text()

    // Find product page links: item.rakuten.co.jp/SHOP/PRODUCT_CODE/
    const match = html.match(/item\.rakuten\.co\.jp\/[^/]+\/([^/?"]+)/)
    if (match) {
      return match[1]
    }

    return null
  } catch (e) {
    console.warn(`[スクレイピング] エラー: ${reviewUrl}`, e)
    return null
  }
}

/**
 * Extract unique review detail page URLs from CSV data.
 * Review URLs in CSV are the detail URLs for individual reviews.
 * We need the product-level review page URL (without the review-specific suffix).
 *
 * Detail URL: https://review.rakuten.co.jp/item/1/338335_10002317/ef9e-i97wj-.../
 * Product review page: https://review.rakuten.co.jp/item/1/338335_10002317/
 */
function getProductReviewPageUrl(detailUrl: string): string | null {
  if (!detailUrl) return null
  const match = detailUrl.match(/(https?:\/\/review\.rakuten\.co\.jp\/item\/\d+\/\d+_\d+)\//)
  return match ? match[1] + '/' : null
}

/**
 * Batch scrape product codes from review URLs.
 * Groups reviews by product review page URL to avoid duplicate scraping.
 *
 * @returns Map of rakuten_item_id → product_code
 */
export async function batchScrapeProductCodes(
  reviewUrls: string[],
  existingMapping?: Map<string, string>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  // Group by product review page URL (avoid scraping same page multiple times)
  const pageToItemId = new Map<string, string>()
  for (const url of reviewUrls) {
    const itemId = extractItemIdFromUrl(url)
    if (!itemId) continue
    if (existingMapping?.has(itemId)) {
      result.set(itemId, existingMapping.get(itemId)!)
      continue
    }
    const pageUrl = getProductReviewPageUrl(url)
    if (pageUrl && !pageToItemId.has(pageUrl)) {
      pageToItemId.set(pageUrl, itemId)
    }
  }

  console.log(`[スクレイピング] ${pageToItemId.size}件のレビューページを処理中...`)
  let processed = 0

  for (const [pageUrl, itemId] of Array.from(pageToItemId.entries())) {
    const code = await scrapeProductCodeFromReview(pageUrl)
    if (code) {
      result.set(itemId, code)
    }
    processed++
    if (processed % 10 === 0) {
      console.log(`[スクレイピング] ${processed}/${pageToItemId.size} 完了`)
    }
  }

  console.log(`[スクレイピング] 完了: ${result.size}件マッチ`)
  return result
}

/**
 * Extract Rakuten item ID from review URL
 */
function extractItemIdFromUrl(reviewUrl: string): string | null {
  if (!reviewUrl) return null
  const match = reviewUrl.match(/review\.rakuten\.co\.jp\/item\/\d+\/\d+_(\d+)\//)
  return match ? match[1] : null
}
