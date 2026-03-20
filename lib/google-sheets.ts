import { sheets, sheets_v4, auth as gauth } from '@googleapis/sheets'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '1m_slCKW-k_pcEDW7goMDc7Mt3-gTQBL75mchKU-GOv8'
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'ダッシュボード用'

// Column mapping: spreadsheet header → internal key (known columns)
const HEADER_MAP: Record<string, string> = {
  '代表品番': 'product_code',
  'ZOZO専用商品番号': 'zozo_product_code',
  'サムネURL': 'image_url',
  '注力': 'is_focus',
  'ブランド': 'brand',
  'シーズン抽出': 'season_extraction',
  'シーズン': 'season',
  '販売日': 'sales_start_date',
  '終了日': 'sales_end_date',
  '再入荷': 'restock',
  'カテゴリ': 'category',
  'コラボ': 'collaborator',
  'サイズ': 'size',
  '上代': 'selling_price',
  '下代': 'cost_price',
  '発注ロット': 'order_lot',
}

export interface SheetProductMaster {
  product_code: string
  zozo_product_code: string
  image_url: string
  is_focus: string
  brand: string
  season_extraction: string
  season: string
  sales_start_date: string
  sales_end_date: string
  restock: string
  category: string
  collaborator: string
  size: string
  selling_price: number
  cost_price: number
  order_lot: number | null
  extra_fields: Record<string, string>  // dynamic columns not in HEADER_MAP
  _row_index?: number  // 1-based row number in sheet (for updates)
}

// Header info for the table UI
export interface SheetHeaderInfo {
  key: string       // internal key or original header name
  label: string     // original spreadsheet header name
  isExtra: boolean  // true if not in HEADER_MAP
}

// In-memory cache
let cachedData: SheetProductMaster[] | null = null
let cachedHeaders: SheetHeaderInfo[] | null = null
let cachedRawHeaders: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getSheetsClient(): sheets_v4.Sheets {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (!credJson) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not set')
  }

  const credentials = JSON.parse(credJson)
  const authClient = new gauth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return sheets({ version: 'v4', auth: authClient })
}

function parseRow(row: string[], headerKeys: string[], rawHeaders: string[], rowIndex: number): SheetProductMaster {
  const obj: Record<string, string> = {}
  const extra: Record<string, string> = {}

  for (let i = 0; i < headerKeys.length; i++) {
    const val = (row[i] || '').trim()
    const key = headerKeys[i]
    const rawHeader = rawHeaders[i]

    // If the key equals the raw header, it's an unknown/extra column
    if (!HEADER_MAP[rawHeader]) {
      extra[rawHeader] = val
    } else {
      obj[key] = val
    }
  }

  return {
    product_code: obj.product_code || '',
    zozo_product_code: obj.zozo_product_code || '',
    image_url: obj.image_url || '',
    is_focus: obj.is_focus || '',
    brand: obj.brand || '',
    season_extraction: obj.season_extraction || '',
    season: obj.season || '',
    sales_start_date: obj.sales_start_date || '',
    sales_end_date: obj.sales_end_date || '',
    restock: obj.restock || '',
    category: obj.category || '',
    collaborator: obj.collaborator || '',
    size: obj.size || '',
    selling_price: Number(obj.selling_price) || 0,
    cost_price: Number(obj.cost_price) || 0,
    order_lot: obj.order_lot ? Number(obj.order_lot) : null,
    extra_fields: extra,
    _row_index: rowIndex,
  }
}

/**
 * Fetch all rows from the spreadsheet
 */
