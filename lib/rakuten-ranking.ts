// 楽天市場ランキングAPI クライアント
// API docs: https://webservice.rakuten.co.jp/documentation/ichiba-ranking

import { getBigQueryClient, isBigQueryConfigured } from './bigquery'
import { rakutenFetch } from './rakuten-throttle'
import type { RakutenRankingItem, RankingHistoryRecord } from '@/types/ranking'

// 2026年2月以降の新ドメイン（旧: app.rakuten.co.jp/services/api/...）
const RAKUTEN_RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601'

// レディースファッション ジャンルID
const GENRE_LADIES_FASHION = '100371'

// レディースファッション 全ジャンルID→名前マップ（表示用）
export const RAKUTEN_GENRE_MAP: Record<string, string> = {
  '100371': 'レディースファッション（全体）',
  // トップス
  '555086': 'トップス',
  '303656': 'トップス > Tシャツ・カットソー',
  '566018': 'トップス > タンクトップ',
  '206471': 'トップス > シャツ・ブラウス',
  '409352': 'トップス > ポロシャツ',
  '303662': 'トップス > キャミソール',
  '303655': 'トップス > ベアトップ・チューブトップ',
  '403871': 'トップス > カーディガン・ボレロ',
  '403890': 'トップス > ベスト・ジレ',
  '303699': 'トップス > アンサンブル',
  '566028': 'トップス > ニット・セーター > セーター',
  '566029': 'トップス > ニット・セーター > ニットパーカー',
  '566030': 'トップス > ニット・セーター > ニットキャミソール',
  '200343': 'トップス > ニット・セーター > その他',
  '502556': 'トップス > パーカー',
  '403923': 'トップス > スウェット・トレーナー',
  '112719': 'トップス > その他',
  // ボトムス
  '555089': 'ボトムス',
  '110734': 'ボトムス > スカート',
  '303587': 'ボトムス > キュロット',
  '206440': 'ボトムス > パンツ',
  // アウター・ワンピース等
  '555087': 'コート・ジャケット',
  '110729': 'ワンピース',
  '568650': 'シャツワンピース',
  '568651': 'ジャンパースカート',
  '553029': 'チュニック',
  '555084': 'ドレス',
  '568279': 'パンツドレス',
  // スーツ・セットアップ
  '555091': 'スーツ・セットアップ',
  '110724': 'スーツ・セットアップ > パンツスーツ',
  '409073': 'スーツ・セットアップ > スカートスーツ',
  '409120': 'スーツ・セットアップ > ワンピーススーツ',
  '409096': 'スーツ・セットアップ > 3・4点セット',
  '566020': 'スーツ・セットアップ > トップスのみ',
  '566021': 'スーツ・セットアップ > ボトムスのみ',
  // その他カテゴリ
  '555083': 'オールインワン・サロペット',
  '553037': 'レインウェア > レインコート',
  '553038': 'レインウェア > レインスーツ',
  '409395': 'レインウェア > その他',
  '409365': '水着',
  // 和服
  '206545': '和服 > 着物',
  '110824': '和服 > 着物セット',
  '567437': '和服 > 花嫁着物',
  '567438': '和服 > 花嫁着物セット',
  '206549': '和服 > 浴衣',
  '206585': '和服 > 浴衣セット',
  '206546': '和服 > 帯',
  '206547': '和服 > 部屋着',
  '206548': '和服 > 履物',
  '206617': '和服 > 和装小物 > 髪飾り',
  '206618': '和服 > 和装小物 > ショール',
  '206625': '和服 > 和装小物 > バッグ',
  '206626': '和服 > 和装小物 > 巾着袋',
  '206629': '和服 > 和装小物 > 扇子',
  '206630': '和服 > 和装小物 > うちわ',
  '206631': '和服 > 和装小物 > 着付け小物 > 帯留',
  '206632': '和服 > 和装小物 > 着付け小物 > 帯揚',
  '506700': '和服 > 和装小物 > 着付け小物 > 帯締',
  '206633': '和服 > 和装小物 > 着付け小物 > 羽織紐',
  '506701': '和服 > 和装小物 > 着付け小物 > 根付',
  '206637': '和服 > 和装小物 > 着付け小物 > セット',
  '206634': '和服 > 和装小物 > 着付け小物 > その他',
  '502526': '和服 > 和装小物 > 風呂敷',
  '206635': '和服 > 和装小物 > セット',
  '112735': '和服 > 和装小物 > その他',
  '409176': '和服 > 反物',
  '567225': '和服 > 裏物・八掛',
  '206614': '和服 > 和装下着・足袋 > 半衿',
  '206613': '和服 > 和装下着・足袋 > 肌襦袢',
  '566699': '和服 > 和装下着・足袋 > 長襦袢',
  '566700': '和服 > 和装下着・足袋 > 半襦袢',
  '566701': '和服 > 和装下着・足袋 > 和装ブラジャー',
  '206620': '和服 > 和装下着・足袋 > 足袋',
  '566704': '和服 > 和装下着・足袋 > セット',
  '567771': '和服 > 巫女用装束',
  // 事務服
  '409166': '事務服 > セットアップ',
  '409167': '事務服 > ジャケット',
  '409168': '事務服 > ベスト',
  '409169': '事務服 > シャツ・ブラウス',
  '409170': '事務服 > スカート',
  '409171': '事務服 > キュロット',
  '409172': '事務服 > パンツ',
  '409173': '事務服 > リボン・ネクタイ・スカーフ',
  '206522': '事務服 > その他',
  // 学生服
  '303736': '学生服 > セーラー服',
  '566022': '学生服 > ジャケット',
  '568587': '学生服 > シャツ',
  '567458': '学生服 > スカート',
  '409164': '学生服 > ネクタイ・リボン',
  '206521': '学生服 > その他',
  // その他
  '564338': 'ウェディングドレス',
  '403911': '福袋',
  '101801': 'その他',
}

