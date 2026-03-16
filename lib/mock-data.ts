/* eslint-disable @typescript-eslint/no-unused-vars */
// Mock data module for TIAST dashboard
// Returns realistic sample data when BigQuery is not configured

// ============================================================
// Helper: generate months array going back N months from today
// ============================================================
function generateMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

// ============================================================
// 1. Sales Summary
// ============================================================
export function getMockSalesSummary(_month?: string, _brand?: string) {
  return {
    current: {
      sales_amount: 32500000,
      order_count: 4250,
      gross_profit_rate: 0.52,
      avg_order_value: 7647,
    },
    previous_month: {
      sales_amount: 28900000,
      order_count: 3800,
      gross_profit_rate: 0.49,
      avg_order_value: 7605,
    },
    previous_year: {
      sales_amount: 27200000,
      order_count: 3600,
      gross_profit_rate: 0.48,
      avg_order_value: 7556,
    },
  }
}

// ============================================================
// 2. Sales Monthly Trend
// ============================================================
export function getMockSalesMonthlyTrend(months: number = 24, _brand?: string) {
  const channelGroups = ['楽天系', '公式系', 'TikTok系', 'その他']
  const baseAmounts: Record<string, number> = {
    '楽天系': 12000000,
    '公式系': 8000000,
    'TikTok系': 5000000,
    'その他': 3500000,
  }
  const monthList = generateMonths(months)
  const rand = seededRandom(42)

  const result: { month: string; channel_group: string; sales_amount: number }[] = []

  for (const month of monthList) {
    for (const group of channelGroups) {
      const base = baseAmounts[group]
      const seasonality = 1 + 0.2 * Math.sin((parseInt(month.split('-')[1]) - 3) * Math.PI / 6)
      const variation = 0.85 + rand() * 0.3
      result.push({
        month,
        channel_group: group,
        sales_amount: Math.round(base * seasonality * variation),
      })
    }
  }

  return result
}

// ============================================================
// 3. Brand Composition
// ============================================================
export function getMockBrandComposition(_month?: string) {
  const brands = [
    { brand: 'NOAHL', sales_amount: 15200000, ratio: 0.42 },
    { brand: 'BLACKQUEEN', sales_amount: 12100000, ratio: 0.33 },
    { brand: 'MYRTH', sales_amount: 9200000, ratio: 0.25 },
  ]
  return brands
}

// ============================================================
// 4. Category Ranking
// ============================================================
export function getMockCategoryRanking(_month?: string, _brand?: string) {
  return [
    { category: 'トップス', sales_amount: 8500000 },
    { category: 'パンツ', sales_amount: 6200000 },
    { category: 'ワンピース', sales_amount: 5800000 },
    { category: 'アウター', sales_amount: 4300000 },
    { category: 'ニット', sales_amount: 3200000 },
    { category: 'スカート', sales_amount: 2800000 },
    { category: 'シャツ', sales_amount: 2100000 },
    { category: 'カーディガン', sales_amount: 1500000 },
    { category: 'ジャケット', sales_amount: 1200000 },
    { category: 'バッグ', sales_amount: 900000 },
  ]
}

