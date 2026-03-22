'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumber, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Clock, Calendar } from 'lucide-react'

interface HeatmapItem { day_of_week: number; hour: number; order_count: number; revenue: number }
interface DaySummary { day_of_week: number; order_count: number; revenue: number; avg_order_value: number }
interface PeakHour { hour: number; order_count: number; revenue: number }

const DAY_NAMES = ['', '日', '月', '火', '水', '木', '金', '土']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function TimeContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `time-v1:${month}:${brandParam}`

  const cached = getCached<{ heatmap: HeatmapItem[]; dailySummary: DaySummary[]; peakHours: PeakHour[] }>(cacheKey)
  const [heatmap, setHeatmap] = useState<HeatmapItem[]>(cached?.heatmap ?? [])
  const [dailySummary, setDailySummary] = useState<DaySummary[]>(cached?.dailySummary ?? [])
  const [peakHours, setPeakHours] = useState<PeakHour[]>(cached?.peakHours ?? [])
  const [loading, setLoading] = useState(!cached)
  const [mode, setMode] = useState<'orders' | 'revenue'>('orders')
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const res = await fetch(`/api/time-analysis?month=${month}${bParam}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current && data) {
        setHeatmap(Array.isArray(data.heatmap) ? data.heatmap : [])
        setDailySummary(Array.isArray(data.dailySummary) ? data.dailySummary : [])
        setPeakHours(Array.isArray(data.peakHours) ? data.peakHours : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  // Build heatmap grid
  const heatmapLookup = new Map<string, HeatmapItem>()
  for (const h of heatmap) heatmapLookup.set(`${h.day_of_week}-${h.hour}`, h)
  const maxOrders = Math.max(...heatmap.map(h => Number(h.order_count) || 0), 1)
  const maxRevenue = Math.max(...heatmap.map(h => Number(h.revenue) || 0), 1)

  const getHeatColor = (value: number, max: number) => {
    const intensity = Math.min(value / max, 1)
    if (intensity === 0) return 'bg-gray-50'
    if (intensity < 0.2) return 'bg-blue-50'
    if (intensity < 0.4) return 'bg-blue-100'
    if (intensity < 0.6) return 'bg-blue-200'
    if (intensity < 0.8) return 'bg-blue-300'
    return 'bg-blue-500 text-white'
  }

  const maxHourOrders = Math.max(...peakHours.map(h => Number(h.order_count) || 0), 1)

  return (
    <>
      <Header title="曜日×時間帯分析" subtitle="注文の曜日・時間帯パターン" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />

        {loading ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : heatmap.length > 0 ? (
          <>
            {/* KPI Summary */}
            {(() => {
              const totalOrders = dailySummary.reduce((s, d) => s + (Number(d.order_count) || 0), 0)
              const totalRev = dailySummary.reduce((s, d) => s + (Number(d.revenue) || 0), 0)
              const peakDay = dailySummary.length > 0 ? dailySummary.reduce((prev, curr) => (Number(curr.order_count) || 0) > (Number(prev.order_count) || 0) ? curr : prev) : null
              const peakH = peakHours.length > 0 ? peakHours.reduce((prev, curr) => (Number(curr.order_count) || 0) > (Number(prev.order_count) || 0) ? curr : prev) : null
              return (
                <div className="grid grid-cols-4 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計注文数</div>
                      <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(totalOrders)}</div>
                      <div className="text-[11px] text-gray-400 mt-1">当月合計</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計売上</div>
                      <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatCurrency(totalRev)}</div>
                      <div className="text-[11px] text-gray-400 mt-1">AOV {totalOrders > 0 ? formatCurrency(totalRev / totalOrders) : '-'}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">ピーク曜日</div>
                      <div className="text-3xl font-bold text-green-600 mt-2">{peakDay ? DAY_NAMES[peakDay.day_of_week] + '曜日' : '-'}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{peakDay ? `${formatNumber(Number(peakDay.order_count) || 0)}件` : ''}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">ピーク時間帯</div>
                      <div className="text-3xl font-bold text-orange-600 mt-2">{peakH ? `${peakH.hour}時台` : '-'}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{peakH ? `${formatNumber(Number(peakH.order_count) || 0)}件` : ''}</div>
                    </CardContent>
                  </Card>
                </div>
              )
            })()}

            {/* Heatmap */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />曜日 × 時間帯 ヒートマップ
                  </CardTitle>
                  <div className="flex gap-1.5">
                    {(['orders', 'revenue'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${mode === m ? 'bg-[#3D352F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {m === 'orders' ? '注文数' : '売上'}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="w-10 text-[10px] text-[#8A7D72] font-semibold"></th>
                        {HOURS.map(h => (
                          <th key={h} className="text-center text-[9px] text-[#8A7D72] font-medium px-0.5 py-1">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6, 7].map(day => (
                        <tr key={day}>
                          <td className={`text-[11px] font-semibold px-1 py-0.5 ${day === 1 || day === 7 ? 'text-red-500' : 'text-[#3D352F]'}`}>
                            {DAY_NAMES[day]}
                          </td>
                          {HOURS.map(hour => {
                            const item = heatmapLookup.get(`${day}-${hour}`)
                            const value = mode === 'orders' ? (Number(item?.order_count) || 0) : (Number(item?.revenue) || 0)
                            const max = mode === 'orders' ? maxOrders : maxRevenue
                            return (
                              <td key={hour} className="px-0.5 py-0.5">
                                <div
                                  className={`w-full aspect-square rounded-sm flex items-center justify-center text-[8px] font-medium ${getHeatColor(value, max)}`}
                                  title={`${DAY_NAMES[day]}${hour}時: ${mode === 'orders' ? `${value}件` : formatCurrency(value)}`}
                                >
                                  {value > 0 ? (mode === 'orders' ? value : '') : ''}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-3 text-[9px] text-gray-400">
                  <span>少</span>
                  {['bg-gray-50', 'bg-blue-50', 'bg-blue-100', 'bg-blue-200', 'bg-blue-300', 'bg-blue-500'].map(c => (
                    <span key={c} className={`w-4 h-4 rounded-sm ${c}`} />
                  ))}
                  <span>多</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-6">
              {/* Day of week */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-green-500" />曜日別 注文数・売上
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dailySummary.map(d => {
                    const maxDayRev = Math.max(...dailySummary.map(dd => Number(dd.revenue) || 0), 1)
                    const rev = Number(d.revenue) || 0
                    const orders = Number(d.order_count) || 0
                    return (
                      <div key={d.day_of_week} className="flex items-center gap-3">
                        <span className={`text-[12px] font-bold w-6 text-center ${d.day_of_week === 1 || d.day_of_week === 7 ? 'text-red-500' : 'text-[#3D352F]'}`}>
                          {DAY_NAMES[d.day_of_week]}
                        </span>
                        <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                          <div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-lg transition-all" style={{ width: `${(rev / maxDayRev) * 100}%` }} />
                          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white mix-blend-difference">
                            {formatCurrency(rev)} / {orders}件
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 w-16 text-right">AOV {formatCurrency(Number(d.avg_order_value) || 0)}</span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              {/* Peak hours */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />時間帯別 注文分布
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-40">
                    {peakHours.map(h => {
                      const orders = Number(h.order_count) || 0
                      const pct = orders / maxHourOrders
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            className={`w-full rounded-t-sm transition-all ${pct > 0.7 ? 'bg-orange-500' : pct > 0.4 ? 'bg-orange-300' : 'bg-orange-200'}`}
                            style={{ height: `${Math.max(pct * 100, 2)}%` }}
                            title={`${h.hour}時: ${orders}件 / ${formatCurrency(Number(h.revenue) || 0)}`}
                          />
                          <span className="text-[8px] text-gray-400 mt-1">{h.hour}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="text-[10px] text-gray-400 text-center mt-2">時</div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card><CardContent className="p-12 text-center text-gray-400 text-sm">データがありません</CardContent></Card>
        )}
      </div>
    </>
  )
}

export default function TimeAnalysisPage() {
  return <Suspense><TimeContent /></Suspense>
}