export async function fetchSheetData(forceRefresh = false): Promise<SheetProductMaster[]> {
  if (!forceRefresh && cachedData && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData
  }

  const client = getSheetsClient()
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}`,
  })

  const rows = res.data.values
  if (!rows || rows.length < 2) {
    cachedData = []
    cachedHeaders = []
    cachedRawHeaders = []
    cacheTimestamp = Date.now()
    return []
  }

  // First row = headers
  const rawHeaders = (rows[0] as string[]).map(h => h.trim())
  const headerKeys = rawHeaders.map(h => HEADER_MAP[h] || h)

  // Build header info for the UI
  cachedHeaders = rawHeaders.map((h, i) => ({
    key: headerKeys[i],
    label: h,
    isExtra: !HEADER_MAP[h],
  }))
  cachedRawHeaders = rawHeaders

  const items: SheetProductMaster[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row[0] || !row[0].trim()) continue // skip empty rows
    items.push(parseRow(row, headerKeys, rawHeaders, i + 1)) // i+1 = 1-based row number
  }

  cachedData = items
  cacheTimestamp = Date.now()
  return items
}

/**
 * Get the spreadsheet headers (call after fetchSheetData)
 */
export async function getSheetHeaders(): Promise<SheetHeaderInfo[]> {
  if (!cachedHeaders) {
    await fetchSheetData()
  }
  return cachedHeaders || []
}

/**
 * Get a single product by code
 */
export async function getSheetProduct(productCode: string): Promise<SheetProductMaster | null> {
  const data = await fetchSheetData()
  return data.find(d => d.product_code === productCode) || null
}

/**
 * Get multiple products by codes (batch lookup)
 */
export async function getSheetProductsByCode(codes: string[]): Promise<Map<string, SheetProductMaster>> {
  const data = await fetchSheetData()
  const map = new Map<string, SheetProductMaster>()
  const codeSet = new Set(codes)
  for (const item of data) {
    if (codeSet.has(item.product_code)) {
      map.set(item.product_code, item)
    }
  }
  return map
}

/**
 * Update a single row in the spreadsheet
 */
export async function updateSheetRow(product: SheetProductMaster): Promise<void> {
  const client = getSheetsClient()

  // Ensure we have fresh data and headers
  const data = await fetchSheetData(true)
  const existing = data.find(d => d.product_code === product.product_code)

  const headers = cachedRawHeaders || []
  const rowValues = headers.map(header => {
    const key = HEADER_MAP[header]
    if (key) {
      const val = product[key as keyof SheetProductMaster]
      if (val === undefined || val === null) return ''
      return String(val)
    }
    // Extra field
    return product.extra_fields?.[header] || ''
  })

  if (existing && existing._row_index) {
    // Update existing row
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${existing._row_index}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    })
  } else {
    // Append new row
    await client.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    })
  }

  // Invalidate cache
  cachedData = null
}

/**
 * Delete a row from the spreadsheet (clear the row content)
 */
export async function deleteSheetRow(productCode: string): Promise<boolean> {
  const data = await fetchSheetData(true)
  const existing = data.find(d => d.product_code === productCode)
  if (!existing || !existing._row_index) return false

  const colCount = cachedRawHeaders?.length || 16
  const lastCol = String.fromCharCode(64 + colCount) // A=65

  const client = getSheetsClient()
  await client.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${existing._row_index}:${lastCol}${existing._row_index}`,
  })

  // Invalidate cache
  cachedData = null
  return true
}

// ============================================================
// SKU画像シート（ヘッダー動的読み取り）
// ============================================================

const SKU_SHEET_NAME = 'SKU画像'

// SKU画像シートの既知カラム → 内部キー
const SKU_HEADER_MAP: Record<string, string> = {
  '店舗名': 'shop_name',
  '商品管理番号': 'product_code',
  'システム連携用SKU番号': 'sku_code',
  'カラー': 'color',
  'サイズ': 'size',
  'SKU画像URL': 'sku_image_url',
}

export interface SkuImageRow {
  product_code: string
  shop_name: string
  sku_code: string
  color: string
  size: string
  sku_image_url: string
  extra_fields: Record<string, string>  // 動的カラム
}

export interface SkuHeaderInfo {
  key: string
  label: string
  isExtra: boolean
}

let cachedSkuData: SkuImageRow[] | null = null
let cachedSkuHeaders: SkuHeaderInfo[] | null = null
let skuCacheTimestamp = 0

/**
 * Fetch SKU image data from the SKU画像 sheet (header-based dynamic parsing)
 */
