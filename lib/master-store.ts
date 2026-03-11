// In-memory store for product master data
// In production, this would be backed by BigQuery or a database
import { ProductMaster } from '@/types/master'

// Real product data from TIAST spreadsheets
// Brand detection: nl* = NOAHL, bl* = BLACKQUEEN, bq* = BLACKQUEEN
function detectBrand(code: string): string {
  if (code.startsWith('nl') || code.startsWith('nj') || code.startsWith('nx')) return 'NOAHL'
  if (code.startsWith('bl') || code.startsWith('bq')) return 'BLACKQUEEN'
  return 'NOAHL'
}

function detectCategory(code: string): string {
  const c = code.toLowerCase()
  if (c.includes('tp') || c.includes('tp0')) return 'トップス'
  if (c.includes('pt') || c.includes('mpt')) return 'パンツ'
  if (c.includes('wp') || c.includes('mwp')) return 'ワンピース'
  if (c.includes('ot') || c.includes('mot')) return 'アウター'
  if (c.includes('sk') || c.includes('msk')) return 'スカート'
  if (c.includes('sr')) return 'サロペット'
  if (c.includes('set')) return 'セットアップ'
  if (c.includes('oi')) return 'オールインワン'
  if (c.includes('c0') || c.match(/nlc\d/)) return 'コラボ'
  if (c.includes('ki') || c.includes('kr')) return 'ニット'
  if (c.includes('lo')) return 'その他'
  return 'トップス'
}

// Real lot data from 代表品番別発注ロット sheet
const LOT_MAP: Record<string, number> = {
  'nlmtp001-2510': 140, 'nlmpt002-2510': 160, 'nlmwp003-2510': 80,
  'nlmtp004-2510': 60, 'nlmot007-2510': 0, 'nlmtp005-2510': 0,
  'nltp500-2602': 60, 'nltp512-2602': 60, 'nltp513-2602': 50,
  'nlmpt013-2602': 150, 'nlmtp011-2602': 150, 'nltp516-2602': 60,
  'nlmtp014-26021': 150, 'nltp485-2602': 150, 'nlmtp009-2602': 50,
  'nltp486-2602': 150, 'nlmsk010-2602': 80,
  'nltp472-2601': 150, 'nltp464-2601': 80, 'nltp466-2601': 100,
  'nltp470-2601': 80, 'nltp474-2601': 50, 'nltp483-2601': 60,
  'nltp488-2601': 100, 'nlwp462-2601': 60,
  'nltp453-2511': 50, 'nlpt454-2511': 50, 'nltp446-2511': 50,
  'nltp452-2511': 50, 'nltp457-2511': 80, 'nltp459-2511': 60,
  'nlot403-2511': 80, 'nlpt421-2511': 80,
  'nltp393-2510': 50, 'nltp412-2510': 60, 'nltp433-2510': 50,
  'nltp448-2510': 50, 'nlwp455-2510': 50,
  'bltp117-2510': 50, 'blot113-2510': 60, 'blot119-2510': 60,
  'blset116-2510': 50, 'blset110-2510': 50, 'bltp115-2510': 60,
  'blwp120-2511': 100, 'blpt118-2510': 100,
  'blset122-2511': 50, 'blwp121-2510': 50,
  'bltp123-2511': 50, 'blot125-2511': 60, 'bltp126-2511': 60,
  'blot124-2511': 50, 'blset131-2512': 50,
  'nltp418-2509': 160, 'nltp422-2509': 150, 'nltp431-2509': 150,
  'nltp434-2509': 100, 'nltp436-2509': 100, 'nltp391-2509': 170,
  'nltp401-2509': 140, 'nltp404-2508': 150,
  'nltp363-2507': 150, 'nltp349-2507': 150, 'nltp342-2507': 160,
  'nltp334-2507': 120, 'nltp353-2507': 140,
  'nltp261-2503': 200, 'nltp272-2503': 150, 'nltp274-2503': 160,
  'nltp281-2504': 150, 'nltp299-2505': 120,
  'nltp122-2404': 180, 'nltp149-2404': 120, 'nltp0137-2404': 130,
  'nltp0152-2405': 150, 'nltp130-2405': 150, 'nltp134-2405': 150,
  'bltp054-2410': 100, 'blwp055-2410': 100, 'bltp058-2411': 100,
  'blot056-2411': 90, 'bltp060-2412': 50,
  'nlpt329-2507': 100, 'nltp321-2507': 100, 'nltp332-2506': 100,
  'blwp094-2507': 100, 'bltp100-2508': 100,
}

// Real products from master spreadsheet + additional recent products
interface RealProduct {
  code: string
  collaborator: string | null
  commission: number
  season: string
  category: string
  stance: string
  note: string
  month: string
}

