'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumber, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Store, TrendingUp } from 'lucide-react'

interface ChannelData {
  channel: string
  revenue: number
  cost: number
  gross_profit: number
  gross_margin: number
  order_count: number
  avg_order_value: number
  avg_unit_price: number
  quantity: number
}

function ChannelContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `channel-prof-v1:${month}:${brandParam}`

  const cached = getCached<ChannelData[]>(cacheKey)
  const [channels, setChannels] = useState<ChannelData[]>(cached ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const res = await fetch(`/api/channel-profitability?month=${month}${bParam}`)
      const data = res.ok ? await res.json() : []
      if (mountedRef.current) {
        const arr = Array.isArray(data) ? data : []
        setChannels(arr)
        setCache(cacheKey, arr)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = channels.reduce((s, c) => s + (Number(c.revenue) || 0), 0)
  const totalProfit = channels.reduce((s, c) => s + (Number(c.gross_profit) || 0), 0)
  const maxRevenue = Math.max(...channels.map(c => Number(c.revenue) || 0), 1)

  return (
    <>
      <Header title="チャネル収益性分析" subtitle="チャネル別 売上・粗利・粗利率の比較" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />

        {loading ? (
          <div className="grid grid-cols-3 gap-4">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
        ) : channels.length > 0 ? (
          <>
            <div className="grid grid-cols-5 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計売上</div>
                  <div className="text-2xl font-bold text-[#3D352F] tabular-nums mt-2">{formatCurrency(totalRevenue)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{channels.length}チャネル</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計粗利</div>
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums mt-2">{formatCurrency(totalProfit)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">粗利率 {totalRevenue > 0 ? formatPercent(totalProfit / totalRevenue) : '-'}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計注文数</div>
                  <div className="text-2xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(channels.reduce((s, c) => s + (Number(c.order_count) || 0), 0))}</div>
                  <div className="text-[11px] text-gray-400 mt-1">全チャネル合計</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">平均注文額</div>
                  {(() => {
                    const totalOrders = channels.reduce((s, c) => s + (Number(c.order_count) || 0), 0)
                    return (
                      <>
                        <div className="text-2xl font-bold text-blue-600 tabular-nums mt-2">{totalOrders > 0 ? formatCurrency(totalRevenue / totalOrders) : '-'}</div>
                        <div className="text-[11px] text-gray-400 mt-1">AOV</div>
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">最高粗利率</div>
                  {(() => {
                    const best = channels.reduce((prev, curr) => (Number(curr.gross_margin) || 0) > (Number(prev.gross_margin) || 0) ? curr : prev)
                    return (
                      <>
                        <div className="text-2xl font-bold text-[#3D352F] mt-2">{best.channel}</div>
                        <div className="text-[11px] text-emerald-600 mt-1 font-medium">{formatPercent(Number(best.gross_margin) || 0)}</div>
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-500" />チャネル別 収益比較
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {channels.map(ch => {
                  const rev = Number(ch.revenue) || 0
                  const profit = Number(ch.gross_profit) || 0
                  const margin = Number(ch.gross_margin) || 0
                  return (
                    <div key={ch.channel} className="p-4 rounded-xl border border-gray-100/60 bg-gradient-to-r from-gray-50/50 to-white">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[14px] font-bold text-[#3D352F]">{ch.channel}</span>
                        <div className="flex items-center gap-4 text-[11px]">
                          <span className="text-gray-500">売上 <span className="font-bold text-[#3D352F]">{formatCurrency(rev)}</span></span>
                          <span className="text-gray-500">粗利 <span className="font-bold text-emerald-600">{formatCurrency(profit)}</span></span>
                          <span className={`font-bold px-2 py-0.5 rounded-full ${margin >= 0.5 ? 'bg-emerald-50 text-emerald-700' : margin >= 0.3 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                            粗利率 {formatPercent(margin)}
                          </span>
                        </div>
                      </div>
                      {/* Revenue bar */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                          <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-lg transition-all duration-500" style={{ width: `${(rev / maxRevenue) * 100}%` }} />
                          <div className="absolute inset-y-0 flex items-center" style={{ left: `${Math.min((profit / maxRevenue) * 100, (rev / maxRevenue) * 100)}%` }}>
                            <div className="w-0.5 h-full bg-emerald-500" />
                          </div>
                        </div>
                        <span className="text-[10px] text-gray-400 w-12 text-right">{totalRevenue > 0 ? formatPercent(rev / totalRevenue) : '-'}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-[10px] text-gray-500">
                        <div>注文数 <span className="font-medium text-[#3D352F]">{formatNumber(Number(ch.order_count) || 0)}</span></div>
                        <div>平均注文額 <span className="font-medium text-[#3D352F]">{formatCurrency(Number(ch.avg_order_value) || 0)}</span></div>
                        <div>平均単価 <span className="font-medium text-[#3D352F]">{formatCurrency(Number(ch.avg_unit_price) || 0)}</span></div>
                        <div>販売点数 <span className="font-medium text-[#3D352F]">{formatNumber(Number(ch.quantity) || 0)}</span></div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Insights */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#C4A882]" />チャネル戦略インサイト
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const insights: { color: string; text: string }[] = []
                  const sorted = [...channels].sort((a, b) => (Number(b.gross_margin) || 0) - (Number(a.gross_margin) || 0))
                  if (sorted.length >= 2) {
                    const best = sorted[0]
                    const worst = sorted[sorted.length - 1]
                    insights.push({ color: 'bg-emerald-50 border-emerald-200 text-emerald-800', text: `粗利率が最も高いのは「${best.channel}」(${formatPercent(Number(best.gross_margin) || 0)})。このチャネルの拡大が利益最大化に直結します。` })
                    if ((Number(worst.gross_margin) || 0) < 0.3) {
                      insights.push({ color: 'bg-red-50 border-red-200 text-red-800', text: `「${worst.channel}」の粗利率が${formatPercent(Number(worst.gross_margin) || 0)}と低水準。手数料・値引きの見直しを検討してください。` })
                    }
                  }
                  const highAov = channels.filter(c => (Number(c.avg_order_value) || 0) > (totalRevenue / channels.reduce((s, c2) => s + (Number(c2.order_count) || 0), 0)) * 1.3)
                  if (highAov.length > 0) {
                    insights.push({ color: 'bg-blue-50 border-blue-200 text-blue-800', text: `${highAov.map(c => c.channel).join('・')}は平均注文額が高い。高単価商品の訴求に適したチャネルです。` })
                  }
                  return insights.map(ins => (
                    <div key={ins.text} className={`p-4 rounded-xl border text-[12px] leading-relaxed ${ins.color}`}>{ins.text}</div>
                  ))
                })()}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="p-12 text-center text-gray-400 text-sm">データがありません</CardContent></Card>
        )}
      </div>
    </>
  )
}

export default function ChannelProfitabilityPage() {
  return <Suspense><ChannelContent /></Suspense>
}
