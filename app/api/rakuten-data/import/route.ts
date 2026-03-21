import { NextRequest, NextResponse } from 'next/server'
import { getBigQueryClient, isBigQueryConfigured } from '@/lib/bigquery'
import {
  parseRakutenCSV,
  getDataTypeLabel,
  type StoreDataRow,
  type SkuSalesRow,
} from '@/lib/rakuten-csv-parser'

export const maxDuration = 120

const PROJECT = 'tiast-data-platform'
const DATASET = 'analytics_mart'

function sqlStr(v: string | null): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
}

function sqlNum(v: number | null): string {
  if (v === null || v === undefined) return 'NULL'
  return String(v)
}

// ---------- テーブル作成 ----------

async function ensureStoreDataTable(bq: ReturnType<typeof getBigQueryClient>) {
  const table = bq.dataset(DATASET).table('rakuten_store_data')
  const [exists] = await table.exists()
  if (exists) return
  await table.create({
    schema: {
      fields: [
        { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'date', type: 'DATE', mode: 'REQUIRED' },
        { name: 'day_of_week', type: 'STRING' },
        { name: 'device', type: 'STRING' },
        { name: 'sales_amount', type: 'INT64' },
        { name: 'sales_count', type: 'INT64' },
        { name: 'access_count', type: 'INT64' },
        { name: 'conversion_rate', type: 'FLOAT64' },
        { name: 'avg_order_value', type: 'INT64' },
        { name: 'unique_users', type: 'INT64' },
        { name: 'buyers_member', type: 'INT64' },
        { name: 'buyers_non_member', type: 'INT64' },
        { name: 'new_buyers', type: 'INT64' },
        { name: 'repeat_buyers', type: 'INT64' },
        { name: 'tax_amount', type: 'INT64' },
        { name: 'shipping_fee', type: 'INT64' },
        { name: 'coupon_discount_store', type: 'INT64' },
        { name: 'coupon_discount_rakuten', type: 'INT64' },
        { name: 'free_shipping_coupon', type: 'INT64' },
        { name: 'wrapping_fee', type: 'INT64' },
        { name: 'payment_fee', type: 'INT64' },
        { name: 'deal_sales_amount', type: 'INT64' },
        { name: 'deal_sales_count', type: 'INT64' },
        { name: 'deal_access_count', type: 'INT64' },
        { name: 'deal_conversion_rate', type: 'FLOAT64' },
        { name: 'deal_avg_order_value', type: 'INT64' },
        { name: 'deal_unique_users', type: 'INT64' },
        { name: 'deal_buyers_member', type: 'INT64' },
        { name: 'deal_buyers_non_member', type: 'INT64' },
        { name: 'deal_new_buyers', type: 'INT64' },
        { name: 'deal_repeat_buyers', type: 'INT64' },
        { name: 'points_sales_amount', type: 'INT64' },
        { name: 'points_sales_count', type: 'INT64' },
        { name: 'points_cost', type: 'INT64' },
        { name: '_imported_at', type: 'TIMESTAMP' },
      ],
    },
  })
}