// ============================================================
// 5. YoY Comparison
// ============================================================
export function getMockYoyComparison(_month?: string) {
  return [
    { brand: 'NOAHL', channel: 'NOAHL楽天市場店', current_sales: 6500000, previous_year_sales: 5800000, yoy_ratio: 1.12, current_order_count: 320, previous_year_order_count: 290, current_gross_profit: 2600000, previous_year_gross_profit: 2200000 },
    { brand: 'NOAHL', channel: 'NOAHL公式サイト', current_sales: 4200000, previous_year_sales: 3500000, yoy_ratio: 1.20, current_order_count: 180, previous_year_order_count: 150, current_gross_profit: 2100000, previous_year_gross_profit: 1700000 },
    { brand: 'NOAHL', channel: 'NOAHL_TIKTOK', current_sales: 2800000, previous_year_sales: 1200000, yoy_ratio: 2.33, current_order_count: 95, previous_year_order_count: 40, current_gross_profit: 980000, previous_year_gross_profit: 420000 },
    { brand: 'BLACKQUEEN', channel: 'BLACKQUEEN楽天市場店', current_sales: 5200000, previous_year_sales: 5500000, yoy_ratio: 0.95, current_order_count: 260, previous_year_order_count: 275, current_gross_profit: 2080000, previous_year_gross_profit: 2200000 },
    { brand: 'BLACKQUEEN', channel: 'BLACKQUEEN公式サイト', current_sales: 3800000, previous_year_sales: 3200000, yoy_ratio: 1.19, current_order_count: 160, previous_year_order_count: 135, current_gross_profit: 1900000, previous_year_gross_profit: 1600000 },
    { brand: 'BLACKQUEEN', channel: 'BLACKQUEEN_ZOZO', current_sales: 2100000, previous_year_sales: 2400000, yoy_ratio: 0.88, current_order_count: 110, previous_year_order_count: 125, current_gross_profit: 630000, previous_year_gross_profit: 720000 },
    { brand: 'MYRTH', channel: 'MYRTH楽天市場店', current_sales: 3900000, previous_year_sales: 3100000, yoy_ratio: 1.26, current_order_count: 195, previous_year_order_count: 155, current_gross_profit: 1560000, previous_year_gross_profit: 1240000 },
    { brand: 'MYRTH', channel: 'MYRTH公式サイト', current_sales: 2500000, previous_year_sales: 2200000, yoy_ratio: 1.14, current_order_count: 105, previous_year_order_count: 92, current_gross_profit: 1250000, previous_year_gross_profit: 1100000 },
    { brand: 'MYRTH', channel: 'MYRTH_YAHOO', current_sales: 1500000, previous_year_sales: 1800000, yoy_ratio: 0.83, current_order_count: 75, previous_year_order_count: 90, current_gross_profit: 450000, previous_year_gross_profit: 540000 },
  ]
}

// ============================================================
// 5b. Daily Sales Trend
// ============================================================
export function getMockDailySalesTrend(_month?: string, _brand?: string) {
  const rand = seededRandom(88)
  const daysInMonth = 31
  const result = []
  for (let day = 1; day <= daysInMonth; day++) {
    result.push({
      day,
      current: Math.round(800000 + rand() * 1200000),
      prev_month: Math.round(700000 + rand() * 1100000),
      prev_year: Math.round(600000 + rand() * 1000000),
    })
  }
  return result
}

// ============================================================
// 6. Inventory Alerts
// ============================================================
export function getMockInventoryAlerts() {
  return {
    overstock: { count: 47, amount: 12500000 },
    season_ending: { count: 23, amount: 6800000 },
    season_exceeded: { count: 15, amount: 4200000 },
  }
}

// ============================================================
// 7. Season Summary
// ============================================================
export function getMockSeasonSummary() {
  return [
    { season: '春', in_season_amount: 8500000, exceeded_amount: 1200000, total_amount: 9700000 },
    { season: '夏', in_season_amount: 6200000, exceeded_amount: 2800000, total_amount: 9000000 },
    { season: '秋', in_season_amount: 7800000, exceeded_amount: 900000, total_amount: 8700000 },
    { season: '冬', in_season_amount: 9100000, exceeded_amount: 500000, total_amount: 9600000 },
  ]
}

// ============================================================
// 8. Category Summary
// ============================================================
export function getMockCategorySummary(_brand?: string) {
  const allData = [
    { category: 'トップス', brand: 'NOAHL', stock_retail_value: 4200000 },
    { category: 'トップス', brand: 'BLACKQUEEN', stock_retail_value: 3800000 },
    { category: 'トップス', brand: 'MYRTH', stock_retail_value: 2500000 },
    { category: 'パンツ', brand: 'NOAHL', stock_retail_value: 3100000 },
    { category: 'パンツ', brand: 'BLACKQUEEN', stock_retail_value: 2900000 },
    { category: 'パンツ', brand: 'MYRTH', stock_retail_value: 1800000 },
    { category: 'ワンピース', brand: 'NOAHL', stock_retail_value: 2800000 },
    { category: 'ワンピース', brand: 'BLACKQUEEN', stock_retail_value: 2200000 },
    { category: 'ワンピース', brand: 'MYRTH', stock_retail_value: 1600000 },
    { category: 'アウター', brand: 'NOAHL', stock_retail_value: 2100000 },
    { category: 'アウター', brand: 'BLACKQUEEN', stock_retail_value: 1900000 },
    { category: 'アウター', brand: 'MYRTH', stock_retail_value: 1400000 },
    { category: 'ニット', brand: 'NOAHL', stock_retail_value: 1500000 },
    { category: 'ニット', brand: 'BLACKQUEEN', stock_retail_value: 1200000 },
    { category: 'スカート', brand: 'MYRTH', stock_retail_value: 1100000 },
  ]

  if (_brand) {
    return allData.filter(d => d.brand === _brand)
  }
  return allData
}