export async function fetchSkuImageData(forceRefresh = false): Promise<SkuImageRow[]> {
  if (!forceRefresh && cachedSkuData && Date.now() - skuCacheTimestamp < CACHE_TTL_MS) {
    return cachedSkuData
  }

  const client = getSheetsClient()
  const res = await client.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SKU_SHEET_NAME}`,
  })

  const rows = res.data.values
  if (!rows || rows.length < 2) {
    cachedSkuData = []
    cachedSkuHeaders = []
    skuCacheTimestamp = Date.now()
    return []
  }

  // First row = headers
  const rawHeaders = (rows[0] as string[]).map(h => h.trim())
  const headerKeys = rawHeaders.map(h => SKU_HEADER_MAP[h] || h)

  // Build header info
  cachedSkuHeaders = rawHeaders.map((h, i) => ({
    key: headerKeys[i],
    label: h,
    isExtra: !SKU_HEADER_MAP[h],
  }))

  const items: SkuImageRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as string[]
    const obj: Record<string, string> = {}
    const extra: Record<string, string> = {}

    for (let j = 0; j < headerKeys.length; j++) {
      const val = (row[j] || '').trim()
      const key = headerKeys[j]
      const rawHeader = rawHeaders[j]

      if (!SKU_HEADER_MAP[rawHeader]) {
        extra[rawHeader] = val
      } else {
        obj[key] = val
      }
    }

    if (!obj.product_code) continue
    items.push({
      product_code: obj.product_code,
      shop_name: obj.shop_name || '',
      sku_code: obj.sku_code || '',
      color: obj.color || '',
      size: obj.size || '',
      sku_image_url: obj.sku_image_url || '',
      extra_fields: extra,
    })
  }

  cachedSkuData = items
  skuCacheTimestamp = Date.now()
  return items
}

/**
 * Get SKU sheet headers (call after fetchSkuImageData)
 */
export async function getSkuHeaders(): Promise<SkuHeaderInfo[]> {
  if (!cachedSkuHeaders) {
    await fetchSkuImageData()
  }
  return cachedSkuHeaders || []
}

/**
 * Get SKU images for a specific product code
 */
export async function getSkuImagesForProduct(productCode: string): Promise<SkuImageRow[]> {
  const data = await fetchSkuImageData()
  return data.filter(d => d.product_code === productCode)
}

/**
 * Check if Google Sheets is configured and accessible
 */
export function isSheetsConfigured(): boolean {
  return !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
}

/**
 * Invalidate the cache (call after external updates)
 */
export function invalidateSheetCache(): void {
  cachedData = null
  cachedHeaders = null
  cachedRawHeaders = null
  cacheTimestamp = 0
}

// ============================================================
// レビューマッピングシート（楽天商品番号 → 品番）
// ============================================================

const REVIEW_MAPPING_SHEET_NAME = 'レビューマッピング'

export interface ReviewMappingRow {
  rakuten_item_id: string   // 楽天商品番号 (例: 10002114)
  product_code: string      // 品番 (例: nltp506-2602)
}

let cachedReviewMapping: ReviewMappingRow[] | null = null
let reviewMappingCacheTimestamp = 0

/**
 * Fetch review mapping data from the レビューマッピング sheet.
 * Expected columns: 楽天商品番号, 品番
 */
export async function fetchReviewMapping(forceRefresh = false): Promise<ReviewMappingRow[]> {
  if (!forceRefresh && cachedReviewMapping && Date.now() - reviewMappingCacheTimestamp < CACHE_TTL_MS) {
    return cachedReviewMapping
  }

  const client = getSheetsClient()

  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REVIEW_MAPPING_SHEET_NAME}`,
    })

    const rows = res.data.values
    if (!rows || rows.length < 2) {
      cachedReviewMapping = []
      reviewMappingCacheTimestamp = Date.now()
      return []
    }

    // First row = headers, find column indices
    const headers = (rows[0] as string[]).map(h => h.trim())
    const itemIdIdx = headers.findIndex(h => h === '楽天商品番号' || h === 'rakuten_item_id')
    const codeIdx = headers.findIndex(h => h === '品番' || h === 'product_code')

    if (itemIdIdx === -1 || codeIdx === -1) {
      console.warn('[レビューマッピング] ヘッダーが見つかりません。「楽天商品番号」「品番」列が必要です')
      cachedReviewMapping = []
      reviewMappingCacheTimestamp = Date.now()
      return []
    }

    const items: ReviewMappingRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[]
      const rakutenItemId = (row[itemIdIdx] || '').trim()
      const productCode = (row[codeIdx] || '').trim()
      if (rakutenItemId && productCode) {
        items.push({ rakuten_item_id: rakutenItemId, product_code: productCode })
      }
    }

    cachedReviewMapping = items
    reviewMappingCacheTimestamp = Date.now()
    console.log(`[レビューマッピング] ${items.length}件のマッピング読み込み完了`)
    return items
  } catch (error) {
    console.warn('[レビューマッピング] シート読み込みエラー:', error)
    cachedReviewMapping = []
    reviewMappingCacheTimestamp = Date.now()
    return []
  }
}

/**
 * Build a map of rakuten_item_id → product_code
 */
export async function getReviewMappingMap(): Promise<Map<string, string>> {
  const data = await fetchReviewMapping()
  const map = new Map<string, string>()
  for (const row of data) {
    map.set(row.rakuten_item_id, row.product_code)
  }
  return map
}

