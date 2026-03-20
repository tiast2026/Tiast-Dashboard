'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { formatCurrency, formatDate } from '@/lib/format'
import { Trophy, TrendingUp, Star, RefreshCw, Info, Trash2, ChevronDown, ExternalLink, Calendar, Hash, Package, DollarSign, ShoppingCart, BarChart3, Loader2 } from 'lucide-react'
import ProductImage from '@/components/ui/product-image'
import ProductDetailDialog from '@/components/products/ProductDetailDialog'

interface RankingRecord {
  fetched_at: string
  ranking_type: string
  genre_id: string
  rank: number
  item_name: string
  item_code: string
  item_price: number
  item_url: string
  image_url: string
  shop_name: string
  matched_product_code: string
  review_count: number
  review_average: number
  first_ranked_at: string
  best_rank: number
  rank_count: number
}

interface ProductRankingSummary {
  matched_product_code: string
  item_code: string
  item_name: string
  image_url: string
  item_price: number
  item_url: string
  shop_name: string
  genre_id: string
  best_rank: number
  rank_count: number
  first_ranked_at: string
  latest_rank: number
  latest_fetched_at: string
  review_count: number
  review_average: number
  history: { date: string; rank: number; genre_id?: string }[]
}

/** item_code から品番部分を抽出（例: "noahl:10002595" → "10002595"） */
function extractProductNumber(itemCode: string): string {
  if (!itemCode) return ''
  const colonIdx = itemCode.indexOf(':')
  if (colonIdx >= 0) return itemCode.substring(colonIdx + 1)
  return itemCode
}

/** BigQuery timestamp（{value: "..."} 形式）を文字列に変換 */
function toDateStr(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v !== null && 'value' in v) return String((v as { value: unknown }).value)
  return String(v)
}

/** item_url から楽天の商品ID部分を抽出（例: "https://item.rakuten.co.jp/noahl/nlwp473-2512/" → "nlwp473-2512"） */
function extractRakutenProductId(itemUrl: string): string | null {
  if (!itemUrl) return null
  const match = itemUrl.match(/item\.rakuten\.co\.jp\/[^/]+\/([^/?]+)/)
  return match ? match[1] : null
}

function groupByProduct(records: RankingRecord[]): ProductRankingSummary[] {
  const map = new Map<string, ProductRankingSummary>()

  for (const r of records) {
    // ジャンル × item_code（楽天APIの一意コード）でグループ化
    const key = `${r.genre_id}:${r.item_code}`
    if (!map.has(key)) {
      map.set(key, {
        matched_product_code: r.matched_product_code,
        item_code: r.item_code,
        item_name: r.item_name,
        image_url: r.image_url,
        item_price: r.item_price,
        item_url: r.item_url,
        shop_name: r.shop_name,
        genre_id: r.genre_id,
        best_rank: r.rank,
        rank_count: 0,
        first_ranked_at: '',
        latest_rank: r.rank,
        latest_fetched_at: toDateStr(r.fetched_at),
        review_count: r.review_count,
        review_average: r.review_average,
        history: [],
      })
    }
    const entry = map.get(key)!
    const fetchedAt = toDateStr(r.fetched_at)
    entry.history.push({
      date: fetchedAt,
      rank: r.rank,
      genre_id: r.genre_id,
    })
    if (r.rank < entry.best_rank) {
      entry.best_rank = r.rank
    }
    if (fetchedAt > entry.latest_fetched_at) {
      entry.latest_fetched_at = fetchedAt
    }
  }

  // latest_rank, rank_count, first_ranked_at を重複排除後の履歴から算出
  for (const entry of Array.from(map.values())) {
    entry.history.sort((a, b) => b.date.localeCompare(a.date)) // 新しい順
    entry.rank_count = entry.history.length
    if (entry.history.length > 0) {
      entry.latest_rank = entry.history[0].rank
      entry.first_ranked_at = entry.history[entry.history.length - 1].date
    }
  }

  return Array.from(map.values()).sort((a, b) => a.best_rank - b.best_rank)
}

interface CategoryGroup {
  genre_id: string
  genre_name: string
  best_rank_in_category: number
  products: ProductRankingSummary[]
}