const REAL_PRODUCTS: RealProduct[] = [
  // From master sheet (gid=710215616)
  { code: 'nlmtp001-2510', collaborator: 'cocoさん', commission: 0.10, season: '冬', category: 'トップス', stance: '助走期', note: '新作投入。プロパー販売の反応を見る。', month: '01' },
  { code: 'nlmpt002-2510', collaborator: 'cocoさん', commission: 0.10, season: '冬', category: 'パンツ', stance: '最盛期', note: '最大の発注量。欠品による機会損失を排除。', month: '02' },
  { code: 'nlmwp003-2510', collaborator: 'cocoさん', commission: 0.10, season: '春', category: 'スカート', stance: '安定期', note: 'ブレーキ開始。実績の8割程度に絞る。', month: '03' },
  { code: 'nlmtp004-2510', collaborator: 'cocoさん', commission: 0.10, season: '春', category: 'ワンピース', stance: '衰退期', note: '発注停止。GW後の夏物切り替えを意識。', month: '04' },
  { code: 'nlmtp005-2510', collaborator: 'cocoさん', commission: 0.05, season: '夏', category: 'アウター', stance: '助走期', note: '初夏物投入。Tシャツ・軽衣料の反応確認。', month: '05' },
  { code: 'nlmot007-2510', collaborator: 'cocoさん', commission: 0.10, season: '夏', category: 'サロペット', stance: '最盛期', note: 'GW・初夏需要に向け最大発注。', month: '06' },
  { code: 'nlwp173-2408', collaborator: 'cocoさん', commission: 0.10, season: '夏', category: 'セットアップ', stance: '安定期', note: '梅雨時期の需要を見つつ、在庫過多を警戒。', month: '07' },
  { code: 'nlwp255-2504', collaborator: 'cocoさん', commission: 0.10, season: '夏', category: 'ワンピース', stance: '衰退期', note: 'セール準備。夏物の最終補充のみ。', month: '08' },
  { code: 'nlwp271-2502', collaborator: 'cocoさん', commission: 0.10, season: '秋', category: 'オールインワン', stance: '助走期', note: '晩夏・初秋物投入。まだ暑い時期の秋色提案。', month: '09' },
  { code: 'nlsr052-2310', collaborator: 'mayoさん', commission: 0.05, season: '秋', category: 'サロペット', stance: '最盛期', note: '秋のメイン需要。羽織り・軽アウターを確保。', month: '10' },
  { code: 'nlsr175-2409', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'サロペット', stance: '安定期', note: '重衣料（コート等）への繋ぎ。在庫を抑制。', month: '11' },
  { code: 'nlpt289-2506', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'パンツ', stance: '衰退期', note: '秋物終了。冬物への完全シフト準備。', month: '12' },
  { code: 'nltp288-2506', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'トップス', stance: '助走期', note: '冬物（ニット・コート）投入開始。', month: '' },
  { code: 'njpt360-2506', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'パンツ', stance: '最盛期', note: '年間最大の売上山場。防寒着を最大確保。', month: '' },
  { code: 'nltp453-2511', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'トップス', stance: '安定期', note: 'クリスマス・年末需要分。追いかけすぎない。', month: '' },
  { code: 'nlpt454-2511', collaborator: 'mayoさん', commission: 0.05, season: '冬', category: 'パンツ', stance: '衰退期', note: '発注停止。冬セールと春物立ち上げに集中。', month: '' },
  { code: 'nlwp187-2409', collaborator: 'まんちゃん', commission: 0.15, season: '秋', category: 'ワンピース', stance: '', note: '', month: '' },
  { code: 'nlpt329-2507', collaborator: 'まんちゃん', commission: 0.10, season: '夏', category: 'パンツ', stance: '', note: '', month: '' },
  { code: 'nltp393-2510', collaborator: 'まんちゃん', commission: 0.10, season: '秋', category: 'トップス', stance: '', note: '', month: '' },
  { code: 'nltp172-2408', collaborator: 'accoさん', commission: 0.05, season: '夏', category: 'トップス', stance: '', note: '', month: '' },
  { code: 'nltp244-2502', collaborator: 'accoさん', commission: 0.05, season: '春', category: 'トップス', stance: '', note: '', month: '' },
  { code: 'nltp321-2507', collaborator: 'accoさん', commission: 0.05, season: '夏', category: 'トップス', stance: '', note: '', month: '' },
  { code: 'nlpt421-2511', collaborator: 'accoさん', commission: 0.05, season: '冬', category: 'パンツ', stance: '', note: '', month: '' },
  { code: 'nlwp127-2405', collaborator: 'はらちゃん', commission: 0.15, season: '春', category: 'ワンピース', stance: '', note: '', month: '' },
  { code: 'nlwp128-2405', collaborator: 'はらちゃん', commission: 0.15, season: '春', category: 'ワンピース', stance: '', note: '', month: '' },
  { code: 'nltp218-2412', collaborator: 'はらちゃん', commission: 0.15, season: '冬', category: 'トップス', stance: '', note: '', month: '' },
  { code: 'nlsr245-2502', collaborator: 'YCさん', commission: 0.10, season: '春', category: 'サロペット', stance: '', note: '', month: '' },
  { code: 'nloi286-2505', collaborator: 'haruさん', commission: 0.10, season: '夏', category: 'オールインワン', stance: '', note: '', month: '' },
  { code: 'nlwp280-2505', collaborator: 'marikaさん', commission: 0.05, season: '夏', category: 'ワンピース', stance: '', note: '', month: '' },
  { code: 'nlwp282-2505', collaborator: 'sonocaさん', commission: 0.05, season: '夏', category: 'ワンピース', stance: '', note: '', month: '' },
  { code: 'nlot403-2511', collaborator: 'みーさん', commission: 0.05, season: '冬', category: 'アウター', stance: '', note: '', month: '' },
]