/**
 * Append new mappings to the レビューマッピング sheet (skip duplicates).
 * Automatically creates the sheet + headers if it doesn't exist.
 */
export async function appendReviewMappings(
  newMappings: ReviewMappingRow[],
): Promise<number> {
  if (newMappings.length === 0) return 0

  const client = getSheetsClient()

  // Fetch existing mappings to avoid duplicates
  const existing = await fetchReviewMapping(true)
  const existingSet = new Set(existing.map(r => r.rakuten_item_id))

  const toAdd = newMappings.filter(m => !existingSet.has(m.rakuten_item_id))
  if (toAdd.length === 0) return 0

  // Ensure sheet exists with headers
  if (existing.length === 0) {
    try {
      await client.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: REVIEW_MAPPING_SHEET_NAME },
            },
          }],
        },
      })
    } catch {
      // Sheet already exists — ignore
    }

    // Write headers
    await client.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${REVIEW_MAPPING_SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['楽天商品番号', '品番']],
      },
    })
  }

  // Append new rows
  const rows = toAdd.map(m => [m.rakuten_item_id, m.product_code])
  await client.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${REVIEW_MAPPING_SHEET_NAME}!A:B`,
    valueInputOption: 'RAW',
    requestBody: {
      values: rows,
    },
  })

  // Invalidate cache
  cachedReviewMapping = null
  reviewMappingCacheTimestamp = 0

  console.log(`[レビューマッピング] ${toAdd.length}件の新規マッピングを自動追加`)
  return toAdd.length
}

/**
 * Build a map of product_name → product_code from the mapping sheet
 */
export async function getProductNameMappingMap(): Promise<Map<string, string>> {
  // Name mapping comes from the RMS items sheet, not this one
  return new Map()
}

// ============================================================
// RMS商品マスタシート（RMS APIから取得した商品一覧）
// ============================================================

const RMS_ITEMS_SHEET_NAME = 'RMS商品マスタ'

export interface RmsItemRow {
  item_url: string        // 商品管理番号 (= 品番)
  item_name: string       // 商品名
  item_price: number      // 価格
  item_number: string     // 楽天商品番号（内部ID）
}

/**
 * Write RMS items to the RMS商品マスタ sheet.
 * Overwrites existing data.
 */
export async function writeRmsItemsToSheet(items: RmsItemRow[]): Promise<void> {
  const client = getSheetsClient()

  // Clear existing data
  try {
    await client.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${RMS_ITEMS_SHEET_NAME}`,
    })
  } catch {
    // Sheet might not exist yet, create it
    try {
      await client.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: { title: RMS_ITEMS_SHEET_NAME },
            },
          }],
        },
      })
    } catch (e) {
      console.warn('[RMS商品マスタ] シート作成エラー (既に存在する場合は無視):', e)
    }
  }

  // Write headers + data
  const headers = ['商品管理番号', '商品名', '価格', '楽天商品番号']
  const rows = items.map(item => [
    item.item_url,
    item.item_name,
    String(item.item_price),
    item.item_number,
  ])

  await client.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RMS_ITEMS_SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers, ...rows],
    },
  })

  console.log(`[RMS商品マスタ] ${items.length}件をシートに書き込み完了`)

  // Invalidate review mapping cache since it may depend on this data
  cachedReviewMapping = null
  reviewMappingCacheTimestamp = 0
}

/**
 * Read RMS items from the sheet and build a name → product_code map
 */
export async function fetchRmsItemsFromSheet(): Promise<RmsItemRow[]> {
  const client = getSheetsClient()

  try {
    const res = await client.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${RMS_ITEMS_SHEET_NAME}`,
    })

    const rows = res.data.values
    if (!rows || rows.length < 2) return []

    const items: RmsItemRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as string[]
      items.push({
        item_url: (row[0] || '').trim(),
        item_name: (row[1] || '').trim(),
        item_price: Number(row[2]) || 0,
        item_number: (row[3] || '').trim(),
      })
    }
    return items
  } catch {
    return []
  }
}

/**
 * Build a product_name → product_code map from RMS items sheet
 */
export async function getRmsNameToCodeMap(): Promise<Map<string, string>> {
  const items = await fetchRmsItemsFromSheet()
  const map = new Map<string, string>()
  for (const item of items) {
    if (item.item_name && item.item_url) {
      map.set(item.item_name, item.item_url)
    }
  }
  return map
}
