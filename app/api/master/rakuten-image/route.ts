import { NextRequest, NextResponse } from 'next/server'
import { rakutenFetch } from '@/lib/rakuten-throttle'

// Rakuten Ichiba Item Search API proxy
// Requires RAKUTEN_APP_ID environment variable
// API docs: https://webservice.rakuten.co.jp/documentation/ichiba-item-search

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const keyword = sp.get('keyword')
    if (!keyword) {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 })
    }

    const appId = process.env.RAKUTEN_APP_ID
    const accessKey = process.env.RAKUTEN_ACCESS_KEY
    if (!appId || !accessKey) {
      // Return mock results when API keys are not configured
      return NextResponse.json({
        items: generateMockImages(keyword),
        message: 'Mock data (RAKUTEN_APP_ID or RAKUTEN_ACCESS_KEY not configured)',
      })
    }

    // 2026年2月以降の新ドメイン
    const apiUrl = new URL('https://openapi.rakuten.co.jp/ichibasearch/api/IchibaItem/Search/20220601')
    apiUrl.searchParams.set('applicationId', appId)
    apiUrl.searchParams.set('accessKey', accessKey)
    apiUrl.searchParams.set('keyword', keyword)
    apiUrl.searchParams.set('hits', '10')
    apiUrl.searchParams.set('imageFlag', '1')
    apiUrl.searchParams.set('genreId', '100371') // レディースファッション

    const res = await rakutenFetch(apiUrl.toString(), {
      headers: {
        'Referer': 'https://tiast2026.github.io/Conversion-Tool/index.html',
        'Origin': 'https://tiast2026.github.io',
      },
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.text()).slice(0, 300) } catch { /* ignore */ }
      throw new Error(`Rakuten API error: ${res.status}${detail ? ` - ${detail}` : ''}`)
    }

    const data = await res.json()
    const items = (data.Items || []).map((wrapper: { Item: Record<string, unknown> }) => {
      const item = wrapper.Item
      const images = item.mediumImageUrls as { imageUrl: string }[] || []
      return {
        item_name: item.itemName,
        item_code: item.itemCode,
        image_url: images[0]?.imageUrl?.replace('?_ex=128x128', '?_ex=300x300') || null,
        shop_name: item.shopName,
        price: item.itemPrice,
      }
    })

    return NextResponse.json({ items })
  } catch (e) {
    console.error('Rakuten API error:', e)
    return NextResponse.json({ error: 'Failed to fetch from Rakuten API' }, { status: 500 })
  }
}

function generateMockImages(keyword: string) {
  // Generate placeholder images for demo
  const colors = ['E8D5B7', 'D4A574', 'C4A882', '8FAE8B', 'B8C4D4', 'DEB887']
  return Array.from({ length: 4 }, (_, i) => ({
    item_name: `${keyword} カラー${i + 1}`,
    item_code: `MOCK-${i + 1}`,
    image_url: `https://placehold.co/300x300/${colors[i % colors.length]}/333?text=${encodeURIComponent(keyword.slice(0, 4))}`,
    shop_name: 'モックショップ',
    price: (Math.floor(Math.random() * 10) + 3) * 1000,
  }))
}
