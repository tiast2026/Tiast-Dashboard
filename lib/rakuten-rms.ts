/**
 * 楽天RMS API v2.0 クライアント
 *
 * RMS APIで自社ショップの商品情報を取得し、
 * レビューCSVとのマッピングに使用する。
 *
 * 必要な環境変数:
 *   RAKUTEN_RMS_SHOPS - JSON配列: [{"shopName":"NOAHL","serviceSecret":"...","licenseKey":"...","shopId":"noahl"}, ...]
 */

const RMS_BASE_URL = 'https://api.rms.rakuten.co.jp/es/2.0'

export interface RmsShopConfig {
  shopName: string
  serviceSecret: string
  licenseKey: string
  shopId: string
}

export interface RmsItem {
  shopName: string
  manageNumber: string    // 商品管理番号 (= 品番, 例: nlwp473-2512)
  itemName: string        // 商品名
  hideItem: boolean       // 倉庫フラグ
  itemNumber?: string     // 楽天商品番号 (例: 10002380)
}

function getShopConfigs(): RmsShopConfig[] {
  const json = process.env.RAKUTEN_RMS_SHOPS
  if (!json) {
    throw new Error('RAKUTEN_RMS_SHOPS 環境変数が未設定です')
  }
  return JSON.parse(json)
}

export function isRmsConfigured(): boolean {
  return !!process.env.RAKUTEN_RMS_SHOPS
}

function buildAuthHeader(shop: RmsShopConfig): string {
  const encoded = Buffer.from(`${shop.serviceSecret}:${shop.licenseKey}`).toString('base64')
  return `ESA ${encoded}`
}

async function callRmsApi(
  method: string,
  url: string,
  shop: RmsShopConfig,
): Promise<Record<string, unknown> | null> {
  const maxRetry = 3
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: buildAuthHeader(shop),
          'Content-Type': 'application/json; charset=utf-8',
        },
      })

      if (res.ok) {
        return await res.json() as Record<string, unknown>
      }

      if (res.status === 429 || res.status === 503) {
        console.warn(`[RMS] ${res.status} リトライ ${attempt}/${maxRetry} - ${url}`)
        await new Promise(r => setTimeout(r, 5000 * attempt))
        continue
      }

      const body = await res.text().catch(() => '')
      console.warn(`[RMS] エラー ${res.status} ${method} ${url}: ${body.slice(0, 300)}`)
      return null
    } catch (e) {
      if (attempt < maxRetry) {
        console.warn(`[RMS] 例外 リトライ ${attempt}/${maxRetry}: ${e}`)
        await new Promise(r => setTimeout(r, 5000 * attempt))
        continue
      }
      console.error(`[RMS] 例外（リトライ上限）: ${e}`)
      return null
    }
  }
  return null
}

/**
 * 1ショップの全商品管理番号を取得 (items/search)
 */
async function getAllManageNumbers(shop: RmsShopConfig): Promise<string[]> {
  const numbers: string[] = []
  const HITS = 30
  let offset = 0

  while (true) {
    const url = `${RMS_BASE_URL}/items/search?hits=${HITS}&offset=${offset}`
    const data = await callRmsApi('GET', url, shop)
    if (!data) break

    const results = data.results as Array<{ item?: { manageNumber?: string } }> | undefined
    if (!results || results.length === 0) break

    for (const r of results) {
      if (r.item?.manageNumber) {
        numbers.push(r.item.manageNumber)
      }
    }

    offset += HITS
    const numFound = (data.numFound as number) || 0
    if (offset >= numFound) break

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000))
  }

  return numbers
}

/**
 * 1商品の詳細を取得
 */
async function getItem(
  shop: RmsShopConfig,
  manageNumber: string,
): Promise<Record<string, unknown> | null> {
  const url = `${RMS_BASE_URL}/items/manage-numbers/${encodeURIComponent(manageNumber)}`
  return callRmsApi('GET', url, shop)
}

/**
 * 全ショップの全商品情報を取得
 * 商品名と商品管理番号（品番）のマッピング用
 */
export async function fetchAllRmsItems(): Promise<RmsItem[]> {
  const shops = getShopConfigs()
  const allItems: RmsItem[] = []

  for (const shop of shops) {
    console.log(`[RMS] ${shop.shopName} の商品取得開始...`)
    const manageNumbers = await getAllManageNumbers(shop)
    console.log(`[RMS] ${shop.shopName}: ${manageNumbers.length}件の商品管理番号を取得`)

    for (let i = 0; i < manageNumbers.length; i++) {
      const mn = manageNumbers[i]

      if (i % 50 === 0 && i > 0) {
        console.log(`[RMS] ${shop.shopName}: ${i}/${manageNumbers.length} 処理中...`)
      }

      const item = await getItem(shop, mn)
      if (!item) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }

      const itemName = (item.title as string) || (item.itemName as string) || ''
      const hideItem = (item.hideItem as boolean) || false

      allItems.push({
        shopName: shop.shopName,
        manageNumber: mn,
        itemName,
        hideItem,
      })

      // Rate limiting
      await new Promise(r => setTimeout(r, 500))
    }

    console.log(`[RMS] ${shop.shopName}: 完了 (${allItems.length}件)`)
  }

  console.log(`[RMS] 全${allItems.length}件の商品を取得完了`)
  return allItems
}

/**
 * 商品名 → 品番（商品管理番号）のマップを作成
 */
export function buildNameToCodeMap(items: RmsItem[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of items) {
    if (item.itemName && item.manageNumber && !item.hideItem) {
      map.set(item.itemName, item.manageNumber)
    }
  }
  return map
}

/**
 * 全ショップの楽天商品番号 → 品番マッピングを取得
 * items/search の結果から itemNumber を取得し、manageNumber と紐付ける
 */
export async function fetchItemNumberMappings(): Promise<Array<{ itemNumber: string; manageNumber: string }>> {
  const shops = getShopConfigs()
  const mappings: Array<{ itemNumber: string; manageNumber: string }> = []

  for (const shop of shops) {
    console.log(`[RMS] ${shop.shopName} の商品番号マッピング取得開始...`)
    const HITS = 30
    let offset = 0

    while (true) {
      const url = `${RMS_BASE_URL}/items/search?hits=${HITS}&offset=${offset}`
      const data = await callRmsApi('GET', url, shop)
      if (!data) break

      const results = data.results as Array<{
        item?: { manageNumber?: string }
        itemNumber?: number | string
      }> | undefined
      if (!results || results.length === 0) break

      for (const r of results) {
        const manageNumber = r.item?.manageNumber
        // itemNumber can be at top level or inside item
        const itemNumber = r.itemNumber
          || (r.item as Record<string, unknown> | undefined)?.itemNumber
        if (manageNumber && itemNumber) {
          mappings.push({
            itemNumber: String(itemNumber),
            manageNumber,
          })
        }
      }

      offset += HITS
      const numFound = (data.numFound as number) || 0
      if (offset >= numFound) break

      await new Promise(r => setTimeout(r, 1000))
    }

    console.log(`[RMS] ${shop.shopName}: ${mappings.length}件のマッピング取得`)
  }

  return mappings
}
