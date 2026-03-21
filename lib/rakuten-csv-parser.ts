/**
 * 楽天RMS データダウンロード CSV パーサー
 *
 * 対応データ種類（5種）:
 *   1. 店舗データ                          → store_data
 *   2. SKU別売上データ                      → sku_sales
 *   3. 新規・リピート購入者数（店舗別）        → new_repeat_store
 *   4. 新規・リピート購入者数（商品別）        → new_repeat_product
 *   5. 新規・リピート購入者数（商品ジャンル別）  → new_repeat_genre
 *
 * CSVフォーマット:
 *   - エンコーディング: Shift_JIS
 *   - 区切り文字: カンマまたはタブ（自動検出）
 *   - 1行目: 注意書き
 *   - 2行目: データ対象期間
 *   - 3行目: ヘッダー
 *   - 4行目以降: データ
 */

// ---------- 共通型 ----------

export type RakutenDataType =
  | 'store_data'
  | 'sku_sales'
  | 'new_repeat_store'
  | 'new_repeat_product'
  | 'new_repeat_genre'

export interface ParseResult {
  dataType: RakutenDataType
  periodStart: string
  periodEnd: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[]
  rowCount: number
}

// ---------- データ種類ラベル ----------

const DATA_TYPE_LABELS: Record<RakutenDataType, string> = {
  store_data: '店舗データ',
  sku_sales: 'SKU別売上データ',
  new_repeat_store: '新規・リピート購入者数（店舗別）',
  new_repeat_product: '新規・リピート購入者数（商品別）',
  new_repeat_genre: '新規・リピート購入者数（商品ジャンル別）',
}

export function getDataTypeLabel(type: RakutenDataType): string {
  return DATA_TYPE_LABELS[type] || type
}

// ---------- ファイル名からデータ種類を判定 ----------

export function detectDataTypeFromFilename(filename: string): RakutenDataType | null {
  if (filename.includes('店舗データ')) return 'store_data'
  if (filename.includes('SKU別売上')) return 'sku_sales'
  if (filename.includes('新規') && filename.includes('店舗別')) return 'new_repeat_store'
  if (filename.includes('新規') && filename.includes('商品別')) return 'new_repeat_product'
  if (filename.includes('新規') && filename.includes('商品ジャンル別')) return 'new_repeat_genre'
  return null
}

/** ファイル名が楽天データCSVかどうか */
export function isRakutenDataCSV(filename: string): boolean {
  return detectDataTypeFromFilename(filename) !== null
}

// ---------- CSV行パーサー（カンマ区切り＋引用符対応） ----------

function parseCSVLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t')
  }

  // カンマ区切り: 引用符対応
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/** 区切り文字を自動検出: ヘッダー行（3行目）にタブがあればタブ、なければカンマ */
function detectDelimiter(lines: string[]): string {
  const headerLine = lines[2] || ''
  if (headerLine.includes('\t')) return '\t'
  return ','
}

// ---------- ユーティリティ ----------

function parseInt_(v: string | undefined): number | null {
  if (!v || v === '-' || v === '') return null
  const cleaned = v.replace(/,/g, '')
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? null : n
}

