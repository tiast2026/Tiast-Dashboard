// Product master data store backed by Google Sheets
// Primary: Google Sheets spreadsheet
// Fallback: In-memory hard-coded data (for dev/mock mode)
import { ProductMaster } from '@/types/master'
import {
  fetchSheetData,
  getSheetProduct,
  getSheetHeaders,
  updateSheetRow,
  deleteSheetRow,
  isSheetsConfigured,
  type SheetProductMaster,
} from '@/lib/google-sheets'

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

// Convert Google Sheets row → ProductMaster
function sheetToProductMaster(s: SheetProductMaster): ProductMaster {
  const now = new Date().toISOString()
  return {
    product_code: s.product_code,
    zozo_product_code: s.zozo_product_code || '',
    product_name: '',
    brand: s.brand || detectBrand(s.product_code),
    category: s.category || detectCategory(s.product_code),
    season: s.season || '',
    season_extraction: s.season_extraction || '',
    collaborator: s.collaborator || null,
    commission_rate: 0,
    selling_price: s.selling_price || 0,
    cost_price: s.cost_price || 0,
    order_lot: s.order_lot || null,
    sales_start_date: s.sales_start_date || null,
    sales_end_date: s.sales_end_date || null,
    is_focus: s.is_focus || '',
    restock: s.restock || '',
    size: s.size || '',
    lifecycle_stance: '',
    operation_note: '',
    image_url: s.image_url || null,
    sku_images: [],
    extra_fields: s.extra_fields || {},
    created_at: now,
    updated_at: now,
  }
}

// Convert ProductMaster → Google Sheets row format
function productMasterToSheet(p: ProductMaster): SheetProductMaster {
  return {
    product_code: p.product_code,
    zozo_product_code: p.zozo_product_code || '',
    image_url: p.image_url || '',
    is_focus: p.is_focus || '',
    brand: p.brand,
    season_extraction: p.season_extraction || '',
    season: p.season,
    sales_start_date: p.sales_start_date || '',
    sales_end_date: p.sales_end_date || '',
    restock: p.restock || '',
    category: p.category,
    collaborator: p.collaborator || '',
    size: p.size || '',
    selling_price: p.selling_price,
    cost_price: p.cost_price,
    order_lot: p.order_lot,
    extra_fields: p.extra_fields || {},
  }
}

// ============================================================
// Public API (async, Google Sheets backed)
// ============================================================

export async function getMasterList(params: {
  page?: number
  per_page?: number
  brand?: string
  category?: string
  season?: string
  stance?: string
  search?: string
}) {
  const { page = 1, per_page = 30, brand, category, season, search } = params

  if (!isSheetsConfigured()) {
    return getMockMasterList(params)
  }

  const sheetData = await fetchSheetData()
  const headers = await getSheetHeaders()
  let items = sheetData.map(sheetToProductMaster)

  if (brand) items = items.filter(i => i.brand === brand)
  if (category) items = items.filter(i => i.category === category)
  if (season) items = items.filter(i => i.season === season)
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

  return { data, total, page, per_page, total_pages: Math.ceil(total / per_page), headers }
}

export async function getMasterItem(productCode: string): Promise<ProductMaster | undefined> {
  if (!isSheetsConfigured()) {
    return getMockMasterItem(productCode)
  }

  const sheet = await getSheetProduct(productCode)
  return sheet ? sheetToProductMaster(sheet) : undefined
}

export async function upsertMasterItem(item: ProductMaster): Promise<ProductMaster> {
  const now = new Date().toISOString()
  const updated = { ...item, updated_at: now }

  if (isSheetsConfigured()) {
    await updateSheetRow(productMasterToSheet(updated))
  }

  return updated
}

export async function deleteMasterItemAsync(productCode: string): Promise<boolean> {
  if (isSheetsConfigured()) {
    return deleteSheetRow(productCode)
  }
  return false
}