// ============================================================
// 9. Inventory List
// ============================================================
function generateInventoryItems() {
  const brands = ['NOAHL', 'BLACKQUEEN', 'MYRTH']
  const categories = ['トップス', 'パンツ', 'ワンピース', 'アウター', 'ニット', 'スカート', 'シャツ', 'カーディガン']
  const seasons = ['春', '夏', '秋', '冬']
  const lifecycles = ['助走期', '成長期', '成熟期', '衰退期']
  const statuses = ['適正在庫', '過剰在庫', '在庫不足']
  const reorderJudgments = ['追加発注推奨', '様子見', '発注不要', '値引推奨']
  const productNames = [
    'リネンブレンドオーバーシャツ', 'ストレッチスリムパンツ', 'フレアロングワンピース',
    'ウールブレンドコート', 'カシミヤタッチVネックニット', 'プリーツミディスカート',
    'コットンバンドカラーシャツ', 'ショートカーディガン', 'デニムワイドパンツ',
    'バックリボンブラウス', 'テーパードトラウザー', 'ティアードマキシワンピース',
    'キルティングジャケット', 'モヘアクルーネックニット', 'サテンフレアスカート',
    'ストライプオーバーシャツ', 'リブニットカーディガン', 'タックワイドパンツ',
    'シアーレイヤードトップス', 'ノーカラーロングコート', 'ペプラムブラウス',
    'ハイウエストストレートパンツ', 'シャーリングワンピース', 'ボアフリースジャケット',
    'ケーブルニットベスト', 'レースタイトスカート', 'ドルマンスリーブカットソー',
    'ピンタックブラウス', 'クロップドワイドパンツ', 'ジャカードニットワンピース',
  ]

  const focusOptions = ['◎', '○', '']
  const restockOptions = ['可', '要確認', '']
  const orderLots = [30, 50, 100, 150, 200, null]

  const rand = seededRandom(123)
  const items = []

  for (let i = 0; i < 120; i++) {
    const brand = brands[Math.floor(rand() * brands.length)]
    const category = categories[Math.floor(rand() * categories.length)]
    const season = seasons[Math.floor(rand() * seasons.length)]
    const lifecycle = lifecycles[Math.floor(rand() * lifecycles.length)]
    const status = statuses[Math.floor(rand() * statuses.length)]
    const totalStock = Math.floor(rand() * 200) + 5
    const freeStock = Math.floor(totalStock * rand() * 0.7)
    const zozoStock = Math.floor(totalStock * rand() * 0.3)
    const ownStock = totalStock - freeStock - zozoStock
    const sellingPrice = (Math.floor(rand() * 15) + 3) * 1000
    const costPrice = Math.round(sellingPrice * (0.35 + rand() * 0.2))
    const dailySales = Math.round((rand() * 5 + 0.1) * 10) / 10
    const stockDays = dailySales > 0 ? Math.round(totalStock / dailySales) : 999
    const seasonRemDays = Math.floor(rand() * 120) - 20
    const isOverstock = status === '過剰在庫'
    const productName = productNames[i % productNames.length]
    const reorder = reorderJudgments[Math.floor(rand() * reorderJudgments.length)]
    const discount = isOverstock ? Math.floor(rand() * 3 + 1) * 10 : 0
    const isFocus = focusOptions[Math.floor(rand() * focusOptions.length)]
    const restock = restockOptions[Math.floor(rand() * restockOptions.length)]
    const orderLot = orderLots[Math.floor(rand() * orderLots.length)]

    items.push({
      goods_id: `GD${String(10000 + i).padStart(6, '0')}`,
      product_code: `${brand.substring(0, 2).toUpperCase()}${String(1000 + Math.floor(i / 3)).padStart(5, '0')}`,
      goods_name: `${productName} ${['ブラック', 'ホワイト', 'ベージュ', 'ネイビー', 'グレー'][Math.floor(rand() * 5)]}`,
      brand,
      category,
      season,
      total_stock: totalStock,
      free_stock: Math.max(0, freeStock),
      zozo_stock: Math.max(0, zozoStock),
      own_stock: Math.max(0, ownStock),
      selling_price: sellingPrice,
      cost_price: costPrice,
      stock_retail_value: totalStock * sellingPrice,
      daily_sales: dailySales,
      stock_days: stockDays,
      season_remaining_days: seasonRemDays,
      lifecycle_stance: lifecycle,
      inventory_status: status,
      reorder_judgment: reorder,
      recommended_discount: discount,
      lifecycle_action: lifecycle === '衰退期' ? '値引販売検討' : lifecycle === '成長期' ? '追加発注検討' : '現状維持',
      is_overstock: isOverstock,
      image_url: null as string | null,
      is_focus: isFocus,
      restock,
      order_lot: orderLot,
    })
  }

  return items
}

