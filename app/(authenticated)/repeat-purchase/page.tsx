'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import GroupTabs from '@/components/layout/GroupTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumber, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { UserPlus, Users, Crown, TrendingUp } from 'lucide-react'

interface Segment { customer_type: string; customer_count: number; order_count: number; revenue: number; avg_order_value: number; avg_items_per_order: number }
interface Trend { order_month: string; new_customers: number; repeat_customers: number; total_customers: number; repeat_rate: number; repeat_revenue_pct: number }

function RepeatContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `repeat-v1:${month}:${brandParam}`

  const cached = getCached<{ segments: Segment[]; trend: Trend[] }>(cacheKey)
  const [segments, setSegments] = useState<Segment[]>(cached?.segments ?? [])
  const [trend, setTrend] = useState<Trend[]>(cached?.trend ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const res = await fetch(`/api/repeat-purchase?month=${month}${bParam}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current && data) {
        setSegments(Array.isArray(data.segments) ? data.segments : [])
        setTrend(Array.isArray(data.trend) ? data.trend : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCustomers = segments.reduce((s, seg) => s + (Number(seg.customer_count) || 0), 0)
  const totalRevenue = segments.reduce((s, seg) => s + (Number(seg.revenue) || 0), 0)
  const newSeg = segments.find(s => s.customer_type === '新規')
  const repeatSegs = segments.filter(s => s.customer_type !== '新規')
  const repeatRevenue = repeatSegs.reduce((s, seg) => s + (Number(seg.revenue) || 0), 0)

  const iconMap: Record<string, React.ReactNode> = {
    '新規': <UserPlus className="w-5 h-5 text-blue-500" />,
    'リピート(2-3回)': <Users className="w-5 h-5 text-amber-500" />,
    'ロイヤル(4回以上)': <Crown className="w-5 h-5 text-purple-500" />,
  }
  const colorMap: Record<string, string> = {
    '新規': 'from-blue-400 to-blue-500',
    'リピート(2-3回)': 'from-amber-400 to-amber-500',
    'ロイヤル(4回以上)': 'from-purple-400 to-purple-500',
  }

  return (
    <>
      <Header title="新規 vs リピート購買分析" subtitle="顧客セグメント別の購買行動" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />
        <GroupTabs />

        {loading ? (
          <div className="grid grid-cols-3 gap-4">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
        ) : segments.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">購入顧客数</div>
                  <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(totalCustomers)}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">リピーター売上比率</div>
                  <div className="text-3xl font-bold text-purple-600 tabular-nums mt-2">{totalRevenue > 0 ? formatPercent(repeatRevenue / totalRevenue) : '-'}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(repeatRevenue)}</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">新規顧客</div>
                  <div className="text-3xl font-bold text-blue-600 tabular-nums mt-2">{formatNumber(Number(newSeg?.customer_count) || 0)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">平均注文額 {formatCurrency(Number(newSeg?.avg_order_value) || 0)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Segment cards */}
            <div className="grid grid-cols-3 gap-4">
              {segments.map(seg => {
                const count = Number(seg.customer_count) || 0
                const rev = Number(seg.revenue) || 0
                return (
                  <Card key={seg.customer_type} className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 mb-3">
                        {iconMap[seg.customer_type] || <Users className="w-5 h-5 text-gray-400" />}
                        <span className="text-[13px] font-bold text-[#3D352F]">{seg.customer_type}</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">顧客数</span>
                          <span className="font-bold text-[#3D352F]">{formatNumber(count)} ({totalCustomers > 0 ? formatPercent(count / totalCustomers) : '-'})</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">売上</span>
                          <span className="font-bold text-[#3D352F]">{formatCurrency(rev)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">平均注文額</span>
                          <span className="font-bold text-[#3D352F]">{formatCurrency(Number(seg.avg_order_value) || 0)}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-gray-500">平均商品数/注文</span>
                          <span className="font-bold text-[#3D352F]">{(Number(seg.avg_items_per_order) || 0).toFixed(1)}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                          <div className={`h-full bg-gradient-to-r ${colorMap[seg.customer_type] || 'from-gray-400 to-gray-500'} rounded-full`} style={{ width: `${totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-400 text-right">売上シェア {totalRevenue > 0 ? formatPercent(rev / totalRevenue) : '-'}</div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Monthly trend */}
            {trend.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />月別 新規/リピート推移
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">月</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">合計顧客</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">新規</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">リピート</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">リピート率</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">リピート売上比</th>
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] w-40">構成</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trend.map((t, i) => {
                          const total = Number(t.total_customers) || 1
                          const newPct = (Number(t.new_customers) || 0) / total
                          return (
                            <tr key={t.order_month} className={`border-b border-black/[0.04] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                              <td className="px-3 py-2 text-[12px] font-medium text-[#3D352F]">{t.order_month}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F]">{formatNumber(Number(t.total_customers) || 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[12px] text-blue-600">{formatNumber(Number(t.new_customers) || 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[12px] text-purple-600">{formatNumber(Number(t.repeat_customers) || 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[12px] font-medium">{formatPercent(Number(t.repeat_rate) || 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[12px] text-purple-600 font-medium">{formatPercent(Number(t.repeat_revenue_pct) || 0)}</td>
                              <td className="px-3 py-2">
                                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                                  <div className="h-full bg-blue-400" style={{ width: `${newPct * 100}%` }} />
                                  <div className="h-full bg-purple-400" style={{ width: `${(1 - newPct) * 100}%` }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
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

export default function RepeatPurchasePage() {
  return <Suspense><RepeatContent /></Suspense>
}