// Additional recent products from lot sheet (most recent first)
const RECENT_PRODUCTS = [
  'nltp516-2602', 'nltp497-2602', 'nltp506-2602', 'nltp507-2602',
  'nlpt504-2602', 'nlsk494-2602', 'nltp477-2602', 'nltp475-2602',
  'nltp500-2602', 'nltp512-2602', 'nltp513-2602', 'nltp492-2602',
  'nltp485-2602', 'nltp486-2602', 'nlmtp009-2602', 'nlmsk010-2602',
  'nltp508-2601', 'nltp480-2601', 'nltp465-2601', 'nltp468-2601',
  'nltp482-2601', 'nltp472-2601', 'nltp464-2601', 'nltp466-2601',
  'nltp470-2601', 'nltp474-2601', 'nltp483-2601', 'nltp488-2601',
  'nlwp462-2601', 'nltp469-2601', 'nltp484-2601', 'nlwp489-2601',
  'nltp471-2601', 'nlwp473-2512', 'nlpt461-2512', 'nlot458-2512',
  'nltp509-2512', 'nlwp496-2512',
  'blset139-2603', 'bltp137-2602', 'blset134-2602', 'bltp136-2601',
  'blset132-2601', 'bltp130-2601', 'blset140-2603', 'blpt138-2603',
  'bltp133-2512', 'blset131-2512', 'blpt128-2512', 'blot129-2512',
  'bltp135-2502', 'bltp123-2511', 'bltp126-2511', 'blot125-2511',
  'blot124-2511', 'blot127-2511',
]

function generateRealMasterData(): ProductMaster[] {
  const items: ProductMaster[] = []
  const now = new Date()

  // Add products from real master sheet
  for (const p of REAL_PRODUCTS) {
    const brand = detectBrand(p.code)
    const lot = LOT_MAP[p.code]
    items.push({
      product_code: p.code,
      product_name: '', // Would come from BigQuery
      brand,
      category: p.category || detectCategory(p.code),
      season: p.season || '春',
      collaborator: p.collaborator,
      commission_rate: p.commission,
      selling_price: 0,
      cost_price: 0,
      order_lot: lot !== undefined ? (lot || null) : null,
      sales_start_date: null,
      sales_end_date: null,
      lifecycle_stance: p.stance || '',
      operation_note: p.note || '',
      image_url: null,
      sku_images: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  // Add recent products from lot sheet
  for (const code of RECENT_PRODUCTS) {
    if (items.find(i => i.product_code === code)) continue
    const brand = detectBrand(code)
    const lot = LOT_MAP[code]
    items.push({
      product_code: code,
      product_name: '',
      brand,
      category: detectCategory(code),
      season: '',
      collaborator: null,
      commission_rate: 0.05,
      selling_price: 0,
      cost_price: 0,
      order_lot: lot !== undefined ? (lot || null) : null,
      sales_start_date: null,
      sales_end_date: null,
      lifecycle_stance: '',
      operation_note: '',
      image_url: null,
      sku_images: [],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return items
}

// Singleton store
let masterData: ProductMaster[] | null = null

function getStore(): ProductMaster[] {
  if (!masterData) {
    masterData = generateRealMasterData()
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
      brand: item.brand || detectBrand(item.product_code),
      category: item.category || detectCategory(item.product_code),
      season: item.season || '',
      collaborator: item.collaborator || null,
      commission_rate: item.commission_rate || 0,
      selling_price: item.selling_price || 0,
      cost_price: item.cost_price || 0,
      order_lot: item.order_lot || null,
      sales_start_date: item.sales_start_date || null,
      sales_end_date: item.sales_end_date || null,
      lifecycle_stance: item.lifecycle_stance || '',
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
