'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import FilterBar from '@/components/filters/FilterBar'
import { formatCurrency, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Sun, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react'

interface CategoryTrend { year: string; month_num: number; category: string; revenue: number; quantity: number; order_count: number }
interface MonthlyTrend { order_month: string; revenue: number; quantity: number; order_count: number; yoy_revenue: number | null }

const MONTH_NAMES = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

function SeasonalityContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const brand = urlBrand || ''
  const cacheKey = `seasonality-v1:${brand}`

  const cached = getCached<{ categoryTrend: CategoryTrend[]; monthlyTrend: MonthlyTrend[] }>(cacheKey)
  const [categoryTrend, setCategoryTrend] = useState<CategoryTrend[]>(cached?.categoryTrend ?? [])
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>(cached?.monthlyTrend ?? [])
  const [loading, setLoading] = useState(!cached)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brand ? `?brand=${brand}` : ''
      const res = await fetch(`/api/seasonality${bParam}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current && data) {
        setCategoryTrend(Array.isArray(data.categoryTrend) ? data.categoryTrend : [])
        setMonthlyTrend(Array.isArray(data.monthlyTrend) ? data.monthlyTrend : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [brand, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  // Build category × month matrix
  const categories = Array.from(new Set(categoryTrend.filter(c => c.category !== 'その他').map(c => c.category)))
  const catRevenue = new Map<string, number>()
  for (const c of categoryTrend) catRevenue.set(c.category, (catRevenue.get(c.category) || 0) + (Number(c.revenue) || 0))
  const topCategories = categories.sort((a, b) => (catRevenue.get(b) || 0) - (catRevenue.get(a) || 0)).slice(0, 10)
  const years = Array.from(new Set(categoryTrend.map(c => c.year))).sort()

  const catLookup = new Map<string, number>()
  for (const c of categoryTrend) {
    const key = `${c.category}|${c.year}|${c.month_num}`
    catLookup.set(key, (catLookup.get(key) || 0) + (Number(c.revenue) || 0))
  }

  const maxMonthlyRev = Math.max(...monthlyTrend.map(m => Number(m.revenue) || 0), 1)

  // Simple forecast: next month = same month last year * growth factor
  const lastMonth = monthlyTrend[monthlyTrend.length - 1]
  const forecast = (() => {
    if (!lastMonth || monthlyTrend.length < 13) return null
    const lastMonthDate = lastMonth.order_month
    const [y, m] = lastMonthDate.split('-').map(Number)
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`
    // Same month last year
    const sameMonthLY = monthlyTrend.find(t => {
      const [ty, tm] = t.order_month.split('-').map(Number)
      return tm === nextM && ty === nextY - 1
    })
    if (!sameMonthLY) return null
    // Average YoY growth over recent months
    const recentWithYoy = monthlyTrend.filter(t => t.yoy_revenue && Number(t.yoy_revenue) > 0).slice(-6)
    const avgGrowth = recentWithYoy.length > 0
      ? recentWithYoy.reduce((s, t) => s + (Number(t.revenue) || 0) / (Number(t.yoy_revenue) || 1), 0) / recentWithYoy.length
      : 1
    return {
      month: nextMonthStr,
      predicted: (Number(sameMonthLY.revenue) || 0) * avgGrowth,
      lastYearSameMonth: Number(sameMonthLY.revenue) || 0,
      growthFactor: avgGrowth,
    }
  })()

  return (
    <>
      <Header title="季節性予測" subtitle="カテゴリ別の季節パターン・来月予測" />
      <div className="p-8 space-y-6">
        <FilterBar month={getCurrentMonth()} onMonthChange={() => {}} brand={brand || '全て'} onBrandChange={() => {}} hideBrand={!!urlBrand} hideMonth />

        {loading ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : monthlyTrend.length > 0 ? (
          <>
            {/* Summary KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">分析期間</div>
                  <div className="text-xl font-bold text-[#3D352F] tabular-nums mt-2">{monthlyTrend.length}ヶ月</div>
                  <div className="text-[11px] text-gray-400 mt-1">{monthlyTrend[0]?.order_month} 〜 {monthlyTrend[monthlyTrend.length - 1]?.order_month}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">期間合計売上</div>
                  <div className="text-xl font-bold text-[#3D352F] tabular-nums mt-2">{formatCurrency(monthlyTrend.reduce((s, m) => s + (Number(m.revenue) || 0), 0))}</div>
                  <div className="text-[11px] text-gray-400 mt-1">月平均 {formatCurrency(monthlyTrend.reduce((s, m) => s + (Number(m.revenue) || 0), 0) / monthlyTrend.length)}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">最高売上月</div>
                  {(() => {
                    const best = monthlyTrend.reduce((prev, curr) => (Number(curr.revenue) || 0) > (Number(prev.revenue) || 0) ? curr : prev)
                    return (
                      <>
                        <div className="text-xl font-bold text-emerald-600 tabular-nums mt-2">{formatCurrency(Number(best.revenue) || 0)}</div>
                        <div className="text-[11px] text-gray-400 mt-1">{best.order_month}</div>
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">カテゴリ数</div>
                  <div className="text-xl font-bold text-[#3D352F] tabular-nums mt-2">{topCategories.length}</div>
                  <div className="text-[11px] text-gray-400 mt-1">上位カテゴリ分析</div>
                </CardContent>
              </Card>
            </div>

            {/* Forecast card */}
            {forecast && (
              <Card className="border-0 shadow-sm bg-gradient-to-r from-amber-50/30 to-orange-50/30">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Sun className="w-6 h-6 text-amber-500" />
                    <span className="text-[15px] font-bold text-[#3D352F]">来月予測: {forecast.month}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-6 mt-3">
                    <div>
                      <div className="text-[11px] text-gray-500">予測売上</div>
                      <div className="text-2xl font-bold text-[#3D352F] tabular-nums mt-1">{formatCurrency(forecast.predicted)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">前年同月実績</div>
                      <div className="text-2xl font-bold text-[#8A7D72] tabular-nums mt-1">{formatCurrency(forecast.lastYearSameMonth)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">成長率</div>
                      <div className={`text-2xl font-bold tabular-nums mt-1 flex items-center gap-1 ${forecast.growthFactor >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {forecast.growthFactor >= 1 ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                        {formatPercent(Math.abs(forecast.growthFactor - 1))}
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-3">※ 前年同月 × 直近6ヶ月の平均成長率で算出</div>
                </CardContent>
              </Card>
            )}

            {/* Monthly trend */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />月別売上推移（過去24ヶ月）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-48">
                  {monthlyTrend.map(m => {
                    const rev = Number(m.revenue) || 0
                    const yoy = Number(m.yoy_revenue) || 0
                    const pct = rev / maxMonthlyRev
                    const isGrowth = yoy > 0 && rev >= yoy
                    return (
                      <div key={m.order_month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                        {yoy > 0 && (
                          <div className="absolute -top-5 text-[8px] font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: isGrowth ? '#059669' : '#dc2626' }}>
                            {isGrowth ? '+' : ''}{formatPercent((rev - yoy) / yoy)}
                          </div>
                        )}
                        <div
                          className={`w-full rounded-t transition-all ${isGrowth ? 'bg-blue-400' : yoy > 0 ? 'bg-red-300' : 'bg-blue-300'}`}
                          style={{ height: `${Math.max(pct * 100, 2)}%` }}
                          title={`${m.order_month}: ${formatCurrency(rev)}`}
                        />
                        <span className="text-[7px] text-gray-400 mt-1 -rotate-45 origin-left">{m.order_month.slice(2)}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-[9px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400" />前年比+</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-300" />前年比-</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-300" />前年データなし</span>
                </div>
              </CardContent>
            </Card>

            {/* Category × Month heatmap */}
            {topCategories.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                      <Sun className="w-4 h-4 text-orange-500" />カテゴリ別 季節パターン
                    </CardTitle>
                    {selectedCategory && (
                      <button onClick={() => setSelectedCategory(null)} className="text-[11px] px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 font-medium">
                        全カテゴリ表示
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] sticky left-0 bg-[#FAFAF8]">カテゴリ</th>
                          {Array.from({ length: 12 }, (_, i) => (
                            <th key={i} className="text-center px-1 py-2.5 text-[10px] font-semibold text-[#8A7D72]">{MONTH_NAMES[i + 1]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCategory ? [selectedCategory] : topCategories).map((cat, ci) => {
                          // Get latest year data
                          const latestYear = years[years.length - 1]
                          const monthValues = Array.from({ length: 12 }, (_, i) => catLookup.get(`${cat}|${latestYear}|${i + 1}`) || 0)
                          const maxVal = Math.max(...monthValues, 1)
                          return (
                            <tr key={cat} className={`border-b border-black/[0.04] cursor-pointer hover:bg-[#FAFAF8] ${ci % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}
                              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}>
                              <td className="px-3 py-2 text-[12px] font-medium text-[#3D352F] sticky left-0 bg-inherit">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                                  {cat}
                                </div>
                              </td>
                              {monthValues.map((val, mi) => {
                                const intensity = val / maxVal
                                const bgColor = val === 0 ? 'bg-gray-50' :
                                  intensity >= 0.8 ? 'bg-orange-400 text-white' :
                                  intensity >= 0.6 ? 'bg-orange-300' :
                                  intensity >= 0.4 ? 'bg-orange-200' :
                                  intensity >= 0.2 ? 'bg-orange-100' : 'bg-orange-50'
                                return (
                                  <td key={mi} className="px-0.5 py-1">
                                    <div className={`rounded px-1 py-1 text-center text-[9px] font-medium ${bgColor}`}>
                                      {val > 0 ? formatCurrency(val) : '-'}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Year-over-year comparison for selected category */}
                  {selectedCategory && years.length >= 2 && (
                    <div className="mt-4 p-4 rounded-xl bg-orange-50/40 border border-orange-100/60">
                      <div className="text-[13px] font-semibold text-[#3D352F] mb-3">「{selectedCategory}」年比較</div>
                      <div className="space-y-1.5">
                        {years.map(year => {
                          const monthValues = Array.from({ length: 12 }, (_, i) => catLookup.get(`${selectedCategory}|${year}|${i + 1}`) || 0)
                          const yearTotal = monthValues.reduce((s, v) => s + v, 0)
                          const maxAll = Math.max(...years.flatMap(y => Array.from({ length: 12 }, (_, i) => catLookup.get(`${selectedCategory}|${y}|${i + 1}`) || 0)), 1)
                          return (
                            <div key={year} className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-[#3D352F] w-10">{year}</span>
                              <div className="flex-1 flex items-end gap-0.5 h-8">
                                {monthValues.map((val, mi) => (
                                  <div key={mi} className="flex-1 bg-orange-200 rounded-t-sm" style={{ height: `${Math.max((val / maxAll) * 100, val > 0 ? 4 : 0)}%` }} title={`${mi + 1}月: ${formatCurrency(val)}`} />
                                ))}
                              </div>
                              <span className="text-[10px] text-gray-500 w-20 text-right">{formatCurrency(yearTotal)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card><CardContent className="p-12 text-center text-gray-400 text-sm">データがありません</CardContent></Card>
        )}
      </div>
    </>
  )
}

export default function SeasonalityPage() {
  return <Suspense><SeasonalityContent /></Suspense>
}
