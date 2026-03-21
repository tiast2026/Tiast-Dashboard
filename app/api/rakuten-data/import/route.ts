import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import { fetchRakutenDataCSVsFromDrive, moveDriveFilesToImported } from '@/lib/google-drive'
import { parseRakutenCSV, getDataTypeLabel, type RakutenDataType } from '@/lib/rakuten-csv-parser'

export const maxDuration = 300

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
}

function sqlNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return String(v)
}

function sqlBool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return 'NULL'
  return v ? 'TRUE' : 'FALSE'
}

// ---------- テーブル作成 ----------

const TABLE_SCHEMAS: Record<RakutenDataType, { table: string; fields: { name: string; type: string; mode?: string }[] }> = {
  store_data: {
    table: 'rakuten_store_data',
    fields: [
      { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'date', type: 'DATE', mode: 'REQUIRED' },
      { name: 'day_of_week', type: 'STRING' }, { name: 'device', type: 'STRING' },
      { name: 'sales_amount', type: 'INT64' }, { name: 'sales_count', type: 'INT64' },
      { name: 'access_count', type: 'INT64' }, { name: 'conversion_rate', type: 'FLOAT64' },
      { name: 'avg_order_value', type: 'INT64' }, { name: 'unique_users', type: 'INT64' },
      { name: 'buyers_member', type: 'INT64' }, { name: 'buyers_non_member', type: 'INT64' },
      { name: 'new_buyers', type: 'INT64' }, { name: 'repeat_buyers', type: 'INT64' },
      { name: 'tax_amount', type: 'INT64' }, { name: 'shipping_fee', type: 'INT64' },
      { name: 'coupon_discount_store', type: 'INT64' }, { name: 'coupon_discount_rakuten', type: 'INT64' },
      { name: 'free_shipping_coupon', type: 'INT64' }, { name: 'wrapping_fee', type: 'INT64' },
      { name: 'payment_fee', type: 'INT64' },
      { name: 'deal_sales_amount', type: 'INT64' }, { name: 'deal_sales_count', type: 'INT64' },
      { name: 'deal_access_count', type: 'INT64' }, { name: 'deal_conversion_rate', type: 'FLOAT64' },
      { name: 'deal_avg_order_value', type: 'INT64' }, { name: 'deal_unique_users', type: 'INT64' },
      { name: 'deal_buyers_member', type: 'INT64' }, { name: 'deal_buyers_non_member', type: 'INT64' },
      { name: 'deal_new_buyers', type: 'INT64' }, { name: 'deal_repeat_buyers', type: 'INT64' },
      { name: 'points_sales_amount', type: 'INT64' }, { name: 'points_sales_count', type: 'INT64' },
      { name: 'points_cost', type: 'INT64' },
      { name: '_imported_at', type: 'TIMESTAMP' },
    ],
  },
  sku_sales: {
    table: 'rakuten_sku_sales',
    fields: [
      { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'period_start', type: 'DATE', mode: 'REQUIRED' },
      { name: 'period_end', type: 'DATE', mode: 'REQUIRED' },
      { name: 'catalog_id', type: 'STRING' }, { name: 'product_code', type: 'STRING' },
      { name: 'product_number', type: 'STRING' }, { name: 'product_name', type: 'STRING' },
      { name: 'sku_code', type: 'STRING' }, { name: 'sku_system_code', type: 'STRING' },
      { name: 'sku_option_1', type: 'STRING' }, { name: 'sku_option_2', type: 'STRING' },
      { name: 'sku_option_3', type: 'STRING' }, { name: 'sku_option_4', type: 'STRING' },
      { name: 'sku_option_5', type: 'STRING' }, { name: 'sku_option_6', type: 'STRING' },
      { name: 'sales_amount', type: 'INT64' }, { name: 'sales_count', type: 'INT64' },
      { name: 'sales_quantity', type: 'INT64' },
      { name: '_imported_at', type: 'TIMESTAMP' },
    ],
  },
  new_repeat_store: {
    table: 'rakuten_new_repeat_store',
    fields: [
      { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'month', type: 'STRING', mode: 'REQUIRED' },
      { name: 'month_date', type: 'DATE' },
      { name: 'new_buyers', type: 'INT64' }, { name: 'new_avg_order_value', type: 'INT64' },
      { name: 'new_sales', type: 'INT64' }, { name: 'new_sales_count', type: 'INT64' },
      { name: 'new_sales_quantity', type: 'INT64' },
      { name: 'repeat_buyers', type: 'INT64' }, { name: 'repeat_avg_order_value', type: 'INT64' },
      { name: 'repeat_sales', type: 'INT64' }, { name: 'repeat_sales_count', type: 'INT64' },
      { name: 'repeat_sales_quantity', type: 'INT64' },
      { name: '_imported_at', type: 'TIMESTAMP' },
    ],
  },
  new_repeat_product: {
    table: 'rakuten_new_repeat_product',
    fields: [
      { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'period_start', type: 'DATE', mode: 'REQUIRED' },
      { name: 'period_end', type: 'DATE', mode: 'REQUIRED' },
      { name: 'product_name', type: 'STRING' }, { name: 'product_url', type: 'STRING' },
      { name: 'product_price', type: 'INT64' }, { name: 'is_discontinued', type: 'BOOL' },
      { name: 'new_buyers', type: 'INT64' }, { name: 'repeat_buyers', type: 'INT64' },
      { name: 'repeat_rate', type: 'FLOAT64' },
      { name: '_imported_at', type: 'TIMESTAMP' },
    ],
  },
  new_repeat_genre: {
    table: 'rakuten_new_repeat_genre',
    fields: [
      { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
      { name: 'period_start', type: 'DATE', mode: 'REQUIRED' },
      { name: 'period_end', type: 'DATE', mode: 'REQUIRED' },
      { name: 'genre_name', type: 'STRING' },
      { name: 'new_buyers', type: 'INT64' }, { name: 'repeat_buyers', type: 'INT64' },
      { name: 'repeat_rate', type: 'FLOAT64' },
      { name: 'new_avg_purchase', type: 'INT64' }, { name: 'repeat_avg_purchase', type: 'INT64' },
      { name: 'avg_purchase_count', type: 'FLOAT64' }, { name: 'avg_purchase_amount', type: 'INT64' },
      { name: '_imported_at', type: 'TIMESTAMP' },
    ],
  },
}

async function ensureTable(bq: ReturnType<typeof getBigQueryClient>, dataType: RakutenDataType) {
  const schema = TABLE_SCHEMAS[dataType]
  const table = bq.dataset(DATASET).table(schema.table)
  const [exists] = await table.exists()
  if (!exists) {
    console.log(`[楽天データ] テーブル ${schema.table} 作成中...`)
    await table.create({ schema: { fields: schema.fields } })
  }
}

// ---------- 重複削除（期間ベース上書き） ----------

async function deletePeriodData(
  bq: ReturnType<typeof getBigQueryClient>,
  tableName: string,
  shopName: string,
  periodStart: string,
  periodEnd: string,
  dateColumn: string = 'period_start',
) {
  try {
    if (dateColumn === 'date') {
      await bq.query({
        query: `DELETE FROM \`${PROJECT}.${DATASET}.${tableName}\`
                WHERE shop_name = @shopName AND date BETWEEN @periodStart AND @periodEnd`,
        params: { shopName, periodStart, periodEnd },
        location: 'asia-northeast1',
      })
    } else if (dateColumn === 'month') {
      await bq.query({
        query: `DELETE FROM \`${PROJECT}.${DATASET}.${tableName}\`
                WHERE shop_name = @shopName`,
        params: { shopName },
        location: 'asia-northeast1',
      })
    } else {
      await bq.query({
        query: `DELETE FROM \`${PROJECT}.${DATASET}.${tableName}\`
                WHERE shop_name = @shopName AND period_start = @periodStart AND period_end = @periodEnd`,
        params: { shopName, periodStart, periodEnd },
        location: 'asia-northeast1',
      })
    }
  } catch {
    // table might not exist yet
  }
}

// ---------- INSERT ----------

async function batchInsert(
  bq: ReturnType<typeof getBigQueryClient>,
  tableName: string,
  columns: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rowToValues: (r: any) => string,
) {
  const batchSize = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch.map(rowToValues).join(',\n')
    await bq.query({
      query: `INSERT INTO \`${PROJECT}.${DATASET}.${tableName}\` (${columns.join(', ')}) VALUES ${values}`,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }
  return inserted
}

// ---------- 各データ種類のINSERT ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importStoreData(bq: ReturnType<typeof getBigQueryClient>, shopName: string, parsed: { periodStart: string; periodEnd: string; rows: any[] }) {
  await deletePeriodData(bq, 'rakuten_store_data', shopName, parsed.periodStart, parsed.periodEnd, 'date')
  const cols = [
    'shop_name', 'date', 'day_of_week', 'device',
    'sales_amount', 'sales_count', 'access_count', 'conversion_rate',
    'avg_order_value', 'unique_users', 'buyers_member', 'buyers_non_member',
    'new_buyers', 'repeat_buyers', 'tax_amount', 'shipping_fee',
    'coupon_discount_store', 'coupon_discount_rakuten', 'free_shipping_coupon',
    'wrapping_fee', 'payment_fee',
    'deal_sales_amount', 'deal_sales_count', 'deal_access_count',
    'deal_conversion_rate', 'deal_avg_order_value', 'deal_unique_users',
    'deal_buyers_member', 'deal_buyers_non_member', 'deal_new_buyers', 'deal_repeat_buyers',
    'points_sales_amount', 'points_sales_count', 'points_cost', '_imported_at',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchInsert(bq, 'rakuten_store_data', cols, parsed.rows, (r: any) =>
    `(${sqlStr(shopName)}, DATE '${r.date}', ${sqlStr(r.day_of_week)}, ${sqlStr(r.device)}, ` +
    `${sqlNum(r.sales_amount)}, ${sqlNum(r.sales_count)}, ${sqlNum(r.access_count)}, ${sqlNum(r.conversion_rate)}, ` +
    `${sqlNum(r.avg_order_value)}, ${sqlNum(r.unique_users)}, ${sqlNum(r.buyers_member)}, ${sqlNum(r.buyers_non_member)}, ` +
    `${sqlNum(r.new_buyers)}, ${sqlNum(r.repeat_buyers)}, ${sqlNum(r.tax_amount)}, ${sqlNum(r.shipping_fee)}, ` +
    `${sqlNum(r.coupon_discount_store)}, ${sqlNum(r.coupon_discount_rakuten)}, ${sqlNum(r.free_shipping_coupon)}, ` +
    `${sqlNum(r.wrapping_fee)}, ${sqlNum(r.payment_fee)}, ` +
    `${sqlNum(r.deal_sales_amount)}, ${sqlNum(r.deal_sales_count)}, ${sqlNum(r.deal_access_count)}, ` +
    `${sqlNum(r.deal_conversion_rate)}, ${sqlNum(r.deal_avg_order_value)}, ${sqlNum(r.deal_unique_users)}, ` +
    `${sqlNum(r.deal_buyers_member)}, ${sqlNum(r.deal_buyers_non_member)}, ${sqlNum(r.deal_new_buyers)}, ${sqlNum(r.deal_repeat_buyers)}, ` +
    `${sqlNum(r.points_sales_amount)}, ${sqlNum(r.points_sales_count)}, ${sqlNum(r.points_cost)}, CURRENT_TIMESTAMP())`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importSkuSales(bq: ReturnType<typeof getBigQueryClient>, shopName: string, parsed: { periodStart: string; periodEnd: string; rows: any[] }) {
  await deletePeriodData(bq, 'rakuten_sku_sales', shopName, parsed.periodStart, parsed.periodEnd)
  const cols = [
    'shop_name', 'period_start', 'period_end',
    'catalog_id', 'product_code', 'product_number', 'product_name',
    'sku_code', 'sku_system_code',
    'sku_option_1', 'sku_option_2', 'sku_option_3',
    'sku_option_4', 'sku_option_5', 'sku_option_6',
    'sales_amount', 'sales_count', 'sales_quantity', '_imported_at',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchInsert(bq, 'rakuten_sku_sales', cols, parsed.rows, (r: any) =>
    `(${sqlStr(shopName)}, DATE '${parsed.periodStart}', DATE '${parsed.periodEnd}', ` +
    `${sqlStr(r.catalog_id)}, ${sqlStr(r.product_code)}, ${sqlStr(r.product_number)}, ${sqlStr(r.product_name)}, ` +
    `${sqlStr(r.sku_code)}, ${sqlStr(r.sku_system_code)}, ` +
    `${sqlStr(r.sku_option_1)}, ${sqlStr(r.sku_option_2)}, ${sqlStr(r.sku_option_3)}, ` +
    `${sqlStr(r.sku_option_4)}, ${sqlStr(r.sku_option_5)}, ${sqlStr(r.sku_option_6)}, ` +
    `${sqlNum(r.sales_amount)}, ${sqlNum(r.sales_count)}, ${sqlNum(r.sales_quantity)}, CURRENT_TIMESTAMP())`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importNewRepeatStore(bq: ReturnType<typeof getBigQueryClient>, shopName: string, parsed: { rows: any[] }) {
  await deletePeriodData(bq, 'rakuten_new_repeat_store', shopName, '', '', 'month')
  const cols = [
    'shop_name', 'month', 'month_date',
    'new_buyers', 'new_avg_order_value', 'new_sales', 'new_sales_count', 'new_sales_quantity',
    'repeat_buyers', 'repeat_avg_order_value', 'repeat_sales', 'repeat_sales_count', 'repeat_sales_quantity',
    '_imported_at',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchInsert(bq, 'rakuten_new_repeat_store', cols, parsed.rows, (r: any) =>
    `(${sqlStr(shopName)}, ${sqlStr(r.month)}, ${r.month_date ? `DATE '${r.month_date}'` : 'NULL'}, ` +
    `${sqlNum(r.new_buyers)}, ${sqlNum(r.new_avg_order_value)}, ${sqlNum(r.new_sales)}, ${sqlNum(r.new_sales_count)}, ${sqlNum(r.new_sales_quantity)}, ` +
    `${sqlNum(r.repeat_buyers)}, ${sqlNum(r.repeat_avg_order_value)}, ${sqlNum(r.repeat_sales)}, ${sqlNum(r.repeat_sales_count)}, ${sqlNum(r.repeat_sales_quantity)}, ` +
    `CURRENT_TIMESTAMP())`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importNewRepeatProduct(bq: ReturnType<typeof getBigQueryClient>, shopName: string, parsed: { periodStart: string; periodEnd: string; rows: any[] }) {
  await deletePeriodData(bq, 'rakuten_new_repeat_product', shopName, parsed.periodStart, parsed.periodEnd)
  const cols = [
    'shop_name', 'period_start', 'period_end',
    'product_name', 'product_url', 'product_price', 'is_discontinued',
    'new_buyers', 'repeat_buyers', 'repeat_rate', '_imported_at',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchInsert(bq, 'rakuten_new_repeat_product', cols, parsed.rows, (r: any) =>
    `(${sqlStr(shopName)}, DATE '${parsed.periodStart}', DATE '${parsed.periodEnd}', ` +
    `${sqlStr(r.product_name)}, ${sqlStr(r.product_url)}, ${sqlNum(r.product_price)}, ${sqlBool(r.is_discontinued)}, ` +
    `${sqlNum(r.new_buyers)}, ${sqlNum(r.repeat_buyers)}, ${sqlNum(r.repeat_rate)}, CURRENT_TIMESTAMP())`
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importNewRepeatGenre(bq: ReturnType<typeof getBigQueryClient>, shopName: string, parsed: { periodStart: string; periodEnd: string; rows: any[] }) {
  await deletePeriodData(bq, 'rakuten_new_repeat_genre', shopName, parsed.periodStart, parsed.periodEnd)
  const cols = [
    'shop_name', 'period_start', 'period_end',
    'genre_name', 'new_buyers', 'repeat_buyers', 'repeat_rate',
    'new_avg_purchase', 'repeat_avg_purchase', 'avg_purchase_count', 'avg_purchase_amount',
    '_imported_at',
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return batchInsert(bq, 'rakuten_new_repeat_genre', cols, parsed.rows, (r: any) =>
    `(${sqlStr(shopName)}, DATE '${parsed.periodStart}', DATE '${parsed.periodEnd}', ` +
    `${sqlStr(r.genre_name)}, ${sqlNum(r.new_buyers)}, ${sqlNum(r.repeat_buyers)}, ${sqlNum(r.repeat_rate)}, ` +
    `${sqlNum(r.new_avg_purchase)}, ${sqlNum(r.repeat_avg_purchase)}, ${sqlNum(r.avg_purchase_count)}, ${sqlNum(r.avg_purchase_amount)}, ` +
    `CURRENT_TIMESTAMP())`
  )
}

// ---------- メインインポート処理 ----------

interface ImportFileResult {
  fileName: string
  shopName: string
  dataType: string
  dataTypeLabel: string
  period: string
  rowCount: number
  inserted: number
  error?: string
  debug?: {
    totalLines: number
    line1: string
    line2: string
    line3: string
    delimiter: string
    contentLength: number
  }
}

async function runImport(): Promise<{
  success: boolean
  files: ImportFileResult[]
  totalInserted: number
  filesMoved: number
  error?: string
}> {
  if (!isBigQueryConfigured()) {
    return { success: false, files: [], totalInserted: 0, filesMoved: 0, error: 'BigQuery未設定' }
  }

  const { files: driveFiles } = await fetchRakutenDataCSVsFromDrive()

  if (driveFiles.length === 0) {
    return { success: true, files: [], totalInserted: 0, filesMoved: 0, error: '楽天データCSVファイルが見つかりません' }
  }

  console.log(`[楽天データ] ${driveFiles.length}ファイル検出`)
  const bq = getBigQueryClient()
  const results: ImportFileResult[] = []
  const filesToMove: { id: string; name: string; parentFolderId: string }[] = []

  for (const { entry, content } of driveFiles) {
    // デバッグ情報を収集
    const contentLines = content.split(/\r?\n/).filter((l: string) => l.trim())
    const debugInfo = {
      totalLines: contentLines.length,
      line1: (contentLines[0] || '').substring(0, 200),
      line2: (contentLines[1] || '').substring(0, 200),
      line3: (contentLines[2] || '').substring(0, 200),
      delimiter: (contentLines[2] || '').includes('\t') ? 'tab' : 'comma',
      contentLength: content.length,
    }
    console.log(`[楽天データ] ${entry.name}: ${debugInfo.totalLines}行, 区切り=${debugInfo.delimiter}, サイズ=${debugInfo.contentLength}`)
    console.log(`[楽天データ]   line1: ${debugInfo.line1}`)
    console.log(`[楽天データ]   line2: ${debugInfo.line2}`)
    console.log(`[楽天データ]   line3: ${debugInfo.line3}`)

    try {
      const parsed = parseRakutenCSV(content, entry.name)
      const label = getDataTypeLabel(parsed.dataType)
      console.log(`[楽天データ] ${entry.name}: ${label} ${parsed.rowCount}行パース完了`)

      if (parsed.rowCount === 0) {
        // 行数0の場合はデバッグ情報付きで記録、ファイルは移動しない
        console.warn(`[楽天データ] ${entry.name}: パース結果0行（期間: ${parsed.periodStart} ～ ${parsed.periodEnd}）`)
        results.push({
          fileName: entry.name,
          shopName: entry.shopName,
          dataType: parsed.dataType,
          dataTypeLabel: label,
          period: `${parsed.periodStart} ～ ${parsed.periodEnd}`,
          rowCount: 0,
          inserted: 0,
          debug: debugInfo,
        })
        continue
      }

      await ensureTable(bq, parsed.dataType)

      let inserted = 0
      switch (parsed.dataType) {
        case 'store_data':
          inserted = await importStoreData(bq, entry.shopName, parsed)
          break
        case 'sku_sales':
          inserted = await importSkuSales(bq, entry.shopName, parsed)
          break
        case 'new_repeat_store':
          inserted = await importNewRepeatStore(bq, entry.shopName, parsed)
          break
        case 'new_repeat_product':
          inserted = await importNewRepeatProduct(bq, entry.shopName, parsed)
          break
        case 'new_repeat_genre':
          inserted = await importNewRepeatGenre(bq, entry.shopName, parsed)
          break
      }

      results.push({
        fileName: entry.name,
        shopName: entry.shopName,
        dataType: parsed.dataType,
        dataTypeLabel: label,
        period: `${parsed.periodStart} ～ ${parsed.periodEnd}`,
        rowCount: parsed.rowCount,
        inserted,
      })
      filesToMove.push({ id: entry.id, name: entry.name, parentFolderId: entry.parentFolderId })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      console.error(`[楽天データ] ${entry.name} エラー:`, e)
      results.push({
        fileName: entry.name,
        shopName: entry.shopName,
        dataType: 'unknown',
        dataTypeLabel: 'エラー',
        period: '',
        rowCount: 0,
        inserted: 0,
        error: errorMessage,
        debug: debugInfo,
      })
    }
  }

  // 処理完了したファイルをimportedフォルダへ移動
  let filesMoved = 0
  if (filesToMove.length > 0) {
    const moveResult = await moveDriveFilesToImported(filesToMove)
    filesMoved = moveResult.moved
    console.log(`[楽天データ] ${filesMoved}ファイル移動完了`)
    if (moveResult.errors.length > 0) {
      console.warn(`[楽天データ] 移動エラー:`, moveResult.errors)
    }
  }

  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0)
  console.log(`[楽天データ] 完了: ${totalInserted}件インポート, ${filesMoved}ファイル移動`)

  return { success: true, files: results, totalInserted, filesMoved }
}

// ---------- ハンドラ ----------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  try {
    const result = await runImport()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[楽天データインポート] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message, success: false }, { status: 500 })
  }
}
