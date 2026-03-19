'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { formatCurrency, formatDate } from '@/lib/format'
import { Trophy, TrendingUp, Star, Clock, RefreshCw, Info } from 'lucide-react'
import ProductImage from '@/components/ui/product-image'

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

// ランクイン商品をグループ化
interface ProductRankingSummary {
  matched_product_code: string
  item_name: string
  image_url: string
  item_price: number
  shop_name: string
  best_rank: number
  rank_count: number
  first_ranked_at: string
  latest_rank: number
  latest_fetched_at: string
  review_count: number
  review_average: number
  history: { date: string; rank: number }[]
}

function groupByProduct(records: RankingRecord[]): ProductRankingSummary[] {
  const map = new Map<string, ProductRankingSummary>()

  for (const r of records) {
    const key = r.matched_product_code
    if (!map.has(key)) {
      map.set(key, {
        matched_product_code: r.matched_product_code,
        item_name: r.item_name,
        image_url: r.image_url,
        item_price: r.item_price,
        shop_name: r.shop_name,
        best_rank: r.best_rank,
        rank_count: r.rank_count,
        first_ranked_at: r.first_ranked_at,
        latest_rank: r.rank,
        latest_fetched_at: r.fetched_at,
        review_count: r.review_count,
        review_average: r.review_average,
        history: [],
      })
    }
    const entry = map.get(key)!
    entry.history.push({
      date: r.fetched_at,
      rank: r.rank,
    })
    // latest = 最新のfetched_at
    if (r.fetched_at > entry.latest_fetched_at) {
      entry.latest_rank = r.rank
      entry.latest_fetched_at = r.fetched_at
      entry.item_name = r.item_name
      entry.image_url = r.image_url
    }
  }

  return Array.from(map.values()).sort((a, b) => a.best_rank - b.best_rank)
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const colors = ['', 'text-yellow-500', 'text-gray-400', 'text-amber-600']
    return (
      <div className="flex items-center gap-1">
        <Trophy className={`w-4 h-4 ${colors[rank]}`} />
        <span className="font-bold text-lg">{rank}</span>
      </div>
    )
  }
  return <span className="font-bold text-lg text-gray-700">{rank}</span>
}

export default function RankingPage() {
  const [rankingType, setRankingType] = useState('daily')
  const [days, setDays] = useState('90')
  const [records, setRecords] = useState<RankingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState(false)
  const [collectResult, setCollectResult] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const cacheKey = `ranking:${rankingType}:${days}`

  const fetchHistory = useCallback(async () => {
    if (isFresh(cacheKey)) return
    const cached = getCached<RankingRecord[]>(cacheKey)
    if (!cached) setLoading(true)

    try {
      const params = new URLSearchParams({ type: rankingType, days, limit: '500' })
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
  }, [rankingType, days, cacheKey])

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

  const handleCollect = async () => {
    setCollecting(true)
    setCollectResult(null)
    try {
      const res = await fetch(`/api/rakuten-ranking/collect?type=${rankingType}`)
      const data = await res.json()
      if (res.ok) {
        setCollectResult(
          `${data.total_items}件取得、自社商品 ${data.own_items}件検出`
        )
        // Refresh history
        setCache(cacheKey, null as unknown)
        fetchHistory()
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

  return (
    <>
      <Header title="楽天ランキング履歴" subtitle="レディースファッション" />
      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-3">
          <Select value={rankingType} onValueChange={setRankingType}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">デイリー</SelectItem>
              <SelectItem value="realtime">リアルタイム</SelectItem>
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
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#BF0000] hover:bg-[#A00000] rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${collecting ? 'animate-spin' : ''}`} />
            {collecting ? '取得中...' : '今すぐ取得'}
          </button>
        </div>

        {/* ランキング種別の説明 */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium mb-1">ランキング種別について</p>
            <ul className="space-y-0.5 text-blue-600">
              <li><span className="font-medium">デイリー:</span> 前日の売上に基づくランキング（毎日更新）</li>
              <li><span className="font-medium">リアルタイム:</span> 直近の売上に基づくランキング（随時更新）</li>
            </ul>
            <p className="mt-1 text-blue-500">※ 楽天市場ランキングAPIは「デイリー」と「リアルタイム」のみ提供しており、週間ランキングには対応していません。更新タイミングは楽天側の仕様により非公開です。</p>
          </div>
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
            {collectResult}
          </div>
        )}

        {/* Summary KPIs */}
        {!loading && (
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  ランクイン商品数
                </div>
                <div className="text-2xl font-bold text-gray-800">{grouped.length}</div>
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
                  <Star className="w-4 h-4 text-blue-500" />
                  総ランクイン回数
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {records.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <Clock className="w-4 h-4 text-purple-500" />
                  最終取得
                </div>
                <div className="text-lg font-bold text-gray-800">
                  {records.length > 0 ? formatDate(records[0].fetched_at) : '-'}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ranking History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">自社商品ランクイン履歴</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">ランクイン履歴がありません</p>
                <p className="text-xs mt-1">「今すぐ取得」ボタンでランキングを取得してください</p>
              </div>
            ) : (
              <div className="space-y-3">
                {grouped.map((product) => (
                  <div
                    key={product.matched_product_code}
                    className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg hover:bg-gray-50/50 transition-colors"
                  >
                    {/* Rank */}
                    <div className="w-14 text-center flex-shrink-0">
                      <div className="text-[10px] text-gray-400 mb-0.5">最高</div>
                      <RankBadge rank={product.best_rank} />
                    </div>

                    {/* Image */}
                    <div className="flex-shrink-0">
                      <ProductImage src={product.image_url} size={64} />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" title={product.item_name}>
                        {product.item_name}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {product.matched_product_code} / {product.shop_name}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                        <span>{formatCurrency(product.item_price)}</span>
                        {product.review_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            {product.review_average.toFixed(1)} ({product.review_count})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-6 flex-shrink-0 text-center">
                      <div>
                        <div className="text-[10px] text-gray-400">現在順位</div>
                        <div className="text-lg font-semibold text-gray-700">{product.latest_rank}位</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">ランクイン</div>
                        <div className="text-lg font-semibold text-gray-700">{product.rank_count}回</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">初回</div>
                        <div className="text-sm font-medium text-gray-600">{formatDate(product.first_ranked_at)}</div>
                      </div>
                    </div>

                    {/* Rank History Mini Chart */}
                    <div className="w-32 flex-shrink-0">
                      <RankSparkline history={product.history} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/** ミニ順位推移グラフ（SVGスパークライン） */
function RankSparkline({ history }: { history: { date: string; rank: number }[] }) {
  if (history.length < 2) {
    return <div className="text-xs text-gray-300 text-center">データ不足</div>
  }

  const sorted = [...history].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const ranks = sorted.map((h) => h.rank)
  const maxRank = Math.max(...ranks, 100)
  const minRank = Math.min(...ranks, 1)
  const range = Math.max(maxRank - minRank, 1)

  const w = 120
  const h = 36
  const padding = 2

  const points = ranks.map((rank, i) => {
    const x = padding + (i / (ranks.length - 1)) * (w - padding * 2)
    // 順位は低い方が良い → Y軸反転
    const y = padding + ((rank - minRank) / range) * (h - padding * 2)
    return `${x},${y}`
  })

  return (
    <div className="relative">
      <svg width={w} height={h} className="block">
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#BF0000"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 最新の点 */}
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
