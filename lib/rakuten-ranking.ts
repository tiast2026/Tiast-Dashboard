// 楽天市場ランキングAPI クライアント
// API docs: https://webservice.rakuten.co.jp/documentation/ichiba-ranking

import { getBigQueryClient, isBigQueryConfigured } from './bigquery'
import type { RakutenRankingItem, RankingHistoryRecord } from '@/types/ranking'

// 2026年2月以降の新ドメイン（旧: app.rakuten.co.jp/services/api/...）
const RAKUTEN_RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601'

// レディースファッション ジャンルID
const GENRE_LADIES_FASHION = '100371'

// 自社ショップ名パターン（楽天市場での店舗名）
const OWN_SHOP_PATTERNS = [
  'noahl', 'ノアール', 'NOAHL',
  'blackqueen', 'ブラッククイーン', 'BLACKQUEEN',
  'tiast', 'TIAST',
  'myrth', 'MYRTH',
]

// 自社商品コードパターン（品番の先頭）
const OWN_PRODUCT_CODE_PREFIXES = [
  'nl', 'nj', 'nx',  // NOAHL
  'bl', 'bq',         // BLACKQUEEN
]

interface RakutenApiResponse {
  Items: {
    Item: {
      rank: number
      itemName: string
      itemCode: string
      itemPrice: number
      itemUrl: string
      mediumImageUrls: { imageUrl: string }[]
      shopName: string
      reviewCount: number
      reviewAverage: number
    }
  }[]
}

/**
 * 楽天ランキングAPIから1ページ分を取得
 */
async function fetchRakutenRankingPage(
  appId: string,
  accessKey: string,
  rankingType: 'realtime' | 'daily' | 'weekly',
  genreId: string,
  page: number,
): Promise<RakutenRankingItem[]> {
  const url = new URL(RAKUTEN_RANKING_API)
  url.searchParams.set('applicationId', appId)
  url.searchParams.set('accessKey', accessKey)
  url.searchParams.set('genreId', genreId)
  url.searchParams.set('carrier', '0')
  url.searchParams.set('page', String(page))
  if (rankingType === 'realtime') {
    url.searchParams.set('period', 'realtime')
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Referer': 'https://tiast2026.github.io/Conversion-Tool/index.html',
    },
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.text()
      detail = body.slice(0, 300)
    } catch { /* ignore */ }
    throw new Error(`Rakuten Ranking API error: ${res.status}${detail ? ` - ${detail}` : ''}`)
  }

  const data: RakutenApiResponse = await res.json()
  return (data.Items || []).map((wrapper) => {
    const item = wrapper.Item
    const images = item.mediumImageUrls || []
    return {
      rank: item.rank,
      item_name: item.itemName || '',
      item_code: item.itemCode || '',
      item_price: item.itemPrice || 0,
      item_url: item.itemUrl || '',
      image_url: images[0]?.imageUrl?.replace('?_ex=128x128', '?_ex=300x300') || '',
      shop_name: item.shopName || '',
      review_count: item.reviewCount || 0,
      review_average: item.reviewAverage || 0,
    }
  })
}

/**
 * 楽天ランキングAPIからランキングを取得（最大100位まで、4ページ分）
 * 楽天APIは1ページ30件×最大4ページ=120件まで取得可能
 */
