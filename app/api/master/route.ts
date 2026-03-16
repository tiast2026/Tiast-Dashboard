import { NextRequest, NextResponse } from 'next/server'
import { getMasterList, upsertMasterItem, deleteMasterItemAsync, importMasterItems } from '@/lib/master-store'

// GET /api/master - List master items
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const result = await getMasterList({
      page: sp.get('page') ? Number(sp.get('page')) : 1,
      per_page: sp.get('per_page') ? Number(sp.get('per_page')) : 30,
      brand: sp.get('brand') || undefined,
      category: sp.get('category') || undefined,
      season: sp.get('season') || undefined,
      stance: sp.get('stance') || undefined,
      search: sp.get('search') || undefined,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('Master list error:', msg)
    return NextResponse.json({ error: `マスタデータの取得に失敗しました: ${msg}` }, { status: 500 })
  }
}

// POST /api/master - Create or update a master item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const item = await upsertMasterItem(body)
    return NextResponse.json(item)
  } catch (e) {
    console.error('Master upsert error:', e)
    return NextResponse.json({ error: 'Failed to save master data' }, { status: 500 })
  }
}

// DELETE /api/master - Delete a master item
export async function DELETE(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const code = sp.get('product_code')
    if (!code) {
      return NextResponse.json({ error: 'product_code is required' }, { status: 400 })
    }
    const ok = await deleteMasterItemAsync(code)
    if (!ok) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Master delete error:', e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}

// PUT /api/master - Bulk import
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }
    const count = await importMasterItems(body.items)
    return NextResponse.json({ imported: count })
  } catch (e) {
    console.error('Master import error:', e)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