const _inventoryItems = generateInventoryItems()

export function getMockInventoryList(
  page: number = 1,
  perPage: number = 50,
  _brand?: string,
  _category?: string,
  _season?: string,
  _search?: string,
  _status?: string,
  _lifecycle?: string,
  _alertType?: string,
  _sortBy?: string,
  _sortOrder?: string,
) {
  let filtered = _inventoryItems
  if (_brand) filtered = filtered.filter(i => i.brand === _brand)
  if (_category) filtered = filtered.filter(i => i.category === _category)
  if (_season) filtered = filtered.filter(i => i.season === _season)
  if (_search) {
    const q = _search.toLowerCase()
    filtered = filtered.filter(i =>
      i.product_code.toLowerCase().includes(q) ||
      i.goods_name.toLowerCase().includes(q)
    )
  }
  if (_status) {
    if (_status === '適正') filtered = filtered.filter(i => i.inventory_status === '適正在庫')
    else if (_status === '過剰') filtered = filtered.filter(i => i.inventory_status === '過剰在庫')
    else if (_status === '在庫なし') filtered = filtered.filter(i => i.inventory_status === '在庫不足')
  }
  if (_lifecycle) filtered = filtered.filter(i => i.lifecycle_stance === _lifecycle)
  if (_alertType === 'overstock') filtered = filtered.filter(i => i.is_overstock)
  else if (_alertType === 'season_ending') filtered = filtered.filter(i => i.season_remaining_days > 0 && i.season_remaining_days < 30 && i.total_stock > 0)
  else if (_alertType === 'season_exceeded') filtered = filtered.filter(i => i.season_remaining_days <= 0 && i.total_stock > 0)

  // Sort
  const sortBy = _sortBy || 'stock_retail_value'
  const sortOrder = _sortOrder || 'desc'
  filtered = [...filtered].sort((a, b) => {
    const aVal = (a as Record<string, unknown>)[sortBy]
    const bVal = (b as Record<string, unknown>)[sortBy]
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    }
    return sortOrder === 'asc'
      ? String(aVal ?? '').localeCompare(String(bVal ?? ''))
      : String(bVal ?? '').localeCompare(String(aVal ?? ''))
  })

  const total = filtered.length
  const start = (page - 1) * perPage
  const data = filtered.slice(start, start + perPage)

  return {
    data,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  }
}

// ============================================================
// 10. Customer Summary
// ============================================================
export function getMockCustomerSummary(_month?: string, _brand?: string) {
  return {
    new_customers: 1850,
    repeat_customers: 2400,
    repeat_rate: 0.565,
    new_avg_order_value: 6800,
    repeat_avg_order_value: 8200,
    prev_new_customers: 1720,
    prev_repeat_customers: 2250,
    prev_repeat_rate: 0.567,
  }
}

// ============================================================
// 11. Customer Monthly Trend
// ============================================================
export function getMockCustomerMonthlyTrend(months: number = 24, _brand?: string) {
  const monthList = generateMonths(months)
  const rand = seededRandom(77)

  return monthList.map((month) => {
    const newCount = Math.floor(1200 + rand() * 1000)
    const repeatCount = Math.floor(1500 + rand() * 1200)
    const total = newCount + repeatCount
    return {
      month,
      new_count: newCount,
      repeat_count: repeatCount,
      repeat_rate: total > 0 ? repeatCount / total : 0,
    }
  })
}

