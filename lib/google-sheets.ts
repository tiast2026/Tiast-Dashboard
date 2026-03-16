import { sheets, sheets_v4, auth as gauth } from '@googleapis/sheets'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || '1m_slCKW-k_pcEDW7goMDc7Mt3-gTQBL75mchKU-GOv8'
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'ダッシュボード用'

// Column mapping: spreadsheet header → internal key
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

// Headers in spreadsheet order
const HEADERS_ORDER = [
  '代表品番', 'ZOZO専用商品番号', 'サムネURL', '注力', 'ブランド', 'シーズン抽出',
  'シーズン', '販売日', '終了日', '再入荷', 'カテゴリ',
  'コラボ', 'サイズ', '上代', '下代', '発注ロット',
]

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
  _row_index?: number  // 1-based row number in sheet (for updates)
}

// In-memory cache
let cachedData: SheetProductMaster[] | null = null
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

function parseRow(row: string[], headerKeys: string[], rowIndex: number): SheetProductMaster {
  const obj: Record<string, string> = {}
  for (let i = 0; i < headerKeys.length; i++) {
    obj[headerKeys[i]] = (row[i] || '').trim()
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
    cacheTimestamp = Date.now()
    return []
  }

  // First row = headers
  const headers = rows[0] as string[]
  const headerKeys = headers.map(h => HEADER_MAP[h.trim()] || h.trim())

  const items: SheetProductMaster[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as string[]
    if (!row[0] || !row[0].trim()) continue // skip empty rows
    items.push(parseRow(row, headerKeys, i + 1)) // i+1 = 1-based row number
  }

  cachedData = items
  cacheTimestamp = Date.now()
  return items
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

  // Find the row to update
  const data = await fetchSheetData(true)
  const existing = data.find(d => d.product_code === product.product_code)

  const rowValues = HEADERS_ORDER.map(header => {
    const key = HEADER_MAP[header]
    const val = product[key as keyof SheetProductMaster]
    if (val === undefined || val === null) return ''
    return String(val)
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
      range: `${SHEET_NAME}!A:N`,
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

  const client = getSheetsClient()
  await client.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${existing._row_index}:N${existing._row_index}`,
  })

  // Invalidate cache
  cachedData = null
  return true
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
  cacheTimestamp = 0
}