// カテゴリグループの色パレット
const CATEGORY_COLORS = [
  { border: 'border-l-red-500', bg: 'bg-red-500' },
  { border: 'border-l-blue-500', bg: 'bg-blue-500' },
  { border: 'border-l-emerald-500', bg: 'bg-emerald-500' },
  { border: 'border-l-amber-500', bg: 'bg-amber-500' },
  { border: 'border-l-purple-500', bg: 'bg-purple-500' },
  { border: 'border-l-pink-500', bg: 'bg-pink-500' },
  { border: 'border-l-cyan-500', bg: 'bg-cyan-500' },
  { border: 'border-l-orange-500', bg: 'bg-orange-500' },
  { border: 'border-l-indigo-500', bg: 'bg-indigo-500' },
  { border: 'border-l-teal-500', bg: 'bg-teal-500' },
  { border: 'border-l-rose-500', bg: 'bg-rose-500' },
  { border: 'border-l-lime-500', bg: 'bg-lime-500' },
]

function groupByCategory(products: ProductRankingSummary[]): CategoryGroup[] {
  const map = new Map<string, ProductRankingSummary[]>()
  for (const p of products) {
    const list = map.get(p.genre_id) || []
    list.push(p)
    map.set(p.genre_id, list)
  }
  const groups: CategoryGroup[] = Array.from(map.entries()).map(([genre_id, prods]) => ({
    genre_id,
    genre_name: getGenreLabel(genre_id),
    best_rank_in_category: Math.min(...prods.map(p => p.best_rank)),
    products: prods.sort((a, b) => a.best_rank - b.best_rank),
  }))
  return groups.sort((a, b) => a.best_rank_in_category - b.best_rank_in_category)
}

