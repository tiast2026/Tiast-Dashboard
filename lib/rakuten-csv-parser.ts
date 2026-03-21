/**
 * 楽天RMS データダウンロード CSV パーサー
 *
 * CSVフォーマット:
 *   - エンコーディング: Shift_JIS (ブラウザからアップロード時はUTF-8に変換済み)
 *   - 区切り文字: タブ
 *   - 1行目: 注意書き
 *   - 2行目: データ対象期間
 *   - 3行目: ヘッダー
 *   - 4行目以降: データ
 */

// ---------- 共通型 ----------

export type RakutenDataType = 'store_data' | 'sku_sales'

export interface ParseResult<T> {
  dataType: RakutenDataType
  periodStart: string  // YYYY-MM-DD
  periodEnd: string    // YYYY-MM-DD
  rows: T[]
  headerCount: number
  rawRowCount: number
}

// ---------- 店舗データ ----------

export interface StoreDataRow {
  date: string            // YYYY-MM-DD
  day_of_week: string
  device: string
  sales_amount: number | null
  sales_count: number | null
  access_count: number | null
  conversion_rate: number | null
  avg_order_value: number | null
  unique_users: number | null
  buyers_member: number | null
  buyers_non_member: number | null
  new_buyers: number | null
  repeat_buyers: number | null
  tax_amount: number | null
  shipping_fee: number | null
  coupon_discount_store: number | null
  coupon_discount_rakuten: number | null
  free_shipping_coupon: number | null
  wrapping_fee: number | null
  payment_fee: number | null
  deal_sales_amount: number | null
  deal_sales_count: number | null
  deal_access_count: number | null
  deal_conversion_rate: number | null
  deal_avg_order_value: number | null
  deal_unique_users: number | null
  deal_buyers_member: number | null
  deal_buyers_non_member: number | null
  deal_new_buyers: number | null
  deal_repeat_buyers: number | null
  points_sales_amount: number | null
  points_sales_count: number | null
  points_cost: number | null
}

// ---------- SKU別売上データ ----------

export interface SkuSalesRow {
  catalog_id: string | null
  product_code: string
  product_number: string
  product_name: string
  sku_code: string
  sku_system_code: string | null
  sku_option_1: string | null
  sku_option_2: string | null
  sku_option_3: string | null
  sku_option_4: string | null
  sku_option_5: string | null
  sku_option_6: string | null
  sales_amount: number | null
  sales_count: number | null
  sales_quantity: number | null
}

// ---------- ヘッダーマッピング ----------

// 店舗データ: 日本語ヘッダー → フィールド名のマッピング (列位置ベース)
const STORE_DATA_HEADER_KEYWORDS = ['日付', '曜日', 'デバイス', '売上金額', '売上件数', 'アクセス人数', '転換率', '客単価']
const SKU_SALES_HEADER_KEYWORDS = ['カタログID', '商品管理番号', '商品番号', '商品名', 'SKU管理番号']

// ---------- ユーティリティ ----------

function parseIntSafe(v: string): number | null {
  if (!v || v === '-' || v === '') return null
  const cleaned = v.replace(/,/g, '')
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? null : n
}