// 取得対象ジャンル一覧（Cron/手動取得で使用）
export const RAKUTEN_GENRES: { id: string; name: string }[] = Object.entries(RAKUTEN_GENRE_MAP)
  .map(([id, name]) => ({ id, name }))

/** ジャンルIDからジャンル名を取得 */
export function getGenreName(genreId: string): string {
  return RAKUTEN_GENRE_MAP[genreId] ?? genreId
}

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
  lastBuildDate?: string  // ランキング発表日時 (e.g. "Wed, 01 Mar 2026 10:00:00 +0900")
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

/** 楽天ランキング取得結果（lastBuildDate付き） */
export interface RakutenRankingResult {
  items: RakutenRankingItem[]
  lastBuildDate: string | null
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
  rankingType: 'realtime' | 'daily',
  genreId: string,
  page: number,
): Promise<{ items: RakutenRankingItem[]; lastBuildDate: string | null }> {
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
          `[楽天API] レート制限(429) ページ${page}、${waitMs}ms後にリトライ (${attempt + 1}/${maxRetries}回目)`
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
      throw new Error(`楽天ランキングAPIエラー: ${res.status}${detail ? ` - ${detail}` : ''}`)
    }

    const data: RakutenApiResponse = await res.json()
    const items = (data.Items || []).map((wrapper) => {
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
    return { items, lastBuildDate: data.lastBuildDate || null }
  }

  // TypeScript: 到達不能だが型安全性のために必要
  throw new Error('リトライ回数を超過しました')
}

/**
 * 楽天ランキングAPIからランキングを取得（最大100位まで、4ページ分）
 * 楽天APIは1ページ30件×最大4ページ=120件まで取得可能
 */
export async function fetchRakutenRanking(
  rankingType: 'realtime' | 'daily' = 'daily',
  genreId: string = GENRE_LADIES_FASHION,
  maxRank: number = 100,
): Promise<RakutenRankingResult> {
  const appId = process.env.RAKUTEN_APP_ID
  const accessKey = process.env.RAKUTEN_ACCESS_KEY
  if (!appId || !accessKey) {
    throw new Error('RAKUTEN_APP_ID と RAKUTEN_ACCESS_KEY が設定されていません')
  }

  // 必要ページ数を計算（1ページ30件、最大4ページ）
  const pagesNeeded = Math.min(Math.ceil(maxRank / 30), 4)
  const allItems: RakutenRankingItem[] = []
  let lastBuildDate: string | null = null

  for (let page = 1; page <= pagesNeeded; page++) {
    const result = await fetchRakutenRankingPage(appId, accessKey, rankingType, genreId, page)
    allItems.push(...result.items)
    // 最初のページの lastBuildDate を使用
    if (page === 1 && result.lastBuildDate) {
      lastBuildDate = result.lastBuildDate
    }

    // 取得件数がmaxRankに達したら終了
    if (allItems.length >= maxRank) break
    // ページ間の待機はrakutenFetchのスロットルで自動制御
  }

  // maxRank以内のアイテムのみ返す
  return {
    items: allItems.filter((item) => item.rank <= maxRank),
    lastBuildDate,
  }
}

/** item_url から楽天の商品ID部分を抽出（例: "https://item.rakuten.co.jp/noahl/nlwp473-2512/" → "nlwp473-2512"） */
function extractProductIdFromUrl(itemUrl: string): string | null {
  if (!itemUrl) return null
  const match = itemUrl.match(/item\.rakuten\.co\.jp\/[^/]+\/([^/?]+)/)
  return match ? match[1] : null
}

