'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
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
