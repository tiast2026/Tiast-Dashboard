import { NextRequest, NextResponse } from 'next/server'
import { getSkuImagesForProduct, getSkuHeaders, isSheetsConfigured } from '@/lib/google-sheets'

// GET /api/master/sku-images?product_code=xxx
export async function GET(request: NextRequest) {
  try {
    const productCode = request.nextUrl.searchParams.get('product_code')
    if (!productCode) {
      return NextResponse.json({ error: 'product_code is required' }, { status: 400 })
    }

    if (!isSheetsConfigured()) {
      return NextResponse.json({ data: [], headers: [] })
    }

    const skuImages = await getSkuImagesForProduct(productCode)
    const headers = await getSkuHeaders()
    return NextResponse.json({ data: skuImages, headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('SKU images error:', msg)
    return NextResponse.json({ error: `SKU画像の取得に失敗しました: ${msg}` }, { status: 500 })
  }
}