export async function importMasterItems(items: Partial<ProductMaster>[]): Promise<number> {
  let count = 0
  const now = new Date().toISOString()

  for (const item of items) {
    if (!item.product_code) continue
    const full: ProductMaster = {
      product_code: item.product_code,
      zozo_product_code: item.zozo_product_code || '',
      product_name: item.product_name || '',
      brand: item.brand || detectBrand(item.product_code),
      category: item.category || detectCategory(item.product_code),
      season: item.season || '',
      season_extraction: item.season_extraction || '',
      collaborator: item.collaborator || null,
      commission_rate: item.commission_rate || 0,
      selling_price: item.selling_price || 0,
      cost_price: item.cost_price || 0,
      order_lot: item.order_lot || null,
      sales_start_date: item.sales_start_date || null,
      sales_end_date: item.sales_end_date || null,
      is_focus: item.is_focus || '',
      restock: item.restock || '',
      size: item.size || '',
      lifecycle_stance: item.lifecycle_stance || '',
      operation_note: item.operation_note || '',
      image_url: item.image_url || null,
      sku_images: item.sku_images || [],
      extra_fields: item.extra_fields || {},
      created_at: now,
      updated_at: now,
    }
    await upsertMasterItem(full)
    count++
  }
  return count
}

// ============================================================
// Fallback mock data (used when Sheets is not configured)
// ============================================================

const MOCK_PRODUCTS: { code: string; brand: string; category: string; season: string; collaborator: string | null }[] = [
  { code: 'nlmtp001-2510', brand: 'NOAHL', category: 'トップス', season: '冬', collaborator: 'cocoさん' },
  { code: 'nlmpt002-2510', brand: 'NOAHL', category: 'パンツ', season: '冬', collaborator: 'cocoさん' },
  { code: 'nlmwp003-2510', brand: 'NOAHL', category: 'スカート', season: '春', collaborator: 'cocoさん' },
  { code: 'bltp117-2510', brand: 'BLACKQUEEN', category: 'トップス', season: '冬', collaborator: null },
  { code: 'blot113-2510', brand: 'BLACKQUEEN', category: 'アウター', season: '冬', collaborator: null },
]

function getMockMasterList(params: {
  page?: number; per_page?: number; brand?: string; category?: string; season?: string; search?: string
}) {
  const { page = 1, per_page = 30, brand, category, season, search } = params
  const now = new Date().toISOString()
  let items: ProductMaster[] = MOCK_PRODUCTS.map(p => ({
    product_code: p.code, zozo_product_code: '', product_name: '', brand: p.brand, category: p.category,
    season: p.season, season_extraction: '', collaborator: p.collaborator, commission_rate: 0,
    selling_price: 0, cost_price: 0, order_lot: null, sales_start_date: null, sales_end_date: null,
    is_focus: '', restock: '', size: '', lifecycle_stance: '', operation_note: '',
    image_url: null, sku_images: [], extra_fields: {}, created_at: now, updated_at: now,
  }))

  if (brand) items = items.filter(i => i.brand === brand)
  if (category) items = items.filter(i => i.category === category)
  if (season) items = items.filter(i => i.season === season)
  if (search) {
    const s = search.toLowerCase()
    items = items.filter(i => i.product_code.toLowerCase().includes(s))
  }

  const total = items.length
  const start = (page - 1) * per_page
  return { data: items.slice(start, start + per_page), total, page, per_page, total_pages: Math.ceil(total / per_page), headers: [] }
}

function getMockMasterItem(productCode: string): ProductMaster | undefined {
  const now = new Date().toISOString()
  const p = MOCK_PRODUCTS.find(m => m.code === productCode)
  if (!p) return undefined
  return {
    product_code: p.code, zozo_product_code: '', product_name: '', brand: p.brand, category: p.category,
    season: p.season, season_extraction: '', collaborator: p.collaborator, commission_rate: 0,
    selling_price: 0, cost_price: 0, order_lot: null, sales_start_date: null, sales_end_date: null,
    is_focus: '', restock: '', size: '', lifecycle_stance: '', operation_note: '',
    image_url: null, sku_images: [], extra_fields: {}, created_at: now, updated_at: now,
  }
}