// ============================================================
// 12. Channel Repeat Rate
// ============================================================
export function getMockChannelRepeatRate(_month?: string, _brand?: string) {
  return [
    { shop_name: 'NOAHL公式サイト', repeat_rate: 0.68, customer_count: 1200 },
    { shop_name: 'BLACKQUEEN公式サイト', repeat_rate: 0.62, customer_count: 980 },
    { shop_name: 'MYRTH公式サイト', repeat_rate: 0.58, customer_count: 750 },
    { shop_name: 'NOAHL楽天市場店', repeat_rate: 0.45, customer_count: 2100 },
    { shop_name: 'BLACKQUEEN楽天市場店', repeat_rate: 0.42, customer_count: 1800 },
    { shop_name: 'MYRTH楽天市場店', repeat_rate: 0.38, customer_count: 1400 },
    { shop_name: 'NOAHL_TIKTOK', repeat_rate: 0.22, customer_count: 850 },
    { shop_name: 'BLACKQUEEN_ZOZO', repeat_rate: 0.35, customer_count: 1100 },
    { shop_name: 'MYRTH_YAHOO', repeat_rate: 0.30, customer_count: 620 },
  ]
}

// ============================================================
// 13. Channel Detail
// ============================================================
export function getMockChannelDetail(_month?: string, _brand?: string) {
  return [
    {
      shop_name: 'NOAHL楽天市場店',
      new_customers: 580, new_sales: 3200000, new_avg_order_value: 5517,
      repeat_customers: 470, repeat_sales: 3300000, repeat_avg_order_value: 7021,
      repeat_rate: 0.448, new_sales_share: 0.492, repeat_sales_share: 0.508,
    },
    {
      shop_name: 'NOAHL公式サイト',
      new_customers: 280, new_sales: 1800000, new_avg_order_value: 6429,
      repeat_customers: 420, repeat_sales: 3600000, repeat_avg_order_value: 8571,
      repeat_rate: 0.600, new_sales_share: 0.333, repeat_sales_share: 0.667,
    },
    {
      shop_name: 'BLACKQUEEN楽天市場店',
      new_customers: 520, new_sales: 2900000, new_avg_order_value: 5577,
      repeat_customers: 380, repeat_sales: 2800000, repeat_avg_order_value: 7368,
      repeat_rate: 0.422, new_sales_share: 0.509, repeat_sales_share: 0.491,
    },
    {
      shop_name: 'BLACKQUEEN公式サイト',
      new_customers: 220, new_sales: 1500000, new_avg_order_value: 6818,
      repeat_customers: 360, repeat_sales: 3100000, repeat_avg_order_value: 8611,
      repeat_rate: 0.621, new_sales_share: 0.326, repeat_sales_share: 0.674,
    },
    {
      shop_name: 'MYRTH楽天市場店',
      new_customers: 380, new_sales: 2100000, new_avg_order_value: 5526,
      repeat_customers: 250, repeat_sales: 1800000, repeat_avg_order_value: 7200,
      repeat_rate: 0.397, new_sales_share: 0.538, repeat_sales_share: 0.462,
    },
    {
      shop_name: 'MYRTH公式サイト',
      new_customers: 180, new_sales: 1200000, new_avg_order_value: 6667,
      repeat_customers: 280, repeat_sales: 2400000, repeat_avg_order_value: 8571,
      repeat_rate: 0.609, new_sales_share: 0.333, repeat_sales_share: 0.667,
    },
    {
      shop_name: 'NOAHL_TIKTOK',
      new_customers: 450, new_sales: 1800000, new_avg_order_value: 4000,
      repeat_customers: 120, repeat_sales: 960000, repeat_avg_order_value: 8000,
      repeat_rate: 0.211, new_sales_share: 0.652, repeat_sales_share: 0.348,
    },
    {
      shop_name: 'BLACKQUEEN_ZOZO',
      new_customers: 320, new_sales: 1600000, new_avg_order_value: 5000,
      repeat_customers: 180, repeat_sales: 1300000, repeat_avg_order_value: 7222,
      repeat_rate: 0.360, new_sales_share: 0.552, repeat_sales_share: 0.448,
    },
  ]
}

