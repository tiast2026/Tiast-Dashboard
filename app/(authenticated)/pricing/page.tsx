'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import GroupTabs from '@/components/layout/GroupTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  getCurrentMonth,
} from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react'

interface PricingSummary {
  total_revenue: number
  total_list_revenue: number
  lost_revenue: number
  full_price_rate: number
  full_price_orders: number
  discounted_orders: number
  full_price_revenue: number
  discounted_revenue: number
  avg_discount_rate: number
  channel_stats: ChannelStat[]
}

interface ChannelStat {
  channel: string
  orders: number
  revenue: number
  full_price_count: number
  discounted_count: number
  avg_discount: number
}

interface ProductPricing {
  product_code: string
  product_name: string
  list_price: number
  total_quantity: number
  total_revenue: number
  full_price_quantity: number
  discounted_quantity: number
  avg_selling_price: number
  min_selling_price: number
  max_discount_rate: number
  avg_discount_rate: number
  min_price_date: string | null
  days_since_min_price: number | null
  channels_sold: string
}

interface PriceHistoryItem {
  month: string
  channel: string
  min_price: number
  avg_price: number
  max_price: number
  list_price: number
  quantity: number
  is_historical_low: boolean
}

interface GenreMonthlyItem {
  order_month: string
  category: string
  avg_price: number
  min_price: number
  max_price: number
  avg_list_price: number
  avg_discount_rate: number
  quantity: number
  revenue: number
  full_price_rate: number
}

function PricingPageContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `pricing-v1:${month}:${brandParam}`

  const cached = getCached<{ summary: PricingSummary | null; products: ProductPricing[] }>(cacheKey)
  const [summary, setSummary] = useState<PricingSummary | null>(cached?.summary ?? null)
  const [products, setProducts] = useState<ProductPricing[]>(cached?.products ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  // Price history for selected product
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Sort
  const [sortKey, setSortKey] = useState<'revenue' | 'discount' | 'min_price'>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Genre × Month
  const genreCacheKey = `pricing-genre-v1:${brandParam}`
  const genreCached = getCached<GenreMonthlyItem[]>(genreCacheKey)
  const [genreMonthly, setGenreMonthly] = useState<GenreMonthlyItem[]>(genreCached ?? [])
  const [genreLoading, setGenreLoading] = useState(!genreCached)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)

    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const [summaryRes, productsRes] = await Promise.all([
        fetch(`/api/pricing-analysis/summary?month=${month}${bParam}`),
        fetch(`/api/pricing-analysis/products?month=${month}${bParam}`),
      ])
      const [summaryData, productsData] = await Promise.all([
        summaryRes.ok ? summaryRes.json() : null,
        productsRes.ok ? productsRes.json() : [],
      ])
      if (mountedRef.current) {
        setSummary(summaryData)
        setProducts(Array.isArray(productsData) ? productsData : [])
        setCache(cacheKey, { summary: summaryData, products: productsData })
      }
    } catch (e) {
      console.error('Failed to fetch pricing data:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchGenreData = useCallback(async () => {
    if (isFresh(genreCacheKey)) return
    if (!getCached(genreCacheKey)) setGenreLoading(true)
    try {
      const bParam = brandParam ? `?brand=${brandParam}` : ''
      const res = await fetch(`/api/pricing-analysis/genre-monthly${bParam}`)
      const data = res.ok ? await res.json() : []
      if (mountedRef.current) {
        const arr = Array.isArray(data) ? data : []
        setGenreMonthly(arr)
        setCache(genreCacheKey, arr)
      }
    } catch (e) {
      console.error('Failed to fetch genre data:', e)
    } finally {
      if (mountedRef.current) setGenreLoading(false)
    }
  }, [brandParam, genreCacheKey])

  useEffect(() => { fetchGenreData() }, [fetchGenreData])

  const fetchHistory = useCallback(async (productCode: string) => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/pricing-analysis/price-history?product_code=${encodeURIComponent(productCode)}`)
      const data = res.ok ? await res.json() : []
      if (mountedRef.current) setPriceHistory(Array.isArray(data) ? data : [])
    } catch {
      setPriceHistory([])
    } finally {
      if (mountedRef.current) setHistoryLoading(false)
    }
  }, [])

  const handleProductClick = (code: string) => {
    if (selectedProduct === code) {
      setSelectedProduct(null)
      setPriceHistory([])
    } else {
      setSelectedProduct(code)
      fetchHistory(code)
    }
  }

  const sortedProducts = [...products].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1
    switch (sortKey) {
      case 'revenue': return ((Number(b.total_revenue) || 0) - (Number(a.total_revenue) || 0)) * dir
      case 'discount': return ((Number(b.avg_discount_rate) || 0) - (Number(a.avg_discount_rate) || 0)) * dir
      case 'min_price': return ((Number(a.min_selling_price) || Infinity) - (Number(b.min_selling_price) || Infinity)) * dir
      default: return 0
    }
  })

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) => {
    if (sortKey !== k) return null
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />
  }

  // Helper: format days since min price as human-readable
  const formatDaysSince = (days: number | null): string => {
    if (days === null || days === undefined) return '-'
    if (days < 30) return `${days}日前`
    if (days < 365) return `${Math.floor(days / 30)}ヶ月前`
    return `${(days / 365).toFixed(1)}年前`
  }

  // Helper: min price badge
  const MinPriceBadge = ({ product }: { product: ProductPricing }) => {
    const days = Number(product.days_since_min_price)
    const minPrice = Number(product.min_selling_price) || 0
    const listPrice = Number(product.list_price) || 0
    const currentAvg = Number(product.avg_selling_price) || 0

    if (!minPrice || !listPrice) return null

    // Current avg is close to or at historical min
    const isNearMin = currentAvg <= minPrice * 1.05
    if (!isNearMin) return null

    if (days > 180) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
          <Zap className="w-3 h-3" />
          {days > 365 ? '1年ぶり' : `${Math.floor(days / 30)}ヶ月ぶり`}最安値！
        </span>
      )
    }
    return null
  }

  return (
    <>
      <Header title="価格分析" subtitle="定価販売率・値引き分析・最安値トラッキング" />
      <div className="p-8 space-y-6">
        <FilterBar
          month={month}
          onMonthChange={setMonth}
          brand={brand}
          onBrandChange={() => {}}
          hideBrand={!!urlBrand}
        />
        <GroupTabs />

        {/* KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">定価販売率</div>
                <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">
                  {formatPercent(summary.full_price_rate)}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {formatNumber(summary.full_price_orders)}件 / {formatNumber(summary.full_price_orders + summary.discounted_orders)}件
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">平均値引率</div>
                <div className="text-3xl font-bold text-red-600 tabular-nums mt-2">
                  {formatPercent(summary.avg_discount_rate)}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  値引き販売 {formatNumber(summary.discounted_orders)}件
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">値引きによる逸失売上</div>
                <div className="text-3xl font-bold text-amber-600 tabular-nums mt-2">
                  {formatCurrency(summary.lost_revenue)}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  定価合計 {formatCurrency(summary.total_list_revenue)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">実売上</div>
                <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">
                  {formatCurrency(summary.total_revenue)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${summary.full_price_rate * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400">定価率</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Channel Comparison + Insights */}
        {!loading && summary && (
          <div className="grid grid-cols-2 gap-6">
            {/* チャネル別比較 */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">チャネル別 値引き比較</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.channel_stats.length > 0 ? (
                  <div className="space-y-3">
                    {summary.channel_stats.map((ch) => {
                      const total = (Number(ch.full_price_count) || 0) + (Number(ch.discounted_count) || 0)
                      const fullPriceRate = total > 0 ? (Number(ch.full_price_count) || 0) / total : 0
                      const discount = Number(ch.avg_discount) || 0
                      return (
                        <div key={ch.channel} className="p-3 rounded-xl border border-gray-100/60 bg-gradient-to-r from-gray-50/50 to-white hover:shadow-sm transition-shadow">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[13px] font-semibold text-[#3D352F]">{ch.channel}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-gray-500">
                                定価率 <span className={`font-bold ${fullPriceRate >= 0.7 ? 'text-emerald-600' : fullPriceRate >= 0.4 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {formatPercent(fullPriceRate)}
                                </span>
                              </span>
                              {discount > 0 && (
                                <span className="text-[11px] text-gray-500">
                                  平均値引 <span className="font-bold text-red-600">{formatPercent(discount)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${fullPriceRate * 100}%` }} />
                            <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${(1 - fullPriceRate) * 100}%` }} />
                          </div>
                          <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
                            <span>定価 {formatNumber(Number(ch.full_price_count) || 0)}件</span>
                            <span>値引き {formatNumber(Number(ch.discounted_count) || 0)}件</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
                )}
              </CardContent>
            </Card>

            {/* 自動インサイト */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#C4A882]" />
                  価格戦略インサイト
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const insights: { type: 'success' | 'warning' | 'danger' | 'info'; title: string; detail: string }[] = []

                  if (summary.full_price_rate >= 0.7) {
                    insights.push({ type: 'success', title: '定価販売率が高水準', detail: `${formatPercent(summary.full_price_rate)}の売上が定価。ブランド価値の維持ができています。` })
                  } else if (summary.full_price_rate < 0.4) {
                    insights.push({ type: 'danger', title: '値引き販売が多い', detail: `定価率${formatPercent(summary.full_price_rate)}。値引き依存はブランド毀損リスクがあります。定価で売れる商品構成の見直しを。` })
                  }

                  if (summary.lost_revenue > 0) {
                    insights.push({ type: 'warning', title: `逸失売上 ${formatCurrency(summary.lost_revenue)}`, detail: '値引きしなければ得られた売上。在庫消化のための値引きか、集客のための値引きか見極めが重要です。' })
                  }

                  // Channel insights
                  const channels = summary.channel_stats
                  const highDiscount = channels.filter(c => (Number(c.avg_discount) || 0) > 0.2)
                  if (highDiscount.length > 0) {
                    insights.push({ type: 'info', title: `${highDiscount.map(c => c.channel).join('・')}の値引率が高い`, detail: '特定チャネルの値引きが大きい場合、チャネル別の価格戦略を見直しましょう。' })
                  }

                  // Min price products
                  const nearMinProducts = products.filter(p => {
                    const days = Number(p.days_since_min_price)
                    const currentAvg = Number(p.avg_selling_price) || 0
                    const minPrice = Number(p.min_selling_price) || 0
                    return minPrice > 0 && currentAvg <= minPrice * 1.05 && days > 180
                  })
                  if (nearMinProducts.length > 0) {
                    insights.push({ type: 'info', title: `${nearMinProducts.length}商品が過去最安値水準`, detail: `マーケティングで「○ヶ月ぶり最安値！」と訴求できます。商品テーブルで確認してください。` })
                  }

                  if (insights.length === 0) {
                    insights.push({ type: 'info', title: 'データを確認中', detail: '月を選択してデータを読み込んでください。' })
                  }

                  const iconMap = { success: CheckCircle2, warning: AlertTriangle, danger: TrendingDown, info: Info }
                  const colorMap = {
                    success: 'bg-emerald-50 border-emerald-200/60 text-emerald-800',
                    warning: 'bg-amber-50 border-amber-200/60 text-amber-800',
                    danger: 'bg-red-50 border-red-200/60 text-red-800',
                    info: 'bg-blue-50 border-blue-200/60 text-blue-800',
                  }
                  const iconColorMap = { success: 'text-emerald-600', warning: 'text-amber-600', danger: 'text-red-600', info: 'text-blue-600' }

                  return (
                    <div className="space-y-3">
                      {insights.map((insight) => {
                        const Icon = iconMap[insight.type]
                        return (
                          <div key={insight.title} className={`flex gap-3 p-4 rounded-xl border ${colorMap[insight.type]}`}>
                            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColorMap[insight.type]}`} />
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold">{insight.title}</div>
                              <div className="text-[12px] mt-1 opacity-80 leading-relaxed">{insight.detail}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Product Table */}
        {!loading && products.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-500" />
                商品別 価格分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">商品</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">定価</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">平均販売価格</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] cursor-pointer hover:text-[#3D352F]" onClick={() => toggleSort('revenue')}>
                        売上 <SortIcon k="revenue" />
                      </th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">数量</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">定価/割引</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] cursor-pointer hover:text-[#3D352F]" onClick={() => toggleSort('discount')}>
                        平均値引率 <SortIcon k="discount" />
                      </th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] cursor-pointer hover:text-[#3D352F]" onClick={() => toggleSort('min_price')}>
                        最安値 <SortIcon k="min_price" />
                      </th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">最安値時期</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">チャネル</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p, i) => {
                      const listPrice = Number(p.list_price) || 0
                      const avgPrice = Number(p.avg_selling_price) || 0
                      const minPrice = Number(p.min_selling_price) || 0
                      const avgDiscount = Number(p.avg_discount_rate) || 0
                      const fullQty = Number(p.full_price_quantity) || 0
                      const discQty = Number(p.discounted_quantity) || 0
                      const totalQty = fullQty + discQty
                      const isSelected = selectedProduct === p.product_code

                      return (
                        <React.Fragment key={p.product_code}>
                          <tr
                            className={`border-b border-black/[0.04] cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/50' : i % 2 === 1 ? 'bg-[#FDFCFB]' : ''} hover:bg-[#FAFAF8]`}
                            onClick={() => handleProductClick(p.product_code)}
                          >
                            <td className="px-3 py-2 max-w-[220px]">
                              <div className="text-[12px] font-medium text-[#3D352F] truncate">{p.product_name || p.product_code}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-gray-400">{p.product_code}</span>
                                <MinPriceBadge product={p} />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatCurrency(listPrice)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                              <span className={avgPrice < listPrice ? 'text-red-600 font-medium' : 'text-[#3D352F]'}>
                                {formatCurrency(avgPrice)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-[#3D352F]">{formatCurrency(Number(p.total_revenue) || 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#5A524B]">{formatNumber(Number(p.total_quantity) || 0)}</td>
                            <td className="px-3 py-2 text-right">
                              {totalQty > 0 && (
                                <div className="flex items-center justify-end gap-1">
                                  <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500" style={{ width: `${(fullQty / totalQty) * 100}%` }} />
                                    <div className="h-full bg-red-400" style={{ width: `${(discQty / totalQty) * 100}%` }} />
                                  </div>
                                  <span className="text-[10px] text-gray-400 tabular-nums w-12 text-right">{fullQty}/{discQty}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                              {avgDiscount > 0 ? (
                                <span className={`font-medium ${avgDiscount > 0.3 ? 'text-red-600' : avgDiscount > 0.15 ? 'text-amber-600' : 'text-[#5A524B]'}`}>
                                  {formatPercent(avgDiscount)}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-medium">定価</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F] font-medium">
                              {minPrice > 0 ? formatCurrency(minPrice) : '-'}
                              {minPrice > 0 && listPrice > 0 && minPrice < listPrice && (
                                <span className="text-[10px] text-red-500 ml-1">({formatPercent(1 - minPrice / listPrice)}OFF)</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-[11px] text-[#8A7D72]">
                              {p.min_price_date ? formatDaysSince(Number(p.days_since_min_price)) : '-'}
                            </td>
                            <td className="px-3 py-2 text-[10px] text-gray-500">{p.channels_sold || '-'}</td>
                          </tr>

                          {/* Price History Expansion */}
                          {isSelected && (
                            <tr>
                              <td colSpan={10} className="px-3 py-4 bg-indigo-50/30 border-b border-indigo-100/50">
                                {historyLoading ? (
                                  <div className="flex items-center justify-center py-4">
                                    <Skeleton className="h-4 w-48" />
                                  </div>
                                ) : priceHistory.length > 0 ? (
                                  <div>
                                    <div className="text-[12px] font-semibold text-[#3D352F] mb-3 flex items-center gap-2">
                                      <TrendingDown className="w-4 h-4 text-indigo-500" />
                                      {p.product_name || p.product_code} の価格推移（過去12ヶ月）
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="border-b border-indigo-100">
                                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-indigo-400">月</th>
                                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-indigo-400">チャネル</th>
                                            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-indigo-400">最安値</th>
                                            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-indigo-400">平均価格</th>
                                            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-indigo-400">定価</th>
                                            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-indigo-400">値引率</th>
                                            <th className="text-right px-2 py-1.5 text-[10px] font-semibold text-indigo-400">販売数</th>
                                            <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-indigo-400"></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {priceHistory.map((h) => {
                                            const hListPrice = Number(h.list_price) || 0
                                            const hMinPrice = Number(h.min_price) || 0
                                            const discountRate = hListPrice > 0 && hMinPrice < hListPrice ? 1 - hMinPrice / hListPrice : 0
                                            return (
                                              <tr key={`${h.month}-${h.channel}`} className={`border-b border-indigo-50 ${h.is_historical_low ? 'bg-red-50/50' : ''}`}>
                                                <td className="px-2 py-1.5 text-[11px] text-[#3D352F] font-medium">{h.month}</td>
                                                <td className="px-2 py-1.5 text-[11px] text-[#5A524B]">{h.channel}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-[11px] font-medium text-[#3D352F]">{formatCurrency(hMinPrice)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-[#5A524B]">{formatCurrency(Number(h.avg_price) || 0)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-[#8A7D72]">{formatCurrency(hListPrice)}</td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-[11px]">
                                                  {discountRate > 0 ? (
                                                    <span className="text-red-600 font-medium">{formatPercent(discountRate)}</span>
                                                  ) : '-'}
                                                </td>
                                                <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-[#5A524B]">{formatNumber(Number(h.quantity) || 0)}</td>
                                                <td className="px-2 py-1.5 text-[10px]">
                                                  {h.is_historical_low && (
                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                                                      <Zap className="w-2.5 h-2.5" />最安値
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center text-gray-400 text-sm py-4">価格履歴がありません</div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && products.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-gray-400 text-sm">価格データがありません</p>
              <p className="text-gray-300 text-xs mt-1">受注データがBigQueryにインポートされているか確認してください</p>
            </CardContent>
          </Card>
        )}

        {/* Genre × Month Average Price */}
        {genreLoading ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : genreMonthly.length > 0 && (() => {
          // Extract unique genres and months
          const genres = Array.from(new Set(genreMonthly.map(g => g.category))).sort()
          const months = Array.from(new Set(genreMonthly.map(g => g.order_month))).sort()
          // Build lookup map
          const lookup = new Map<string, GenreMonthlyItem>()
          for (const g of genreMonthly) lookup.set(`${g.category}|${g.order_month}`, g)

          // Top genres by total revenue
          const genreRevenue = new Map<string, number>()
          for (const g of genreMonthly) genreRevenue.set(g.category, (genreRevenue.get(g.category) || 0) + (Number(g.revenue) || 0))
          const topGenres = genres.sort((a, b) => (genreRevenue.get(b) || 0) - (genreRevenue.get(a) || 0)).slice(0, 15)

          // Color scale for discount rate heatmap
          const getDiscountColor = (rate: number) => {
            if (rate <= 0) return 'bg-emerald-50 text-emerald-700'
            if (rate < 0.1) return 'bg-yellow-50 text-yellow-700'
            if (rate < 0.2) return 'bg-orange-50 text-orange-700'
            if (rate < 0.3) return 'bg-red-50 text-red-700'
            return 'bg-red-100 text-red-800'
          }

          const displayGenres = selectedGenre ? [selectedGenre] : topGenres

          return (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-purple-500" />
                    ジャンル × 月 平均価格推移
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedGenre && (
                      <button
                        onClick={() => setSelectedGenre(null)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors font-medium"
                      >
                        全ジャンル表示
                      </button>
                    )}
                    <span className="text-[10px] text-gray-400">過去12ヶ月 / クリックで絞り込み</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] sticky left-0 bg-[#FAFAF8] min-w-[140px]">ジャンル</th>
                        {months.map(m => (
                          <th key={m} className="text-center px-2 py-2.5 text-[10px] font-semibold text-[#8A7D72] min-w-[90px]">
                            {m.split('-')[1]}月
                          </th>
                        ))}
                        <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] min-w-[80px]">合計売上</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayGenres.map((genre, gi) => {
                        const totalRev = genreRevenue.get(genre) || 0
                        return (
                          <tr
                            key={genre}
                            className={`border-b border-black/[0.04] cursor-pointer transition-colors ${
                              selectedGenre === genre ? 'bg-purple-50/50' : gi % 2 === 1 ? 'bg-[#FDFCFB]' : ''
                            } hover:bg-[#FAFAF8]`}
                            onClick={() => setSelectedGenre(selectedGenre === genre ? null : genre)}
                          >
                            <td className="px-3 py-2 text-[12px] font-medium text-[#3D352F] sticky left-0 bg-inherit">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                                <span className="truncate">{genre}</span>
                              </div>
                            </td>
                            {months.map(m => {
                              const item = lookup.get(`${genre}|${m}`)
                              if (!item) return <td key={m} className="px-2 py-2 text-center text-[10px] text-gray-300">-</td>

                              const avgPrice = Number(item.avg_price) || 0
                              const discountRate = Number(item.avg_discount_rate) || 0
                              const qty = Number(item.quantity) || 0

                              return (
                                <td key={m} className="px-1.5 py-1.5">
                                  <div className={`rounded-lg px-2 py-1.5 text-center ${getDiscountColor(discountRate)}`}>
                                    <div className="text-[11px] font-bold tabular-nums">{formatCurrency(avgPrice)}</div>
                                    <div className="flex items-center justify-center gap-1 mt-0.5">
                                      {discountRate > 0 ? (
                                        <span className="text-[9px] font-medium">
                                          {formatPercent(discountRate)}OFF
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-medium">定価</span>
                                      )}
                                    </div>
                                    <div className="text-[8px] opacity-60 mt-0.5">{qty}点</div>
                                  </div>
                                </td>
                              )
                            })}
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] font-semibold text-[#3D352F]">
                              {formatCurrency(totalRev)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
                  <span>値引率:</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" />0%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-200" />&lt;10%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-50 border border-orange-200" />&lt;20%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" />&lt;30%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" />30%+</span>
                </div>

                {/* Expanded genre detail */}
                {selectedGenre && (() => {
                  const genreItems = genreMonthly
                    .filter(g => g.category === selectedGenre)
                    .sort((a, b) => a.order_month.localeCompare(b.order_month))

                  if (genreItems.length === 0) return null

                  // Find the month with lowest avg price
                  const lowestMonth = genreItems.reduce((prev, curr) =>
                    (Number(curr.avg_price) || Infinity) < (Number(prev.avg_price) || Infinity) ? curr : prev
                  )
                  // Find the month with highest discount
                  const highestDiscount = genreItems.reduce((prev, curr) =>
                    (Number(curr.avg_discount_rate) || 0) > (Number(prev.avg_discount_rate) || 0) ? curr : prev
                  )

                  return (
                    <div className="mt-4 p-4 rounded-xl bg-purple-50/40 border border-purple-100/60">
                      <div className="text-[13px] font-semibold text-[#3D352F] mb-3">
                        「{selectedGenre}」の詳細
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-white border border-purple-100/60">
                          <div className="text-[10px] text-gray-500">最安月</div>
                          <div className="text-[14px] font-bold text-[#3D352F] mt-1">
                            {lowestMonth.order_month.split('-')[1]}月
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            平均 {formatCurrency(Number(lowestMonth.avg_price) || 0)}
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-purple-100/60">
                          <div className="text-[10px] text-gray-500">最大値引き月</div>
                          <div className="text-[14px] font-bold text-red-600 mt-1">
                            {highestDiscount.order_month.split('-')[1]}月
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            平均 {formatPercent(Number(highestDiscount.avg_discount_rate) || 0)}OFF
                          </div>
                        </div>
                        <div className="p-3 rounded-lg bg-white border border-purple-100/60">
                          <div className="text-[10px] text-gray-500">年間合計</div>
                          <div className="text-[14px] font-bold text-[#3D352F] mt-1">
                            {formatCurrency(genreItems.reduce((s, g) => s + (Number(g.revenue) || 0), 0))}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {formatNumber(genreItems.reduce((s, g) => s + (Number(g.quantity) || 0), 0))}点
                          </div>
                        </div>
                      </div>

                      {/* Mini bar chart visualization */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-gray-400 font-medium">月別平均価格（バー=定価比率）</div>
                        {genreItems.map(g => {
                          const avgPrice = Number(g.avg_price) || 0
                          const listPrice = Number(g.avg_list_price) || 0
                          const ratio = listPrice > 0 ? Math.min(avgPrice / listPrice, 1) : 1
                          const fullRate = Number(g.full_price_rate) || 0
                          return (
                            <div key={g.order_month} className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-8 tabular-nums">{g.order_month.split('-')[1]}月</span>
                              <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden relative">
                                <div
                                  className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded transition-all duration-500"
                                  style={{ width: `${ratio * 100}%` }}
                                />
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white mix-blend-difference">
                                  {formatCurrency(avgPrice)}
                                </span>
                              </div>
                              <span className="text-[9px] tabular-nums w-14 text-right">
                                <span className={fullRate >= 0.7 ? 'text-emerald-600' : fullRate >= 0.4 ? 'text-amber-600' : 'text-red-600'}>
                                  定価{formatPercent(fullRate)}
                                </span>
                              </span>
                              <span className="text-[9px] text-gray-400 tabular-nums w-10 text-right">{Number(g.quantity) || 0}点</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )
        })()}
      </div>
    </>
  )
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingPageContent />
    </Suspense>
  )
}