/**
 * 自社商品かどうか判定
 * ショップ名 or 商品コードでマッチング
 */
export function matchOwnProduct(
  item: RakutenRankingItem,
  masterCodes?: string[],
): { isOwn: boolean; matchedCode: string | null } {
  // 1. ショップ名でマッチ（最も信頼性が高い）
  const shopLower = item.shop_name.toLowerCase()
  const isOwnShop = OWN_SHOP_PATTERNS.some((p) => shopLower.includes(p.toLowerCase()))

  // 2. マスタデータの品番リストでマッチ
  const codeLower = item.item_code.toLowerCase()
  let matchedMasterCode: string | null = null
  if (masterCodes) {
    // item_code でマッチ（長い品番を優先するためソート）
    const sortedCodes = [...masterCodes].sort((a, b) => b.length - a.length)
    matchedMasterCode = sortedCodes.find((mc) =>
      codeLower.includes(mc.toLowerCase()) || item.item_name.toLowerCase().includes(mc.toLowerCase())
    ) || null

    // item_url からも品番を抽出してマッチ（item_code にない品番がURLに含まれるケースに対応）
    if (!matchedMasterCode) {
      const urlProductId = extractProductIdFromUrl(item.item_url)
      if (urlProductId) {
        const urlLower = urlProductId.toLowerCase()
        matchedMasterCode = sortedCodes.find((mc) =>
          mc.toLowerCase() === urlLower || urlLower.includes(mc.toLowerCase())
        ) || null
      }
    }
  }

  // 3. 品番プレフィックスはショップ名が自社の場合のみ使用
  //    （"bl","nl"等の短いプレフィックスは他社商品にも誤マッチするため）
  let matchedPrefix: string | null = null
  if (isOwnShop) {
    matchedPrefix = OWN_PRODUCT_CODE_PREFIXES.find((prefix) =>
      codeLower.includes(prefix)
    ) || null
  }

  if (isOwnShop || matchedMasterCode) {
    let matched = matchedMasterCode
    if (!matched && matchedPrefix) {
      const regex = new RegExp(`(${matchedPrefix}[a-z0-9-_]+)`, 'i')
      const m = codeLower.match(regex)
      matched = m ? m[1] : codeLower
    }
    // item_url から品番を抽出してフォールバック
    if (!matched && isOwnShop) {
      const urlProductId = extractProductIdFromUrl(item.item_url)
      if (urlProductId && OWN_PRODUCT_CODE_PREFIXES.some(p => urlProductId.toLowerCase().startsWith(p))) {
        matched = urlProductId
      } else {
        matched = item.item_code
      }
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

  console.log('[楽天ランキング] テーブルが存在しないため作成します...')
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
  console.log('[楽天ランキング] テーブル作成完了')
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
  lastBuildDate?: string | null,
): Promise<number> {
  if (!isBigQueryConfigured()) {
    console.warn('BigQuery未設定のため、ランキング保存をスキップします')
    return 0
  }

  const bq = getBigQueryClient()
  // ランキング発表日時（lastBuildDate）を優先、なければ現在時刻にフォールバック
  let rankingDate: string
  if (lastBuildDate) {
    const parsed = new Date(lastBuildDate)
    rankingDate = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
  } else {
    rankingDate = new Date().toISOString()
  }

  // 重複チェック: 同じ fetched_at + genre_id + ranking_type のデータが既に存在するかを確認
  try {
    const [dupRows] = await bq.query({
      query: `
        SELECT COUNT(*) AS cnt
        FROM \`tiast-data-platform.analytics_mart.rakuten_ranking_history\`
        WHERE fetched_at = TIMESTAMP('${rankingDate}')
          AND genre_id = '${genreId}'
          AND ranking_type = '${rankingType}'
        LIMIT 1
      `,
      location: 'asia-northeast1',
    })
    const count = Number((dupRows as { cnt: number }[])[0]?.cnt ?? 0)
    if (count > 0) {
      console.log(`[楽天ランキング] ${genreId} の ${rankingDate} は既に保存済みのためスキップ`)
      return 0
    }
  } catch (e) {
    // テーブルが存在しない場合など、重複チェック失敗時は保存を続行
    console.warn('[楽天ランキング] 重複チェック失敗（保存を続行）:', e)
  }

  const rows: RankingHistoryRecord[] = items.map((item) => {
    const match = matchResults.get(item.rank) || { isOwn: false, matchedCode: null }
    return {
      fetched_at: rankingDate,
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
    console.warn('[楽天ランキング] テーブル確認/作成に失敗:', e)
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
      console.warn('[楽天ランキング] Streaming insert権限エラーのため、SQL INSERTにフォールバック...')
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