function parseFloatSafe(v: string): number | null {
  if (!v || v === '-' || v === '') return null
  const cleaned = v.replace(/,/g, '').replace(/%/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function normalizeDate(dateStr: string): string {
  // 2026/3/1 → 2026-03-01
  const match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  }
  // 2026/03/01 → 2026-03-01
  return dateStr.replace(/\//g, '-')
}

function parsePeriod(line: string): { start: string; end: string } {
  // "データ対象期間 2026/03/01 ～ 2026/03/31" or "データ対象期間\t2026/03/01\t～\t2026/03/31"
  const match = line.match(/(\d{4}\/\d{1,2}\/\d{1,2})\s*[～~]\s*(\d{4}\/\d{1,2}\/\d{1,2})/)
  if (match) {
    return { start: normalizeDate(match[1]), end: normalizeDate(match[2]) }
  }
  return { start: '', end: '' }
}

// ---------- データ種類の自動判定 ----------

export function detectDataType(headerLine: string): RakutenDataType | null {
  if (STORE_DATA_HEADER_KEYWORDS.every(kw => headerLine.includes(kw))) {
    return 'store_data'
  }
  if (SKU_SALES_HEADER_KEYWORDS.every(kw => headerLine.includes(kw))) {
    return 'sku_sales'
  }
  return null
}

export function getDataTypeLabel(type: RakutenDataType): string {
  switch (type) {
    case 'store_data': return '店舗データ'
    case 'sku_sales': return 'SKU別売上データ'
  }
}

// ---------- 店舗データ パース ----------

/**
 * 店舗データCSVのヘッダーから、楽天スーパーDEALと運用型ポイントの列位置を特定する。
 * ベンチマーク列（サブジャンルTOP10平均、月商別平均値）はスキップ。
 */
function findStoreDataColumns(headers: string[]): {
  dealStartIdx: number
  pointsStartIdx: number
} {
  let dealStartIdx = -1
  let pointsStartIdx = -1

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (h === '楽天スーパーDEAL 売上金額' && dealStartIdx === -1) {
      dealStartIdx = i
    }
    if (h === '運用型ポイント変倍経由売上金額' && pointsStartIdx === -1) {
      pointsStartIdx = i
    }
  }

  return { dealStartIdx, pointsStartIdx }
}

function parseStoreDataRow(cols: string[], dealStartIdx: number, pointsStartIdx: number): StoreDataRow {
  return {
    date: normalizeDate(cols[0] || ''),
    day_of_week: cols[1] || '',
    device: cols[2] || '',
    sales_amount: parseIntSafe(cols[3]),
    sales_count: parseIntSafe(cols[4]),
    access_count: parseIntSafe(cols[5]),
    conversion_rate: parseFloatSafe(cols[6]),
    avg_order_value: parseIntSafe(cols[7]),
    unique_users: parseIntSafe(cols[8]),
    buyers_member: parseIntSafe(cols[9]),
    buyers_non_member: parseIntSafe(cols[10]),
    new_buyers: parseIntSafe(cols[11]),
    repeat_buyers: parseIntSafe(cols[12]),
    tax_amount: parseIntSafe(cols[13]),
    shipping_fee: parseIntSafe(cols[14]),
    coupon_discount_store: parseIntSafe(cols[15]),
    coupon_discount_rakuten: parseIntSafe(cols[16]),
    free_shipping_coupon: parseIntSafe(cols[17]),
    wrapping_fee: parseIntSafe(cols[18]),
    payment_fee: parseIntSafe(cols[19]),
    // Super DEAL (skip benchmark columns)
    deal_sales_amount: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx]) : null,
    deal_sales_count: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 1]) : null,
    deal_access_count: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 2]) : null,
    deal_conversion_rate: dealStartIdx >= 0 ? parseFloatSafe(cols[dealStartIdx + 3]) : null,
    deal_avg_order_value: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 4]) : null,
    deal_unique_users: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 5]) : null,
    deal_buyers_member: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 6]) : null,
    deal_buyers_non_member: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 7]) : null,
    deal_new_buyers: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 8]) : null,
    deal_repeat_buyers: dealStartIdx >= 0 ? parseIntSafe(cols[dealStartIdx + 9]) : null,
    // Points
    points_sales_amount: pointsStartIdx >= 0 ? parseIntSafe(cols[pointsStartIdx]) : null,
    points_sales_count: pointsStartIdx >= 0 ? parseIntSafe(cols[pointsStartIdx + 1]) : null,
    points_cost: pointsStartIdx >= 0 ? parseIntSafe(cols[pointsStartIdx + 2]) : null,
  }
}

export function parseStoreDataCSV(text: string): ParseResult<StoreDataRow> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())

  if (lines.length < 3) {
    throw new Error('CSVの行数が足りません（最低3行必要: 注意書き + 期間 + ヘッダー）')
  }

  const period = parsePeriod(lines[1])
  const headers = lines[2].split('\t')
  const { dealStartIdx, pointsStartIdx } = findStoreDataColumns(headers)

  const rows: StoreDataRow[] = []
  for (let i = 3; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (!cols[0] || !cols[0].match(/\d{4}\//)) continue
    rows.push(parseStoreDataRow(cols, dealStartIdx, pointsStartIdx))
  }

  return {
    dataType: 'store_data',
    periodStart: period.start,
    periodEnd: period.end,
    rows,
    headerCount: headers.length,
    rawRowCount: lines.length - 3,
  }
}

// ---------- SKU別売上データ パース ----------

function parseSkuSalesRow(cols: string[]): SkuSalesRow {
  return {
    catalog_id: cols[0] || null,
    product_code: cols[1] || '',
    product_number: cols[2] || '',
    product_name: cols[3] || '',
    sku_code: cols[4] || '',
    sku_system_code: cols[5] || null,
    sku_option_1: cols[6] || null,
    sku_option_2: cols[7] || null,
    sku_option_3: cols[8] || null,
    sku_option_4: cols[9] || null,
    sku_option_5: cols[10] || null,
    sku_option_6: cols[11] || null,
    sales_amount: parseIntSafe(cols[12]),
    sales_count: parseIntSafe(cols[13]),
    sales_quantity: parseIntSafe(cols[14]),
  }
}

export function parseSkuSalesCSV(text: string): ParseResult<SkuSalesRow> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())

  if (lines.length < 3) {
    throw new Error('CSVの行数が足りません（最低3行必要: 注意書き + 期間 + ヘッダー）')
  }

  const period = parsePeriod(lines[1])
  const headers = lines[2].split('\t')

  const rows: SkuSalesRow[] = []
  for (let i = 3; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (!cols[1]) continue  // skip rows without product_code
    rows.push(parseSkuSalesRow(cols))
  }

  return {
    dataType: 'sku_sales',
    periodStart: period.start,
    periodEnd: period.end,
    rows,
    headerCount: headers.length,
    rawRowCount: lines.length - 3,
  }
}

// ---------- 汎用パース ----------

export function parseRakutenCSV(text: string): ParseResult<StoreDataRow> | ParseResult<SkuSalesRow> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 3) {
    throw new Error('CSVの行数が足りません')
  }

  const headerLine = lines[2]
  const dataType = detectDataType(headerLine)

  if (!dataType) {
    throw new Error(
      '対応していないCSVフォーマットです。「店舗データ」または「SKU別売上データ」のCSVをアップロードしてください。\n' +
      `ヘッダー: ${headerLine.substring(0, 100)}...`
    )
  }

  switch (dataType) {
    case 'store_data':
      return parseStoreDataCSV(text)
    case 'sku_sales':
      return parseSkuSalesCSV(text)
  }
}
