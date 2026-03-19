// 楽天市場ランキングAPI クライアント
// API docs: https://webservice.rakuten.co.jp/documentation/ichiba-ranking

import { getBigQueryClient, isBigQueryConfigured } from './bigquery'
import { rakutenFetch } from './rakuten-throttle'
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
 * 指数バックオフ付きスリープ
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 楽天ランキングAPIから1ページ分を取得（429エラー時リトライ付き）
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

  const maxRetries = 3
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await rakutenFetch(url.toString(), {
      headers: {
        'Referer': 'https://tiast2026.github.io/Conversion-Tool/index.html',
        'Origin': 'https://tiast2026.github.io',
      },
    })

    if (res.status === 429) {
      if (attempt < maxRetries) {
        // Retry-Afterヘッダーがあればその秒数待つ、なければ指数バックオフ
        const retryAfter = res.headers.get('Retry-After')
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(2000 * Math.pow(2, attempt), 16000) // 2s, 4s, 8s
        console.warn(
          `[Rakuten API] Rate limited (429) on page ${page}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`
        )
        await sleep(waitMs)
        continue
      }
      throw new Error('楽天APIのレート制限に達しました。しばらく待ってから再度お試しください。')
    }

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

  // TypeScript: unreachable but needed for type safety
  throw new Error('Unexpected: all retries exhausted')
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
    // ページ間の待機はrakutenFetchのスロットルで自動制御
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
 * テーブルが存在しなければ作成する
 */
async function ensureRankingTableExists(bq: ReturnType<typeof getBigQueryClient>): Promise<void> {
  const dataset = bq.dataset('analytics_mart')
  const table = dataset.table('rakuten_ranking_history')

  const [exists] = await table.exists()
  if (exists) return

  console.log('[Rakuten Ranking] Table does not exist, creating...')
  await table.create({
    schema: {
      fields: [
        { name: 'fetched_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'ranking_type', type: 'STRING', mode: 'REQUIRED' },
        { name: 'genre_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'rank', type: 'INT64', mode: 'REQUIRED' },
        { name: 'item_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'item_code', type: 'STRING', mode: 'NULLABLE' },
        { name: 'item_price', type: 'INT64', mode: 'NULLABLE' },
        { name: 'item_url', type: 'STRING', mode: 'NULLABLE' },
        { name: 'image_url', type: 'STRING', mode: 'NULLABLE' },
        { name: 'shop_name', type: 'STRING', mode: 'NULLABLE' },
        { name: 'review_count', type: 'INT64', mode: 'NULLABLE' },
        { name: 'review_average', type: 'FLOAT64', mode: 'NULLABLE' },
        { name: 'is_own_product', type: 'BOOL', mode: 'NULLABLE' },
        { name: 'matched_product_code', type: 'STRING', mode: 'NULLABLE' },
      ],
    },
    timePartitioning: {
      type: 'DAY',
      field: 'fetched_at',
    },
    clustering: {
      fields: ['genre_id', 'is_own_product'],
    },
  })
  console.log('[Rakuten Ranking] Table created successfully')
}

/**
 * SQL INSERT でランキングデータを保存（streaming insert の代替）
 */
async function insertRankingViaSQL(
  bq: ReturnType<typeof getBigQueryClient>,
  rows: RankingHistoryRecord[],
): Promise<void> {
  if (rows.length === 0) return

  // バッチサイズごとに分割（BigQuery DML の制限対策）
  const BATCH_SIZE = 50
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const values = batch
      .map(
        (r) =>
          `(TIMESTAMP('${r.fetched_at}'), '${r.ranking_type}', '${r.genre_id}', ${r.rank}, ` +
          `${sqlStr(r.item_name)}, ${sqlStr(r.item_code)}, ${r.item_price}, ` +
          `${sqlStr(r.item_url)}, ${sqlStr(r.image_url)}, ${sqlStr(r.shop_name)}, ` +
          `${r.review_count}, ${r.review_average}, ${r.is_own_product}, ${sqlStr(r.matched_product_code)})`
      )
      .join(',\n')

    const query = `
      INSERT INTO \`tiast-data-platform.analytics_mart.rakuten_ranking_history\`
        (fetched_at, ranking_type, genre_id, rank, item_name, item_code, item_price,
         item_url, image_url, shop_name, review_count, review_average, is_own_product, matched_product_code)
      VALUES ${values}
    `
    await bq.query({ query, location: 'asia-northeast1' })
  }
}

/** SQL文字列リテラルのエスケープ（NULL対応） */
function sqlStr(value: string | null | undefined): string {
  if (value == null) return 'NULL'
  return `'${value.replace(/'/g, "\\'")}'`
}

/**
 * ランキングデータをBigQueryに保存
 * streaming insert を試み、権限エラーの場合は SQL INSERT にフォールバック
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

  // テーブルが存在しなければ作成
  try {
    await ensureRankingTableExists(bq)
  } catch (e) {
    console.warn('[Rakuten Ranking] Could not verify/create table:', e)
    // テーブル存在確認に失敗しても INSERT を試行する
  }

  // 1. まず streaming insert を試行
  try {
    const dataset = bq.dataset('analytics_mart')
    const table = dataset.table('rakuten_ranking_history')
    await table.insert(rows)
    return rows.length
  } catch (streamingError) {
    const errMsg = streamingError instanceof Error ? streamingError.message : String(streamingError)

    // streaming insert の権限エラーの場合、SQL INSERT にフォールバック
    if (errMsg.includes('updateData') || errMsg.includes('Access Denied') || errMsg.includes('permission')) {
      console.warn('[Rakuten Ranking] Streaming insert denied, falling back to SQL INSERT...')
      try {
        await insertRankingViaSQL(bq, rows)
        return rows.length
      } catch (sqlError) {
        const sqlErrMsg = sqlError instanceof Error ? sqlError.message : String(sqlError)
        throw new Error(
          `BigQueryへの書き込み権限がありません。サービスアカウントに「BigQuery データ編集者」ロールを付与してください。\n` +
          `詳細: ${sqlErrMsg}`
        )
      }
    }

    throw streamingError
  }
}

/**
 * 商品マスタから品番リストを取得（マッチング用）
 */
export async function fetchMasterProductCodes(): Promise<string[]> {
  if (!isBigQueryConfigured()) return []

  const bq = getBigQueryClient()
  const [rows] = await bq.query({
    query: `
      SELECT DISTINCT goods_representation_id AS product_code
      FROM \`tiast-data-platform.raw_nextengine.products\`
      WHERE goods_representation_id IS NOT NULL
        AND goods_representation_id != ''
    `,
    location: 'asia-northeast1',
  })

  return (rows as { product_code: string }[]).map((r) => r.product_code)
}