// ============================================================
// 14. Products List
// ============================================================
function generateProductItems() {
  const brands = ['NOAHL', 'BLACKQUEEN', 'MYRTH']
  const categories = ['トップス', 'パンツ', 'ワンピース', 'アウター', 'ニット', 'スカート', 'シャツ', 'カーディガン']
  const seasons = ['春', '夏', '秋', '冬']
  const priceTiers = ['〜2,999円', '3,000〜4,999円', '5,000〜6,999円', '7,000〜9,999円', '10,000円〜']
  const productNames = [
    'リネンブレンドオーバーシャツ', 'ストレッチスリムパンツ', 'フレアロングワンピース',
    'ウールブレンドコート', 'カシミヤタッチVネックニット', 'プリーツミディスカート',
    'コットンバンドカラーシャツ', 'ショートカーディガン', 'デニムワイドパンツ',
    'バックリボンブラウス', 'テーパードトラウザー', 'ティアードマキシワンピース',
    'キルティングジャケット', 'モヘアクルーネックニット', 'サテンフレアスカート',
    'ストライプオーバーシャツ', 'リブニットカーディガン', 'タックワイドパンツ',
    'シアーレイヤードトップス', 'ノーカラーロングコート', 'ペプラムブラウス',
    'ハイウエストストレートパンツ', 'シャーリングワンピース', 'ボアフリースジャケット',
    'ケーブルニットベスト', 'レースタイトスカート', 'ドルマンスリーブカットソー',
    'ピンタックブラウス', 'クロップドワイドパンツ', 'ジャカードニットワンピース',
    'オーバーサイズスウェット', 'テーラードジャケット', 'ギャザーロングスカート',
    'リネンワイドパンツ', 'カットソーVネックトップス', 'ダブルブレストコート',
    'モールニットプルオーバー', 'ウエストリボンワンピース', 'ツイードジャケット',
    'フリンジニットカーディガン',
  ]

  const rand = seededRandom(456)
  const items = []

  for (let i = 0; i < 80; i++) {
    const brand = brands[i % brands.length]
    const category = categories[Math.floor(rand() * categories.length)]
    const season = seasons[Math.floor(rand() * seasons.length)]
    const sellingPrice = (Math.floor(rand() * 15) + 3) * 1000
    const costPrice = Math.round(sellingPrice * (0.35 + rand() * 0.2))
    const totalQuantity = Math.floor(rand() * 500) + 20
    const salesAmount = totalQuantity * sellingPrice
    const grossProfitRate = (sellingPrice - costPrice) / sellingPrice

    let priceTier: string
    if (sellingPrice < 3000) priceTier = priceTiers[0]
    else if (sellingPrice < 5000) priceTier = priceTiers[1]
    else if (sellingPrice < 7000) priceTier = priceTiers[2]
    else if (sellingPrice < 10000) priceTier = priceTiers[3]
    else priceTier = priceTiers[4]

    items.push({
      product_code: `${brand.substring(0, 2).toUpperCase()}${String(2000 + i).padStart(5, '0')}`,
      product_name: productNames[i % productNames.length],
      brand,
      category,
      season,
      selling_price: sellingPrice,
      cost_price: costPrice,
      total_quantity: totalQuantity,
      sales_amount: salesAmount,
      gross_profit_rate: Math.round(grossProfitRate * 1000) / 1000,
      price_tier: priceTier,
      image_url: null as string | null,
      sales_start_date: '2024-09-01',
      sales_end_date: null as string | null,
    })
  }

  return items
}

const _productItems = generateProductItems()

export function getMockProductsList(
  page: number = 1,
  perPage: number = 50,
  _brand?: string,
  _category?: string,
  _season?: string,
  _search?: string,
) {
  let filtered = _productItems
  if (_brand) filtered = filtered.filter(p => p.brand === _brand)
  if (_category) filtered = filtered.filter(p => p.category === _category)
  if (_season) filtered = filtered.filter(p => p.season === _season)
  if (_search) {
    const s = _search.toLowerCase()
    filtered = filtered.filter(p =>
      p.product_name.toLowerCase().includes(s) || p.product_code.toLowerCase().includes(s)
    )
  }

  const total = filtered.length
  const start = (page - 1) * perPage
  const data = filtered.slice(start, start + perPage)

  return {
    data,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  }
}