function parseFloat_(v: string | undefined): number | null {
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
  return dateStr.replace(/\//g, '-')
}

function parsePeriod(line: string): { start: string; end: string } {
  // 日次: "データ対象期間 2026/03/01 ～ 2026/03/31"
  const matchFull = line.match(new RegExp(`(\\d{4}\\/\\d{1,2}\\/\\d{1,2})\\s*[～〜~]\\s*(\\d{4}\\/\\d{1,2}\\/\\d{1,2})`))
  if (matchFull) {
    return { start: normalizeDate(matchFull[1]), end: normalizeDate(matchFull[2]) }
  }
  // 月次: "データ対象期間 2024/04 ～ 2026/03"
  const matchMonth = line.match(new RegExp(`(\\d{4}\\/\\d{1,2})\\s*[～〜~]\\s*(\\d{4}\\/\\d{1,2})`))
  if (matchMonth) {
    return {
      start: normalizeDate(matchMonth[1] + '/01'),
      end: normalizeDate(matchMonth[2] + '/01'),
    }
  }
  return { start: '', end: '' }
}

/** "2024年4月" → "2024-04-01" */
function parseJapaneseMonth(s: string): string | null {
  const m = s.match(/^(\d{4})年(\d{1,2})月$/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-01`
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter(l => l.trim())
}

// ---------- 1. 店舗データ ----------

function findColumnIndex(headers: string[], keyword: string): number {
  return headers.findIndex(h => h === keyword)
}

function parseStoreData(lines: string[], period: { start: string; end: string }, delim: string): ParseResult {
  const headers = parseCSVLine(lines[2], delim)

  const dealIdx = findColumnIndex(headers, '楽天スーパーDEAL 売上金額')
  const pointsIdx = findColumnIndex(headers, '運用型ポイント変倍経由売上金額')

  const rows: Record<string, unknown>[] = []
  for (let i = 3; i < lines.length; i++) {
    const c = parseCSVLine(lines[i], delim)
    if (!c[0] || !c[0].match(/\d{4}\//)) continue
    rows.push({
      date: normalizeDate(c[0]),
      day_of_week: c[1] || '',
      device: c[2] || '',
      sales_amount: parseInt_(c[3]), sales_count: parseInt_(c[4]),
      access_count: parseInt_(c[5]), conversion_rate: parseFloat_(c[6]),
      avg_order_value: parseInt_(c[7]), unique_users: parseInt_(c[8]),
      buyers_member: parseInt_(c[9]), buyers_non_member: parseInt_(c[10]),
      new_buyers: parseInt_(c[11]), repeat_buyers: parseInt_(c[12]),
      tax_amount: parseInt_(c[13]), shipping_fee: parseInt_(c[14]),
      coupon_discount_store: parseInt_(c[15]), coupon_discount_rakuten: parseInt_(c[16]),
      free_shipping_coupon: parseInt_(c[17]), wrapping_fee: parseInt_(c[18]),
      payment_fee: parseInt_(c[19]),
      deal_sales_amount: dealIdx >= 0 ? parseInt_(c[dealIdx]) : null,
      deal_sales_count: dealIdx >= 0 ? parseInt_(c[dealIdx + 1]) : null,
      deal_access_count: dealIdx >= 0 ? parseInt_(c[dealIdx + 2]) : null,
      deal_conversion_rate: dealIdx >= 0 ? parseFloat_(c[dealIdx + 3]) : null,
      deal_avg_order_value: dealIdx >= 0 ? parseInt_(c[dealIdx + 4]) : null,
      deal_unique_users: dealIdx >= 0 ? parseInt_(c[dealIdx + 5]) : null,
      deal_buyers_member: dealIdx >= 0 ? parseInt_(c[dealIdx + 6]) : null,
      deal_buyers_non_member: dealIdx >= 0 ? parseInt_(c[dealIdx + 7]) : null,
      deal_new_buyers: dealIdx >= 0 ? parseInt_(c[dealIdx + 8]) : null,
      deal_repeat_buyers: dealIdx >= 0 ? parseInt_(c[dealIdx + 9]) : null,
      points_sales_amount: pointsIdx >= 0 ? parseInt_(c[pointsIdx]) : null,
      points_sales_count: pointsIdx >= 0 ? parseInt_(c[pointsIdx + 1]) : null,
      points_cost: pointsIdx >= 0 ? parseInt_(c[pointsIdx + 2]) : null,
    })
  }
  return { dataType: 'store_data', periodStart: period.start, periodEnd: period.end, rows, rowCount: rows.length }
}

// ---------- 2. SKU別売上データ ----------

function parseSkuSales(lines: string[], period: { start: string; end: string }, delim: string): ParseResult {
  const rows: Record<string, unknown>[] = []
  for (let i = 3; i < lines.length; i++) {
    const c = parseCSVLine(lines[i], delim)
    if (!c[1]) continue
    rows.push({
      catalog_id: c[0] || null,
      product_code: c[1] || '', product_number: c[2] || '',
      product_name: c[3] || '', sku_code: c[4] || '',
      sku_system_code: c[5] || null,
      sku_option_1: c[6] || null, sku_option_2: c[7] || null,
      sku_option_3: c[8] || null, sku_option_4: c[9] || null,
      sku_option_5: c[10] || null, sku_option_6: c[11] || null,
      sales_amount: parseInt_(c[12]), sales_count: parseInt_(c[13]),
      sales_quantity: parseInt_(c[14]),
    })
  }
  return { dataType: 'sku_sales', periodStart: period.start, periodEnd: period.end, rows, rowCount: rows.length }
}

// ---------- 3. 新規・リピート購入者数（店舗別） ----------

function parseNewRepeatStore(lines: string[], period: { start: string; end: string }, delim: string): ParseResult {
  const rows: Record<string, unknown>[] = []
  for (let i = 3; i < lines.length; i++) {
    const c = parseCSVLine(lines[i], delim)
    if (!c[0] || !c[0].includes('年')) continue
    rows.push({
      month: c[0],
      month_date: parseJapaneseMonth(c[0]),
      new_buyers: parseInt_(c[1]),
      new_avg_order_value: parseInt_(c[2]),
      new_sales: parseInt_(c[3]),
      new_sales_count: parseInt_(c[4]),
      new_sales_quantity: parseInt_(c[5]),
      repeat_buyers: parseInt_(c[6]),
      repeat_avg_order_value: parseInt_(c[7]),
      repeat_sales: parseInt_(c[8]),
      repeat_sales_count: parseInt_(c[9]),
      repeat_sales_quantity: parseInt_(c[10]),
    })
  }
  return { dataType: 'new_repeat_store', periodStart: period.start, periodEnd: period.end, rows, rowCount: rows.length }
}

// ---------- 4. 新規・リピート購入者数（商品別） ----------

function parseNewRepeatProduct(lines: string[], period: { start: string; end: string }, delim: string): ParseResult {
  const rows: Record<string, unknown>[] = []
  for (let i = 3; i < lines.length; i++) {
    const c = parseCSVLine(lines[i], delim)
    if (!c[0]) continue
    rows.push({
      product_name: c[0],
      product_url: c[1] || '',
      product_price: parseInt_(c[2]),
      is_discontinued: c[3] === '販売停止',
      new_buyers: parseInt_(c[3] === '販売停止' ? c[4] : c[3]),
      repeat_buyers: parseInt_(c[3] === '販売停止' ? c[5] : c[4]),
      repeat_rate: parseFloat_(c[3] === '販売停止' ? c[6] : c[5]),
    })
  }
  return { dataType: 'new_repeat_product', periodStart: period.start, periodEnd: period.end, rows, rowCount: rows.length }
}

// ---------- 5. 新規・リピート購入者数（商品ジャンル別） ----------

function parseNewRepeatGenre(lines: string[], period: { start: string; end: string }, delim: string): ParseResult {
  const rows: Record<string, unknown>[] = []
  for (let i = 3; i < lines.length; i++) {
    const c = parseCSVLine(lines[i], delim)
    if (!c[0]) continue
    rows.push({
      genre_name: c[0],
      new_buyers: parseInt_(c[1]),
      repeat_buyers: parseInt_(c[2]),
      repeat_rate: parseFloat_(c[3]),
      new_avg_purchase: parseInt_(c[4]),
      repeat_avg_purchase: parseInt_(c[5]),
      avg_purchase_count: parseFloat_(c[6]),
      avg_purchase_amount: parseInt_(c[7]),
    })
  }
  return { dataType: 'new_repeat_genre', periodStart: period.start, periodEnd: period.end, rows, rowCount: rows.length }
}

// ---------- メインパーサー ----------

export function parseRakutenCSV(text: string, filename: string): ParseResult {
  const lines = splitLines(text)
  if (lines.length < 3) {
    throw new Error('CSVの行数が足りません（最低3行必要）')
  }

  const dataType = detectDataTypeFromFilename(filename)
  if (!dataType) {
    throw new Error(`対応していないCSVファイルです: ${filename}`)
  }

  const delim = detectDelimiter(lines)
  const period = parsePeriod(lines[1])

  switch (dataType) {
    case 'store_data':
      return parseStoreData(lines, period, delim)
    case 'sku_sales':
      return parseSkuSales(lines, period, delim)
    case 'new_repeat_store':
      return parseNewRepeatStore(lines, period, delim)
    case 'new_repeat_product':
      return parseNewRepeatProduct(lines, period, delim)
    case 'new_repeat_genre':
      return parseNewRepeatGenre(lines, period, delim)
  }
}
