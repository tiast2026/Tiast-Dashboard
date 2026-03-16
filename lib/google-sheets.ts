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
