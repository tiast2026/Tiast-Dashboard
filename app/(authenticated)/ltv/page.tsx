'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import FilterBar from '@/components/filters/FilterBar'
import { formatCurrency, formatNumber, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Crown, Users, TrendingUp } from 'lucide-react'

interface Distribution { ltv_bucket: string; customer_count: number; total_revenue: number; avg_orders: number; avg_ltv: number }
interface TopCustomer { email_hash: string; lifetime_revenue: number; order_count: number; first_order: string; last_order: string; customer_days: number; avg_order_value: number; favorite_category: string }
interface Cohort { cohort_month: string; months_since: number; customers: number; revenue: number }

function LTVContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || ''
  const cacheKey = `ltv-v1:${brand}:${month}`

  const cached = getCached<{ distribution: Distribution[]; topCustomers: TopCustomer[]; cohort: Cohort[] }>(cacheKey)
  const [distribution, setDistribution] = useState<Distribution[]>(cached?.distribution ?? [])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>(cached?.topCustomers ?? [])
  const [cohort, setCohort] = useState<Cohort[]>(cached?.cohort ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (brand) params.set('brand', brand)
      if (month) params.set('month', month)
      const qs = params.toString()
      const res = await fetch(`/api/ltv${qs ? `?${qs}` : ''}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current && data) {
        setDistribution(Array.isArray(data.distribution) ? data.distribution : [])
        setTopCustomers(Array.isArray(data.topCustomers) ? data.topCustomers : [])
        setCohort(Array.isArray(data.cohort) ? data.cohort : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [brand, month, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCustomers = distribution.reduce((s, d) => s + (Number(d.customer_count) || 0), 0)
  const totalRevenue = distribution.reduce((s, d) => s + (Number(d.total_revenue) || 0), 0)
  const maxBucketCustomers = Math.max(...distribution.map(d => Number(d.customer_count) || 0), 1)
  const overallAvgLtv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0

  // Build cohort table
  const cohortMonths = Array.from(new Set(cohort.map(c => c.cohort_month))).sort()
  const maxMonthsSince = Math.max(...cohort.map(c => Number(c.months_since) || 0), 0)
  const cohortLookup = new Map<string, Cohort>()
  for (const c of cohort) cohortLookup.set(`${c.cohort_month}-${c.months_since}`, c)
  const cohortBaseline = new Map<string, number>()
  for (const cm of cohortMonths) {
    const base = cohortLookup.get(`${cm}-0`)
    if (base) cohortBaseline.set(cm, Number(base.customers) || 0)
  }

  return (
    <>
      <Header title="LTV分析" subtitle="顧客生涯価値・コホートリテンション" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand || '全て'} onBrandChange={() => {}} hideBrand={!!urlBrand} />

        {loading ? (
          <div className="grid grid-cols-3 gap-4">{Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
        ) : distribution.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">全顧客数</div>
                  <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(totalCustomers)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">分析対象</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">累計売上</div>
                  <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatCurrency(totalRevenue)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">全期間合計</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">平均LTV</div>
                  <div className="text-3xl font-bold text-purple-600 tabular-nums mt-2">{formatCurrency(overallAvgLtv)}</div>
                  <div className="text-[11px] text-gray-400 mt-1">1人あたり生涯価値</div>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">平均注文回数</div>
                  <div className="text-3xl font-bold text-amber-600 tabular-nums mt-2">
                    {(() => {
                      const totalOrders = distribution.reduce((s, d) => s + (Number(d.avg_orders) || 0) * (Number(d.customer_count) || 0), 0)
                      return totalCustomers > 0 ? (totalOrders / totalCustomers).toFixed(1) : '-'
                    })()}回
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">1人あたり</div>
                </CardContent>
              </Card>
            </div>

            {/* LTV Distribution */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />LTV分布
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {distribution.map(d => {
                  const count = Number(d.customer_count) || 0
                  const rev = Number(d.total_revenue) || 0
                  return (
                    <div key={d.ltv_bucket} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-[#3D352F] w-24">{d.ltv_bucket}</span>
                      <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden relative">
                        <div className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-lg transition-all" style={{ width: `${(count / maxBucketCustomers) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white mix-blend-difference">
                          {formatNumber(count)}人 ({totalCustomers > 0 ? formatPercent(count / totalCustomers) : '-'})
                        </span>
                      </div>
                      <div className="text-right w-28">
                        <div className="text-[10px] font-medium text-[#3D352F]">{formatCurrency(rev)}</div>
                        <div className="text-[9px] text-gray-400">平均{(Number(d.avg_orders) || 0).toFixed(1)}回</div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-6">
              {/* Top customers */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-500" />トップ顧客
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                          <th className="text-center px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">#</th>
                          <th className="text-right px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">LTV</th>
                          <th className="text-right px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">注文</th>
                          <th className="text-right px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">AOV</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">好みカテゴリ</th>
                          <th className="text-right px-2 py-2 text-[10px] font-semibold text-[#8A7D72]">期間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomers.slice(0, 20).map((c, i) => (
                          <tr key={c.email_hash} className={`border-b border-black/[0.04] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                            <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] font-bold text-[#3D352F]">{formatCurrency(Number(c.lifetime_revenue) || 0)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-[#5A524B]">{Number(c.order_count) || 0}回</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] text-[#5A524B]">{formatCurrency(Number(c.avg_order_value) || 0)}</td>
                            <td className="px-2 py-1.5 text-[10px] text-[#8A7D72]">{c.favorite_category}</td>
                            <td className="px-2 py-1.5 text-right text-[10px] text-[#8A7D72]">{Number(c.customer_days) || 0}日</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Cohort Retention */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-500" />コホートリテンション
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr>
                          <th className="text-left px-1 py-1 font-semibold text-[#8A7D72]">月</th>
                          {Array.from({ length: Math.min(maxMonthsSince + 1, 7) }, (_, i) => (
                            <th key={i} className="text-center px-1 py-1 font-semibold text-[#8A7D72]">M{i}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cohortMonths.slice(-8).map(cm => {
                          const baseline = cohortBaseline.get(cm) || 0
                          return (
                            <tr key={cm} className="border-b border-black/[0.04]">
                              <td className="px-1 py-1 font-medium text-[#3D352F]">{cm.split('-')[1]}月</td>
                              {Array.from({ length: Math.min(maxMonthsSince + 1, 7) }, (_, i) => {
                                const item = cohortLookup.get(`${cm}-${i}`)
                                if (!item) return <td key={i} className="text-center px-1 py-1 text-gray-300">-</td>
                                const customers = Number(item.customers) || 0
                                const rate = baseline > 0 ? customers / baseline : 0
                                const color = i === 0 ? 'bg-blue-100 text-blue-800' :
                                  rate >= 0.3 ? 'bg-emerald-100 text-emerald-800' :
                                  rate >= 0.15 ? 'bg-amber-100 text-amber-800' :
                                  rate > 0 ? 'bg-red-50 text-red-700' : ''
                                return (
                                  <td key={i} className="px-0.5 py-0.5">
                                    <div className={`rounded px-1 py-0.5 text-center font-medium ${color}`}>
                                      {i === 0 ? formatNumber(customers) : formatPercent(rate)}
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
                  <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-400">
                    <span>リテンション:</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100" />30%+</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100" />15-30%</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50" />&lt;15%</span>
                  </div>
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

export default function LTVPage() {
  return <Suspense><LTVContent /></Suspense>
}