async function ensureSkuSalesTable(bq: ReturnType<typeof getBigQueryClient>) {
  const table = bq.dataset(DATASET).table('rakuten_sku_sales')
  const [exists] = await table.exists()
  if (exists) return
  await table.create({
    schema: {
      fields: [
        { name: 'shop_name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'period_start', type: 'DATE', mode: 'REQUIRED' },
        { name: 'period_end', type: 'DATE', mode: 'REQUIRED' },
        { name: 'catalog_id', type: 'STRING' },
        { name: 'product_code', type: 'STRING' },
        { name: 'product_number', type: 'STRING' },
        { name: 'product_name', type: 'STRING' },
        { name: 'sku_code', type: 'STRING' },
        { name: 'sku_system_code', type: 'STRING' },
        { name: 'sku_option_1', type: 'STRING' },
        { name: 'sku_option_2', type: 'STRING' },
        { name: 'sku_option_3', type: 'STRING' },
        { name: 'sku_option_4', type: 'STRING' },
        { name: 'sku_option_5', type: 'STRING' },
        { name: 'sku_option_6', type: 'STRING' },
        { name: 'sales_amount', type: 'INT64' },
        { name: 'sales_count', type: 'INT64' },
        { name: 'sales_quantity', type: 'INT64' },
        { name: '_imported_at', type: 'TIMESTAMP' },
      ],
    },
  })
}

// ---------- 重複チェック ----------

async function getExistingStoreDataKeys(
  bq: ReturnType<typeof getBigQueryClient>,
  shopName: string,
  periodStart: string,
  periodEnd: string,
): Promise<Set<string>> {
  try {
    const [rows] = await bq.query({
      query: `
        SELECT DISTINCT CONCAT(CAST(date AS STRING), '|', IFNULL(device,''))
        AS dk FROM \`${PROJECT}.${DATASET}.rakuten_store_data\`
        WHERE shop_name = @shopName
          AND date BETWEEN @periodStart AND @periodEnd
      `,
      params: { shopName, periodStart, periodEnd },
      location: 'asia-northeast1',
    })
    return new Set((rows as { dk: string }[]).map(r => r.dk))
  } catch {
    return new Set()
  }
}

async function deleteExistingSkuSales(
  bq: ReturnType<typeof getBigQueryClient>,
  shopName: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  try {
    await bq.query({
      query: `
        DELETE FROM \`${PROJECT}.${DATASET}.rakuten_sku_sales\`
        WHERE shop_name = @shopName
          AND period_start = @periodStart
          AND period_end = @periodEnd
      `,
      params: { shopName, periodStart, periodEnd },
      location: 'asia-northeast1',
    })
    return 0
  } catch {
    return 0
  }
}

// ---------- INSERT ----------

async function insertStoreData(
  bq: ReturnType<typeof getBigQueryClient>,
  shopName: string,
  rows: StoreDataRow[],
  existingKeys: Set<string>,
): Promise<number> {
  const newRows = rows.filter(r => !existingKeys.has(`${r.date}|${r.device}`))
  if (newRows.length === 0) return 0

  const batchSize = 200
  let inserted = 0

  for (let i = 0; i < newRows.length; i += batchSize) {
    const batch = newRows.slice(i, i + batchSize)
    const values = batch.map(r =>
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
    ).join(',\n')

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.${DATASET}.rakuten_store_data\`
        (shop_name, date, day_of_week, device,
         sales_amount, sales_count, access_count, conversion_rate,
         avg_order_value, unique_users, buyers_member, buyers_non_member,
         new_buyers, repeat_buyers, tax_amount, shipping_fee,
         coupon_discount_store, coupon_discount_rakuten, free_shipping_coupon,
         wrapping_fee, payment_fee,
         deal_sales_amount, deal_sales_count, deal_access_count,
         deal_conversion_rate, deal_avg_order_value, deal_unique_users,
         deal_buyers_member, deal_buyers_non_member, deal_new_buyers, deal_repeat_buyers,
         points_sales_amount, points_sales_count, points_cost, _imported_at)
        VALUES ${values}
      `,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }

  return inserted
}

async function insertSkuSales(
  bq: ReturnType<typeof getBigQueryClient>,
  shopName: string,
  periodStart: string,
  periodEnd: string,
  rows: SkuSalesRow[],
): Promise<number> {
  if (rows.length === 0) return 0

  const batchSize = 200
  let inserted = 0

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch.map(r =>
      `(${sqlStr(shopName)}, DATE '${periodStart}', DATE '${periodEnd}', ` +
      `${sqlStr(r.catalog_id)}, ${sqlStr(r.product_code)}, ${sqlStr(r.product_number)}, ${sqlStr(r.product_name)}, ` +
      `${sqlStr(r.sku_code)}, ${sqlStr(r.sku_system_code)}, ` +
      `${sqlStr(r.sku_option_1)}, ${sqlStr(r.sku_option_2)}, ${sqlStr(r.sku_option_3)}, ` +
      `${sqlStr(r.sku_option_4)}, ${sqlStr(r.sku_option_5)}, ${sqlStr(r.sku_option_6)}, ` +
      `${sqlNum(r.sales_amount)}, ${sqlNum(r.sales_count)}, ${sqlNum(r.sales_quantity)}, CURRENT_TIMESTAMP())`
    ).join(',\n')

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.${DATASET}.rakuten_sku_sales\`
        (shop_name, period_start, period_end,
         catalog_id, product_code, product_number, product_name,
         sku_code, sku_system_code,
         sku_option_1, sku_option_2, sku_option_3,
         sku_option_4, sku_option_5, sku_option_6,
         sales_amount, sales_count, sales_quantity, _imported_at)
        VALUES ${values}
      `,
      location: 'asia-northeast1',
    })
    inserted += batch.length
  }

  return inserted
}

// ---------- メインハンドラ ----------

export async function POST(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json({ error: 'BigQuery未設定' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const shopName = formData.get('shop_name') as string | null

    if (!file) {
      return NextResponse.json({ error: 'CSVファイルが必要です' }, { status: 400 })
    }
    if (!shopName || !['NOAHL', 'BLACKQUEEN', 'MYRTH'].includes(shopName)) {
      return NextResponse.json({ error: 'shop_nameが必要です（NOAHL / BLACKQUEEN / MYRTH）' }, { status: 400 })
    }

    // ファイル読み込み (Shift_JIS or UTF-8)
    const arrayBuffer = await file.arrayBuffer()
    let text: string
    try {
      const decoder = new TextDecoder('shift_jis')
      text = decoder.decode(arrayBuffer)
    } catch {
      text = new TextDecoder('utf-8').decode(arrayBuffer)
    }

    // パース
    const parsed = parseRakutenCSV(text)
    const dataType = parsed.dataType
    const label = getDataTypeLabel(dataType)

    console.log(`[楽天データ] ${label}: ${parsed.rows.length}行パース完了 (${shopName})`)

    const bq = getBigQueryClient()
    let inserted = 0
    let skipped = 0

    if (dataType === 'store_data') {
      await ensureStoreDataTable(bq)
      const existingKeys = await getExistingStoreDataKeys(bq, shopName, parsed.periodStart, parsed.periodEnd)
      skipped = (parsed.rows as StoreDataRow[]).filter(r =>
        existingKeys.has(`${r.date}|${r.device}`)
      ).length
      inserted = await insertStoreData(bq, shopName, parsed.rows as StoreDataRow[], existingKeys)
    } else if (dataType === 'sku_sales') {
      await ensureSkuSalesTable(bq)
      const deleted = await deleteExistingSkuSales(bq, shopName, parsed.periodStart, parsed.periodEnd)
      if (deleted > 0) {
        console.log(`[楽天データ] 既存SKUデータ${deleted}件削除（同期間上書き）`)
      }
      inserted = await insertSkuSales(bq, shopName, parsed.periodStart, parsed.periodEnd, parsed.rows as SkuSalesRow[])
    }

    console.log(`[楽天データ] ${label}: ${inserted}件インポート完了, ${skipped}件スキップ`)

    return NextResponse.json({
      success: true,
      data_type: dataType,
      data_type_label: label,
      shop_name: shopName,
      period: `${parsed.periodStart} ～ ${parsed.periodEnd}`,
      total_rows: parsed.rows.length,
      inserted,
      skipped,
    })
  } catch (error) {
    console.error('[楽天データインポート] エラー:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
