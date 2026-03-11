// In-memory store for product master data
// In production, this would be backed by BigQuery or a database
import { ProductMaster } from '@/types/master'

const LIFECYCLE_STANCES = ['助走期', '最盛期', '安定期', '衰退期'] as const

function generateMockMasterData(): ProductMaster[] {
  const items: ProductMaster[] = []
  const brands = ['NOAHL', 'BLACKQUEEN', 'MYRTH']
  const brandPrefixes: Record<string, string> = { NOAHL: 'nl', BLACKQUEEN: 'bq', MYRTH: 'mr' }
  const categories = ['トップス', 'パンツ', 'ワンピース', 'アウター', 'ニット', 'スカート']
  const seasons = ['春', '夏', '秋', '冬']
  const collaborators = ['cocoさん', 'minaさん', 'rikaさん', null, null]
  const catCodes: Record<string, string> = {
    'トップス': 'tp', 'パンツ': 'pt', 'ワンピース': 'wp',
    'アウター': 'ot', 'ニット': 'nt', 'スカート': 'sk',
  }
  const productNames: Record<string, string[]> = {
    'トップス': ['リネンブレンドオーバーシャツ', 'バックリボンブラウス', 'シアーレイヤードトップス', 'ペプラムブラウス'],
    'パンツ': ['ストレッチスリムパンツ', 'デニムワイドパンツ', 'タックワイドパンツ', 'クロップドワイドパンツ'],
    'ワンピース': ['フレアロングワンピース', 'ティアードマキシワンピース', 'シャーリングワンピース', 'ジャカードニットワンピース'],
    'アウター': ['ウールブレンドコート', 'キルティングジャケット', 'ノーカラーロングコート', 'ボアフリースジャケット'],
    'ニット': ['カシミヤタッチVネックニット', 'モヘアクルーネックニット', 'ケーブルニットベスト', 'リブニットカーディガン'],
    'スカート': ['プリーツミディスカート', 'サテンフレアスカート', 'レースタイトスカート', 'ギャザーロングスカート'],
  }
  const operationNotes: Record<string, string> = {
    '助走期': '新作投入。プロパー販売の反応を見る。初動データ収集。',
    '最盛期': '最大の発注量。欠品による機会損失を排除。広告投下強化。',
    '安定期': 'ブレーキ開始。実績の8割程度に絞る。在庫圧縮を意識。',
    '衰退期': '発注停止。値引販売で在庫消化。次シーズンへの切替準備。',
  }

  let seed = 789
  const rand = () => {
    seed = (seed * 16807 + 0) % 2147483647
    return seed / 2147483647
  }

  for (let i = 0; i < 60; i++) {
    const brand = brands[i % brands.length]
    const category = categories[Math.floor(rand() * categories.length)]
    const season = seasons[Math.floor(rand() * seasons.length)]
    const stance = LIFECYCLE_STANCES[Math.floor(rand() * LIFECYCLE_STANCES.length)]
    const collab = collaborators[Math.floor(rand() * collaborators.length)]
    const names = productNames[category] || productNames['トップス']
    const name = names[Math.floor(rand() * names.length)]
    const prefix = brandPrefixes[brand]
    const catCode = catCodes[category] || 'xx'
    const monthCode = String(Math.floor(rand() * 12) + 1).padStart(2, '0')
    const yearCode = '25'
    const seqNum = String(i + 1).padStart(3, '0')
    const productCode = `${prefix}${catCode}${seqNum}-${yearCode}${monthCode}`
    const sellingPrice = (Math.floor(rand() * 12) + 3) * 1000
    const costPrice = Math.round(sellingPrice * (0.3 + rand() * 0.2))
    const commissionRate = [0.03, 0.05, 0.08, 0.10, 0.15][Math.floor(rand() * 5)]
    const lot = [50, 60, 70, 80, 100, 150][Math.floor(rand() * 6)]

    const now = new Date()
    const startOffset = Math.floor(rand() * 180)
    const startDate = new Date(now.getTime() - startOffset * 86400000)
    const hasEndDate = stance === '衰退期' && rand() > 0.5
    const endDate = hasEndDate ? new Date(now.getTime() + Math.floor(rand() * 60) * 86400000) : null

    items.push({
      product_code: productCode,
      product_name: name,
      brand,
      category,
      season,
      collaborator: collab,
      commission_rate: commissionRate,
      selling_price: sellingPrice,
      cost_price: costPrice,
      order_lot: lot,
      sales_start_date: startDate.toISOString().split('T')[0],
      sales_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
      lifecycle_stance: stance,
      operation_note: operationNotes[stance],
      image_url: null,
      sku_images: [],
      created_at: new Date(now.getTime() - startOffset * 86400000).toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return items
}

// Singleton store
let masterData: ProductMaster[] | null = null

function getStore(): ProductMaster[] {
  if (!masterData) {
    masterData = generateMockMasterData()
  }
  return masterData
}

export function getMasterList(params: {
  page?: number
  per_page?: number
  brand?: string
  category?: string
  season?: string
  stance?: string
  search?: string
}) {
  const { page = 1, per_page = 30, brand, category, season, stance, search } = params
  let items = getStore()

  if (brand) items = items.filter(i => i.brand === brand)
  if (category) items = items.filter(i => i.category === category)
  if (season) items = items.filter(i => i.season === season)
  if (stance) items = items.filter(i => i.lifecycle_stance === stance)
  if (search) {
    const s = search.toLowerCase()
    items = items.filter(i =>
      i.product_code.toLowerCase().includes(s) ||
      i.product_name.toLowerCase().includes(s) ||
      (i.collaborator && i.collaborator.toLowerCase().includes(s))
    )
  }

  const total = items.length
  const start = (page - 1) * per_page
  const data = items.slice(start, start + per_page)

  return {
    data,
    total,
    page,
    per_page,
    total_pages: Math.ceil(total / per_page),
  }
}

export function getMasterItem(productCode: string): ProductMaster | undefined {
  return getStore().find(i => i.product_code === productCode)
}

export function upsertMasterItem(item: ProductMaster): ProductMaster {
  const store = getStore()
  const idx = store.findIndex(i => i.product_code === item.product_code)
  const now = new Date().toISOString()
  const updated = { ...item, updated_at: now }
  if (idx >= 0) {
    store[idx] = updated
  } else {
    updated.created_at = now
    store.unshift(updated)
  }
  return updated
}

export function deleteMasterItem(productCode: string): boolean {
  const store = getStore()
  const idx = store.findIndex(i => i.product_code === productCode)
  if (idx >= 0) {
    store.splice(idx, 1)
    return true
  }
  return false
}

export function importMasterItems(items: Partial<ProductMaster>[]): number {
  let count = 0
  const now = new Date().toISOString()
  for (const item of items) {
    if (!item.product_code) continue
    const full: ProductMaster = {
      product_code: item.product_code,
      product_name: item.product_name || '',
      brand: item.brand || '',
      category: item.category || '',
      season: item.season || '',
      collaborator: item.collaborator || null,
      commission_rate: item.commission_rate || 0,
      selling_price: item.selling_price || 0,
      cost_price: item.cost_price || 0,
      order_lot: item.order_lot || null,
      sales_start_date: item.sales_start_date || null,
      sales_end_date: item.sales_end_date || null,
      lifecycle_stance: item.lifecycle_stance || '助走期',
      operation_note: item.operation_note || '',
      image_url: item.image_url || null,
      sku_images: item.sku_images || [],
      created_at: now,
      updated_at: now,
    }
    upsertMasterItem(full)
    count++
  }
  return count
}