// ============================================================
// 15. Product Detail
// ============================================================
export function getMockProductDetail(productCode: string) {
  const product = _productItems.find(p => p.product_code === productCode)

  if (!product) {
    // Return a default product for any code
    return {
      product_code: productCode,
      product_name: 'リネンブレンドオーバーシャツ',
      brand: 'NOAHL',
      category: 'トップス',
      season: '春',
      price_tier: '5,000〜6,999円',
      selling_price: 6990,
      cost_price: 2800,
      sku_count: 6,
      image_url: null,
      sales_start_date: '2024-09-01',
      sales_end_date: null,
      total_quantity: 320,
      order_count: 280,
      sales_amount: 2236800,
      gross_profit: 1341600,
      gross_profit_rate: 0.60,
      inventory: generateSkuInventory(productCode),
      md_analysis: generateSkuMdAnalysis(productCode),
    }
  }

  const grossProfit = Math.round(product.sales_amount * product.gross_profit_rate)

  return {
    product_code: product.product_code,
    product_name: product.product_name,
    brand: product.brand,
    category: product.category,
    season: product.season,
    price_tier: product.price_tier,
    selling_price: product.selling_price,
    cost_price: product.cost_price,
    sku_count: 4,
    image_url: product.image_url,
    sales_start_date: product.sales_start_date,
    sales_end_date: product.sales_end_date,
    total_quantity: product.total_quantity,
    order_count: Math.floor(product.total_quantity * 0.85),
    sales_amount: product.sales_amount,
    gross_profit: grossProfit,
    gross_profit_rate: product.gross_profit_rate,
    inventory: generateSkuInventory(product.product_code),
    md_analysis: generateSkuMdAnalysis(product.product_code),
  }
}

function generateSkuInventory(productCode: string) {
  const colors = ['ブラック', 'ホワイト', 'ベージュ', 'ネイビー']
  const rand = seededRandom(productCode.charCodeAt(2) * 100 + productCode.charCodeAt(3))

  return colors.map((color, idx) => {
    const totalStock = Math.floor(rand() * 60) + 5
    const freeStock = Math.floor(totalStock * 0.5)
    const zozoStock = Math.floor(totalStock * 0.2)
    const dailySales = Math.round((rand() * 3 + 0.2) * 10) / 10
    return {
      goods_id: `${productCode}-${String(idx + 1).padStart(3, '0')}`,
      goods_name: `${color}`,
      total_stock: totalStock,
      free_stock: freeStock,
      zozo_stock: zozoStock,
      own_stock: totalStock - freeStock - zozoStock,
      sales_1day: Math.round(rand() * 3 * 10) / 10,
      sales_7days: Math.round(rand() * 15 * 10) / 10,
      sales_30days: Math.round(rand() * 50 * 10) / 10,
      daily_sales: dailySales,
      stock_days: dailySales > 0 ? Math.round(totalStock / dailySales) : 999,
      season_remaining_days: Math.floor(rand() * 90) + 10,
      is_overstock: totalStock > 40,
      is_stockout: totalStock < 5,
      reorder_judgment: totalStock < 10 ? '追加発注推奨' : '様子見',
      recommended_discount: totalStock > 40 ? '20%' : null,
      selling_price: 6990,
      cost_price: 2800,
    }
  })
}

function generateSkuMdAnalysis(productCode: string) {
  const colors = ['ブラック', 'ホワイト', 'ベージュ', 'ネイビー']
  const lifecycles = ['助走期', '成長期', '成熟期', '衰退期']
  const rand = seededRandom(productCode.charCodeAt(2) * 200 + productCode.charCodeAt(4))

  return colors.map((color, idx) => ({
    goods_id: `${productCode}-${String(idx + 1).padStart(3, '0')}`,
    goods_name: `${color}`,
    lifecycle_stance: lifecycles[Math.floor(rand() * lifecycles.length)],
    turnover_rate_annual: Math.round((rand() * 8 + 1) * 10) / 10,
    turnover_days: Math.floor(rand() * 120) + 15,
    last_io_date: '2025-02-15',
    days_since_last_io: Math.floor(rand() * 30) + 1,
    stagnation_alert: rand() > 0.7 ? '要注意' : null,
    lifecycle_action: idx < 2 ? '現状維持' : '値引販売検討',
    inventory_status: rand() > 0.5 ? '適正在庫' : '過剰在庫',
  }))
}