function formatDateTime(date: unknown): string {
  if (!date) return '-'
  // BigQuery timestamp may come as { value: "..." } object
  const raw = typeof date === 'object' && date !== null && 'value' in date
    ? (date as { value: string }).value
    : String(date)
  const d = new Date(raw)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function RankBadge({ rank, size = 'md' }: { rank: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-xl',
    lg: 'text-3xl',
  }
  if (rank <= 3) {
    const colors = ['', 'text-yellow-500', 'text-gray-400', 'text-amber-600']
    const bgColors = ['', 'bg-yellow-50', 'bg-gray-50', 'bg-amber-50']
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${bgColors[rank]}`}>
        <Trophy className={`w-4 h-4 ${colors[rank]}`} />
        <span className={`font-bold ${sizeClasses[size]} ${colors[rank]}`}>{rank}位</span>
      </div>
    )
  }
  return <span className={`font-bold ${sizeClasses[size]} text-gray-700`}>{rank}位</span>
}

// 全ジャンルID→名前マップ（表示用）
const GENRE_MAP: Record<string, string> = {
  '100371': 'レディースファッション（全体）',
  '555086': 'トップス',
  '303656': 'Tシャツ・カットソー',
  '566018': 'タンクトップ',
  '206471': 'シャツ・ブラウス',
  '409352': 'ポロシャツ',
  '303662': 'キャミソール',
  '303655': 'ベアトップ・チューブトップ',
  '403871': 'カーディガン・ボレロ',
  '403890': 'ベスト・ジレ',
  '303699': 'アンサンブル',
  '566028': 'セーター',
  '566029': 'ニットパーカー',
  '566030': 'ニットキャミソール',
  '200343': 'ニット・セーター > その他',
  '502556': 'パーカー',
  '403923': 'スウェット・トレーナー',
  '112719': 'トップス > その他',
  '555089': 'ボトムス',
  '110734': 'スカート',
  '303587': 'キュロット',
  '206440': 'パンツ',
  '555087': 'コート・ジャケット',
  '110729': 'ワンピース',
  '568650': 'シャツワンピース',
  '568651': 'ジャンパースカート',
  '553029': 'チュニック',
  '555084': 'ドレス',
  '568279': 'パンツドレス',
  '555091': 'スーツ・セットアップ',
  '110724': 'パンツスーツ',
  '409073': 'スカートスーツ',
  '409120': 'ワンピーススーツ',
  '409096': '3・4点セット',
  '566020': 'セットアップ > トップスのみ',
  '566021': 'セットアップ > ボトムスのみ',
  '555083': 'オールインワン・サロペット',
  '553037': 'レインコート',
  '553038': 'レインスーツ',
  '409395': 'レインウェア > その他',
  '409365': '水着',
  '564338': 'ウェディングドレス',
  '403911': '福袋',
  '101801': 'その他',
}

// フィルタ用ジャンルリスト
const FILTER_GENRES = [
  { id: 'all', name: '全カテゴリ' },
  { id: '100371', name: 'レディースファッション（全体）' },
  { id: '555086', name: 'トップス（全体）' },
  { id: '303656', name: '┗ Tシャツ・カットソー' },
  { id: '206471', name: '┗ シャツ・ブラウス' },
  { id: '403871', name: '┗ カーディガン・ボレロ' },
  { id: '502556', name: '┗ パーカー' },
  { id: '403923', name: '┗ スウェット・トレーナー' },
  { id: '555089', name: 'ボトムス（全体）' },
  { id: '110734', name: '┗ スカート' },
  { id: '206440', name: '┗ パンツ' },
  { id: '555087', name: 'コート・ジャケット' },
  { id: '110729', name: 'ワンピース' },
  { id: '568650', name: 'シャツワンピース' },
  { id: '553029', name: 'チュニック' },
  { id: '555084', name: 'ドレス' },
  { id: '568279', name: 'パンツドレス' },
  { id: '555091', name: 'スーツ・セットアップ' },
  { id: '555083', name: 'オールインワン・サロペット' },
  { id: '409365', name: '水着' },
  { id: '101801', name: 'その他' },
]

function getGenreLabel(genreId: string): string {
  return GENRE_MAP[genreId] ?? genreId
}

interface ProductSalesData {
  product_code: string
  product_name: string
  image_url?: string | null
  total_quantity: number
  order_count: number
  sales_amount: number
  gross_profit: number
  gross_profit_rate: number
  selling_price: number
  cost_price: number
  brand: string
  category: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  reserved_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
  sales_start_date?: string | null
}

export default function RankingPage() {
  const [genre, setGenre] = useState('all')
  const [days, setDays] = useState('90')
  const [records, setRecords] = useState<RankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState(false)
  const [collectResult, setCollectResult] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [dialogProduct, setDialogProduct] = useState<{ productCode: string; sales: ProductSalesData | null } | null>(null)
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  const [salesDataMap, setSalesDataMap] = useState<Record<string, ProductSalesData | null>>({})
  const [salesLoadingSet, setSalesLoadingSet] = useState<Set<string>>(new Set())
  const mountedRef = useRef(true)

  const cacheKey = `ranking:${genre}:${days}`

  const fetchSalesData = useCallback(async (productCode: string, itemCode: string, itemUrl: string) => {
    if (salesDataMap[productCode] !== undefined) return
    setSalesLoadingSet((prev) => new Set(prev).add(productCode))
    try {
      // 品番の候補を複数生成して順に検索
      const rakutenId = extractRakutenProductId(itemUrl)
      const itemNum = extractProductNumber(itemCode || productCode)
      const searchTerms = [
        productCode.includes(':') ? null : productCode,
        rakutenId,
        itemNum,
      ].filter((t): t is string => !!t && t.length > 0)

      // 重複除去
      const uniqueTerms = Array.from(new Set(searchTerms))

      let foundData: ProductSalesData | null = null
      let resolvedCode: string | null = null

      for (const term of uniqueTerms) {
        // まず直接APIを試す
        const directRes = await fetch(`/api/products/${encodeURIComponent(term)}`)
        if (directRes.ok) {
          const data = await directRes.json()
          if (data && data.product_code) {
            foundData = data
            resolvedCode = data.product_code
            break
          }
        }

        // 見つからなければ list API で部分検索
        const listRes = await fetch(`/api/products/list?search=${encodeURIComponent(term)}&per_page=1`)
        if (listRes.ok) {
          const listData = await listRes.json()
          if (listData.data?.length > 0) {
            foundData = listData.data[0]
            resolvedCode = listData.data[0].product_code
            break
          }
        }
      }

      if (foundData && resolvedCode && mountedRef.current) {
        // trend APIのチャネル合計(period=all)で正確な全期間売上を取得
        try {
          const trendRes = await fetch(`/api/products/${encodeURIComponent(resolvedCode)}/trend?months=60&period=all`)
          if (trendRes.ok) {
            const trendData = await trendRes.json()
            const channels = trendData?.channels as { quantity: number; sales_amount: number }[] | undefined
            if (channels && channels.length > 0) {
              const totalAmount = channels.reduce((s: number, c: { sales_amount: number }) => s + Number(c.sales_amount), 0)
              const totalQuantity = channels.reduce((s: number, c: { quantity: number }) => s + Number(c.quantity), 0)
              if (totalAmount > 0) {
                foundData = { ...foundData, sales_amount: totalAmount, total_quantity: totalQuantity }
              }
            }
          }
        } catch {
          // trend取得失敗時は元のデータを使用
        }
        setSalesDataMap((prev) => ({ ...prev, [productCode]: foundData }))
      } else if (mountedRef.current) {
        setSalesDataMap((prev) => ({ ...prev, [productCode]: null }))
      }
    } catch {
      if (mountedRef.current) {
        setSalesDataMap((prev) => ({ ...prev, [productCode]: null }))
      }
    } finally {
      if (mountedRef.current) {
        setSalesLoadingSet((prev) => {
          const next = new Set(prev)
          next.delete(productCode)
          return next
        })
      }
    }
  }, [salesDataMap])

  const toggleExpand = (key: string, productCode: string, itemCode: string, itemUrl: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        fetchSalesData(productCode, itemCode, itemUrl)
      }
      return next
    })
  }

  const fetchHistory = useCallback(async () => {
    if (isFresh(cacheKey)) return
    const cached = getCached<RankingRecord[]>(cacheKey)
    if (!cached) setLoading(true)

    try {
      const params = new URLSearchParams({ days, limit: '500' })
      if (genre !== 'all') params.set('genre', genre)
      const res = await fetch(`/api/rakuten-ranking/history?${params}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '不明なエラー' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (mountedRef.current) {
        setRecords(Array.isArray(data) ? data : [])
        setCache(cacheKey, data)
        setHistoryError(null)
      }
    } catch (e) {
      console.error('楽天ランキング履歴取得失敗:', e)
      if (mountedRef.current) {
        setHistoryError(e instanceof Error ? e.message : 'データの取得に失敗しました')
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [genre, days, cacheKey])

  useEffect(() => {
    mountedRef.current = true
    const c = getCached<RankingRecord[]>(cacheKey)
    if (c) {
      setRecords(c)
      setLoading(false)
    }
    fetchHistory()
    return () => { mountedRef.current = false }
  }, [fetchHistory, cacheKey])

  const handleClear = async () => {
    if (!confirm('楽天ランキング履歴データを全削除します。よろしいですか？')) return
    try {
      const res = await fetch('/api/rakuten-ranking/clear', { method: 'DELETE' })
      if (res.ok) {
        setRecords([])
        setCache(cacheKey, null as unknown)
        setCollectResult('履歴データを全削除しました。「今すぐ取得」で再取得してください。')
      } else {
        const data = await res.json()
        setCollectResult(`削除エラー: ${data.error}`)
      }
    } catch {
      setCollectResult('削除に失敗しました')
    }
  }

  const handleCollect = async () => {
    setCollecting(true)
    setCollectResult(null)
    try {
      const res = await fetch('/api/rakuten-ranking/collect?genre=all')
      const data = await res.json()
      if (res.ok) {
        const skipped = data.skipped_genres ?? 0
        const totalGenres = data.genre_results?.length ?? 0

        if (skipped > 0 && data.total_items === 0) {
          // 全カテゴリが既に取得済み
          setCollectResult('本日のランキングは既に取得済みです。次回更新後に再取得してください。')
        } else {
          const genreDetail = data.genre_results
            ?.filter((g: { skipped?: boolean }) => !g.skipped)
            ?.map((g: { genre_name: string; items: number; own: number }) =>
              `${g.genre_name}: ${g.items}件(自社${g.own}件)`
            ).join('、')
          setCollectResult(
            `全${totalGenres}カテゴリ ${data.total_items}件取得、自社商品 ${data.own_items}件検出` +
            (skipped > 0 ? `（${skipped}カテゴリは取得済みのためスキップ）` : '') +
            (genreDetail ? `\n${genreDetail}` : '')
          )
          setCache(cacheKey, null as unknown)
          fetchHistory()
        }
      } else {
        setCollectResult(`エラー: ${data.error}`)
      }
    } catch {
      setCollectResult('取得に失敗しました')
    } finally {
      setCollecting(false)
    }
  }

  const grouped = groupByProduct(records)
  const categoryGroups = groupByCategory(grouped)

  // データ期間を計算
  const allDates = records.map((r) => r.fetched_at).filter(Boolean).sort()
  const oldestDate = allDates[0]
  const newestDate = allDates[allDates.length - 1]

  return (
    <>
      <Header title="楽天ランキング履歴" subtitle="レディースファッション｜デイリー集計" />
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger className="w-64 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTER_GENRES.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">直近7日</SelectItem>
              <SelectItem value="30">直近30日</SelectItem>
              <SelectItem value="90">直近90日</SelectItem>
              <SelectItem value="180">直近180日</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              履歴クリア
            </button>
            <button
              onClick={handleCollect}
              disabled={collecting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#BF0000] hover:bg-[#A00000] rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${collecting ? 'animate-spin' : ''}`} />
              {collecting ? '全カテゴリ取得中...' : '今すぐ取得'}
            </button>
          </div>
        </div>

        {/* ランキングの説明 */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>楽天市場レディースファッション各カテゴリの<strong>デイリーランキング</strong>（前日の売上に基づき毎日更新）を取得しています。毎日自動で全カテゴリを収集し、フィルタでカテゴリ別に絞り込めます。商品をクリックすると詳細な履歴が確認できます。</p>
        </div>

        {historyError && (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            <span className="font-medium">エラー:</span> {historyError}
          </div>
        )}

        {collectResult && (
          <div className={`px-4 py-2 rounded-lg text-sm ${
            collectResult.startsWith('エラー')
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-gray-50 text-gray-600'
          }`}>
            {collectResult.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        {/* Summary KPIs */}
        {!loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  ランクイン商品数
                </div>
                <div className="text-2xl font-bold text-gray-800">{grouped.length}<span className="text-sm font-normal text-gray-400 ml-1">商品</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  最高順位
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {grouped.length > 0 ? `${grouped[0].best_rank}位` : '-'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Hash className="w-4 h-4 text-blue-500" />
                  総ランクイン回数
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {records.length}<span className="text-sm font-normal text-gray-400 ml-1">回</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Calendar className="w-4 h-4 text-purple-500" />
                  データ期間
                </div>
                <div className="text-sm font-bold text-gray-800">
                  {oldestDate && newestDate ? (
                    <>
                      <span>{formatDate(oldestDate)}</span>
                      <span className="text-gray-400 mx-1">〜</span>
                      <span>{formatDate(newestDate)}</span>
                    </>
                  ) : '-'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ranking History */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-800">
            自社商品ランクイン履歴
            {!loading && categoryGroups.length > 0 && (
              <span className="text-sm font-normal text-gray-400 ml-2">{categoryGroups.length}カテゴリ / {grouped.length}商品</span>
            )}
          </h2>
          {!loading && grouped.length > 0 && (
            <span className="text-xs text-gray-400">最終発表: {formatDateTime(newestDate)}</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">ランクイン履歴がありません</p>
            <p className="text-xs mt-1">「今すぐ取得」ボタンでランキングを取得してください</p>
          </div>
        ) : (
          <div className="space-y-6">
            {categoryGroups.map((category, catIndex) => {
              const color = CATEGORY_COLORS[catIndex % CATEGORY_COLORS.length]
              return (
              <div key={category.genre_id}>
                {/* Category Section Header */}
                <div className={`border-l-4 ${color.border} bg-white rounded-r-lg px-4 py-3 mb-3 flex items-center justify-between shadow-sm`}>
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-800 text-sm">{category.genre_name}</h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {category.products.length}商品
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500">
                    <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-xs">最高</span>
                    <RankBadge rank={category.best_rank_in_category} size="sm" />
                  </div>
                </div>

                {/* Products in this category */}
                <div className="space-y-2">
                  {category.products.map((product) => {
                    const key = `${product.genre_id}:${product.matched_product_code}`
                    const isExpanded = expandedProducts.has(key)
                    const sortedHistory = [...product.history].sort(
                      (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))
                    )

                    return (
                      <div
                        key={key}
                        className={`border rounded-lg transition-all ${isExpanded ? 'border-gray-200 shadow-sm' : 'border-gray-100 hover:border-gray-200'}`}
                      >
                        {/* Main Row */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(key, product.matched_product_code, product.item_code, product.item_url)}
                          className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/50 transition-colors rounded-lg"
                        >
                          {/* Rank */}
                          <div className="w-16 text-center flex-shrink-0">
                            <div className="text-[10px] text-gray-400 mb-0.5">最高順位</div>
                            <RankBadge rank={product.best_rank} />
                          </div>

                          {/* Image */}
                          <div className="flex-shrink-0">
                            <ProductImage src={product.image_url} size={72} />
                          </div>

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate" title={product.item_name}>
                              {product.item_name}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-gray-500">{extractRakutenProductId(product.item_url) || extractProductNumber(product.item_code)}</span>
                              <span className="text-gray-300">/</span>
                              <span>{product.shop_name}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                              <span className="font-medium">{formatCurrency(product.item_price)}</span>
                              {product.review_count > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                  {product.review_average.toFixed(1)} ({product.review_count})
                                </span>
                              )}
                              <span className="text-gray-300">|</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                最新: {formatDate(product.latest_fetched_at)}
                              </span>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex gap-5 flex-shrink-0 text-center">
                            <div>
                              <div className="text-[10px] text-gray-400">現在順位</div>
                              <div className="text-lg font-semibold text-gray-700">{product.latest_rank}位</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">ランクイン</div>
                              <div className="text-lg font-semibold text-gray-700">{product.rank_count}回</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400">初回ランクイン</div>
                              <div className="text-sm font-medium text-gray-600">{formatDateTime(product.first_ranked_at)}</div>
                            </div>
                          </div>

                          {/* Sparkline + Expand */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-28">
                              <RankSparkline history={product.history} />
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </button>

                        {/* Expanded Detail */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-medium text-gray-700">商品詳細・ランキング履歴</h4>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const sales = salesDataMap[product.matched_product_code]
                                    setDialogProduct({
                                      productCode: sales?.product_code || extractRakutenProductId(product.item_url) || extractProductNumber(product.item_code),
                                      sales,
                                    })
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                >
                                  <BarChart3 className="w-3 h-3" />
                                  商品分析を見る
                                </button>
                                {product.item_url && (
                                  <a
                                    href={product.item_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-[#BF0000] hover:underline"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    楽天で商品を見る
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* 売上・商品情報サマリ */}
                            {(() => {
                              const sales = salesDataMap[product.matched_product_code]
                              const isLoadingSales = salesLoadingSet.has(product.matched_product_code)
                              return (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                                  <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="text-[10px] text-gray-400">品番</div>
                                    <div className="text-sm font-mono font-medium text-gray-700">{extractRakutenProductId(product.item_url) || extractProductNumber(product.item_code)}</div>
                                  </div>
                                  <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="text-[10px] text-gray-400">楽天価格</div>
                                    <div className="text-sm font-medium text-gray-700">{formatCurrency(product.item_price)}</div>
                                  </div>
                                  <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="text-[10px] text-gray-400">レビュー</div>
                                    <div className="text-sm font-medium text-gray-700">
                                      {product.review_count > 0 ? (
                                        <span className="flex items-center gap-1">
                                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                          {product.review_average.toFixed(1)} ({product.review_count}件)
                                        </span>
                                      ) : 'なし'}
                                    </div>
                                  </div>
                                  {isLoadingSales ? (
                                    <div className="col-span-3 bg-white rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-center gap-2 text-gray-400 text-xs">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      売上データ読み込み中...
                                    </div>
                                  ) : sales ? (
                                    <>
                                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                          <DollarSign className="w-3 h-3" />
                                          売上（全期間）
                                        </div>
                                        <div className="text-sm font-bold text-gray-800">{formatCurrency(sales.sales_amount)}</div>
                                      </div>
                                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                          <ShoppingCart className="w-3 h-3" />
                                          販売数
                                        </div>
                                        <div className="text-sm font-bold text-gray-800">{sales.total_quantity?.toLocaleString() ?? '-'}点</div>
                                      </div>
                                      <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                          <Package className="w-3 h-3" />
                                          粗利率
                                        </div>
                                        <div className="text-sm font-bold text-gray-800">
                                          {sales.gross_profit_rate != null ? `${(sales.gross_profit_rate * 100).toFixed(1)}%` : '-'}
                                        </div>
                                      </div>
                                    </>
                                  ) : salesDataMap[product.matched_product_code] === null ? (
                                    <div className="col-span-3 bg-white rounded-lg px-3 py-2 border border-gray-100 text-xs text-gray-400 flex items-center justify-center">
                                      売上データなし（商品マスタ未登録の可能性）
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })()}

                            {/* 履歴テーブル */}
                            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50 text-gray-500 text-xs">
                                    <th className="text-left px-4 py-2 font-medium">ランキング発表日時</th>
                                    <th className="text-left px-4 py-2 font-medium">ジャンル</th>
                                    <th className="text-center px-4 py-2 font-medium">順位</th>
                                    <th className="text-center px-4 py-2 font-medium">変動</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedHistory.map((h, i) => {
                                    const prev = sortedHistory[i + 1]
                                    const diff = prev ? prev.rank - h.rank : 0
                                    return (
                                      <tr key={`${h.date}-${h.genre_id}-${h.rank}`} className="border-t border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-2 text-gray-600">
                                          <div className="flex items-center gap-1.5">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                            {formatDateTime(h.date)}
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-gray-500 text-xs">{h.genre_id ? getGenreLabel(h.genre_id) : '-'}</td>
                                        <td className="px-4 py-2 text-center font-semibold text-gray-800">{h.rank}位</td>
                                        <td className="px-4 py-2 text-center">
                                          {diff > 0 ? (
                                            <span className="text-green-600 font-medium">+{diff} ↑</span>
                                          ) : diff < 0 ? (
                                            <span className="text-red-500 font-medium">{diff} ↓</span>
                                          ) : prev ? (
                                            <span className="text-gray-400">→</span>
                                          ) : (
                                            <span className="text-blue-500 text-xs">初回</span>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* 商品分析ダイアログ */}
      <ProductDetailDialog
        open={!!dialogProduct}
        onClose={() => setDialogProduct(null)}
        mode="product"
        productCode={dialogProduct?.productCode || ''}
        period="all"
        product={dialogProduct?.sales ? {
          product_code: dialogProduct.sales.product_code,
          product_name: dialogProduct.sales.product_name,
          image_url: dialogProduct.sales.image_url ?? null,
          total_quantity: dialogProduct.sales.total_quantity,
          sales_amount: dialogProduct.sales.sales_amount,
          gross_profit_rate: dialogProduct.sales.gross_profit_rate,
          total_stock: dialogProduct.sales.total_stock ?? 0,
          free_stock: dialogProduct.sales.free_stock ?? 0,
          zozo_stock: dialogProduct.sales.zozo_stock ?? 0,
          reserved_stock: dialogProduct.sales.reserved_stock ?? 0,
          daily_sales: dialogProduct.sales.daily_sales ?? 0,
          stock_days: dialogProduct.sales.stock_days ?? 0,
          inventory_status: dialogProduct.sales.inventory_status ?? '',
          sales_start_date: dialogProduct.sales.sales_start_date,
        } : null}
      />
    </>
  )
}

/** ミニ順位推移グラフ（SVGスパークライン） */
function RankSparkline({ history }: { history: { date: string; rank: number }[] }) {
  if (history.length < 2) {
    return (
      <div className="text-center">
        <div className="text-[10px] text-gray-400">順位推移</div>
        <div className="text-xs text-gray-300 mt-1">データ不足</div>
      </div>
    )
  }

  const sorted = [...history].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const ranks = sorted.map((h) => h.rank)
  const maxRank = Math.max(...ranks, 100)
  const minRank = Math.min(...ranks, 1)
  const range = Math.max(maxRank - minRank, 1)

  const w = 112
  const h = 36
  const padding = 2

  const points = ranks.map((rank, i) => {
    const x = padding + (i / (ranks.length - 1)) * (w - padding * 2)
    const y = padding + ((rank - minRank) / range) * (h - padding * 2)
    return `${x},${y}`
  })

  return (
    <div className="relative">
      <div className="text-[10px] text-gray-400 text-center mb-0.5">順位推移</div>
      <svg width={w} height={h} className="block mx-auto">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#BF0000"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="2.5"
            fill="#BF0000"
          />
        )}
      </svg>
      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
        <span>{minRank}位</span>
        <span>{maxRank}位</span>
      </div>
    </div>
  )
}