export async function fetchRakutenRanking(
  rankingType: 'realtime' | 'daily' | 'weekly' = 'daily',
  genreId: string = GENRE_LADIES_FASHION,
  maxRank: number = 100,
): Promise<RakutenRankingItem[]> {
  const appId = process.env.RAKUTEN_APP_ID
  const accessKey = process.env.RAKUTEN_ACCESS_KEY
  if (!appId || !accessKey) {
    throw new Error('RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY must be configured')
  }

  // 必要ページ数を計算（1ページ30件、最大4ページ）
  const pagesNeeded = Math.min(Math.ceil(maxRank / 30), 4)
  const allItems: RakutenRankingItem[] = []

  for (let page = 1; page <= pagesNeeded; page++) {
    const items = await fetchRakutenRankingPage(appId, accessKey, rankingType, genreId, page)
    allItems.push(...items)

    // 取得件数がmaxRankに達したら終了
    if (allItems.length >= maxRank) break

    // ページ間で少し待つ（APIレート制限対策）
    if (page < pagesNeeded) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  // maxRank以内のアイテムのみ返す
  return allItems.filter((item) => item.rank <= maxRank)
}

/**
 * 自社商品かどうか判定
 * ショップ名 or 商品コードでマッチング
 */
export function matchOwnProduct(
  item: RakutenRankingItem,
  masterCodes?: string[],
): { isOwn: boolean; matchedCode: string | null } {
  // 1. ショップ名でマッチ
  const shopLower = item.shop_name.toLowerCase()
  const isOwnShop = OWN_SHOP_PATTERNS.some((p) => shopLower.includes(p.toLowerCase()))

  // 2. 商品コードでマッチ（楽天の商品コードに自社品番が含まれているか）
  const codeLower = item.item_code.toLowerCase()
  const matchedPrefix = OWN_PRODUCT_CODE_PREFIXES.find((prefix) =>
    codeLower.includes(prefix)
  )

  // 3. マスタデータの品番リストでマッチ
  let matchedMasterCode: string | null = null
  if (masterCodes) {
    matchedMasterCode = masterCodes.find((mc) =>
      codeLower.includes(mc.toLowerCase()) || item.item_name.toLowerCase().includes(mc.toLowerCase())
    ) || null
  }

  if (isOwnShop || matchedPrefix || matchedMasterCode) {
    // 品番を抽出: 商品コードから自社品番パターンを探す
    let matched = matchedMasterCode
    if (!matched && matchedPrefix) {
      // 商品コードから品番部分を抽出 (例: "shop:nl-tp01-bk" → "nl-tp01")
      const regex = new RegExp(`(${matchedPrefix}[a-z0-9-_]+)`, 'i')
      const m = codeLower.match(regex)
      matched = m ? m[1] : codeLower
    }
    if (!matched && isOwnShop) {
      matched = item.item_code
    }
    return { isOwn: true, matchedCode: matched }
  }

  return { isOwn: false, matchedCode: null }
}

/**
 * ランキングデータをBigQueryに保存
 */
export async function saveRankingToBigQuery(
  items: RakutenRankingItem[],
  rankingType: string,
  genreId: string,
  matchResults: Map<number, { isOwn: boolean; matchedCode: string | null }>,
): Promise<number> {
  if (!isBigQueryConfigured()) {
    console.warn('BigQuery not configured, skipping ranking save')
    return 0
  }

  const bq = getBigQueryClient()
  const now = new Date().toISOString()

  const rows: RankingHistoryRecord[] = items.map((item) => {
    const match = matchResults.get(item.rank) || { isOwn: false, matchedCode: null }
    return {
      fetched_at: now,
      ranking_type: rankingType,
      genre_id: genreId,
      rank: item.rank,
      item_name: item.item_name,
      item_code: item.item_code,
      item_price: item.item_price,
      item_url: item.item_url,
      image_url: item.image_url,
      shop_name: item.shop_name,
      review_count: item.review_count,
      review_average: item.review_average,
      is_own_product: match.isOwn,
      matched_product_code: match.matchedCode,
    }
  })

  const dataset = bq.dataset('analytics_mart')
  const table = dataset.table('rakuten_ranking_history')

  await table.insert(rows)
  return rows.length
}

/**
 * 商品マスタから品番リストを取得（マッチング用）
 */
export async function fetchMasterProductCodes(): Promise<string[]> {
  if (!isBigQueryConfigured()) return []

  const bq = getBigQueryClient()
  const [rows] = await bq.query({
    query: `
      SELECT DISTINCT product_code
      FROM \`tiast-data-platform.analytics_mart.t_mart_product_master\`
      WHERE product_code IS NOT NULL
    `,
    location: 'asia-northeast1',
  })

  return (rows as { product_code: string }[]).map((r) => r.product_code)
}
