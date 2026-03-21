'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumber, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { BarChart3 } from 'lucide-react'

interface Summary {
  total_skus: number; total_revenue: number
  a_count: number; a_revenue: number
  b_count: number; b_revenue: number
  c_count: number; c_revenue: number
}
interface Product {
  product_code: string; product_name: string; category: string
  revenue: number; quantity: number; gross_profit: number
  cumulative_pct: number; abc_rank: string
}

function ABCContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `abc-v1:${month}:${brandParam}`

  const cached = getCached<{ summary: Summary | null; products: Product[] }>(cacheKey)
  const [summary, setSummary] = useState<Summary | null>(cached?.summary ?? null)
  const [products, setProducts] = useState<Product[]>(cached?.products ?? [])
  const [loading, setLoading] = useState(!cached)
  const [rankFilter, setRankFilter] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const res = await fetch(`/api/abc-analysis?month=${month}${bParam}`)
      const data = res.ok ? await res.json() : { summary: null, products: [] }
      if (mountedRef.current) {
        setSummary(data.summary)
        setProducts(Array.isArray(data.products) ? data.products : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = rankFilter === 'all' ? products : products.filter(p => p.abc_rank === rankFilter)
  const rankColors = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-amber-100 text-amber-700', C: 'bg-red-100 text-red-700' }

  return (
    <>
      <Header title="ABC分析" subtitle="パレート分析 - 売上上位商品の集中度" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />

        {loading ? (
          <div className="grid grid-cols-4 gap-4">{Array.from({length: 4}).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-4 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計SKU / 売上</div>
                  <div className="text-2xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(summary.total_skus)} SKU</div>
                  <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(summary.total_revenue)}</div>
                </CardContent>
              </Card>
              {(['A', 'B', 'C'] as const).map(rank => {
                const count = summary[`${rank.toLowerCase()}_count` as keyof Summary] as number
                const rev = summary[`${rank.toLowerCase()}_revenue` as keyof Summary] as number
                return (
                  <Card key={rank} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setRankFilter(rankFilter === rank ? 'all' : rank)}>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-full text-[13px] font-bold flex items-center justify-center ${rankColors[rank]}`}>{rank}</span>
                        <span className="text-[11px] font-medium text-gray-500">
                          {rank === 'A' ? '売上上位70%' : rank === 'B' ? '70-90%' : '下位10%'}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(count)} SKU</div>
                      <div className="text-[11px] text-gray-400 mt-1">{formatCurrency(rev)} ({summary.total_revenue > 0 ? formatPercent(rev / summary.total_revenue) : '-'})</div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Cumulative chart visualization */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />累積売上構成比（パレート曲線）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-16 flex items-end gap-px">
                  {products.slice(0, 100).map((p, i) => {
                    const pct = Number(p.cumulative_pct) || 0
                    const color = p.abc_rank === 'A' ? 'bg-emerald-400' : p.abc_rank === 'B' ? 'bg-amber-400' : 'bg-red-300'
                    return (
                      <div key={i} className={`flex-1 ${color} rounded-t-sm transition-all`} style={{ height: `${Math.max(pct * 100, 2)}%` }} title={`${p.product_name}: ${formatPercent(pct)}`} />
                    )
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                  <span>1位</span>
                  <span className="text-emerald-600 font-medium">── A(70%) ──</span>
                  <span className="text-amber-600 font-medium">── B(90%) ──</span>
                  <span className="text-red-500 font-medium">── C ──</span>
                </div>
              </CardContent>
            </Card>

            {/* Product table */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-[#3D352F]">商品一覧</CardTitle>
                  <div className="flex gap-1.5">
                    {(['all', 'A', 'B', 'C'] as const).map(f => (
                      <button key={f} onClick={() => setRankFilter(f)}
                        className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${rankFilter === f ? 'bg-[#3D352F] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {f === 'all' ? '全て' : `ランク${f}`}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                        <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-[#8A7D72] w-8">#</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">商品</th>
                        <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">カテゴリ</th>
                        <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">売上</th>
                        <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">数量</th>
                        <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">粗利</th>
                        <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">累積%</th>
                        <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">ランク</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p, i) => (
                        <tr key={p.product_code} className={`border-b border-black/[0.04] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                          <td className="px-2 py-2 text-center text-[11px] text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 max-w-[200px]">
                            <div className="text-[12px] font-medium text-[#3D352F] truncate">{p.product_name || p.product_code}</div>
                            <div className="text-[10px] text-gray-400">{p.product_code}</div>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-[#5A524B]">{p.category}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-[#3D352F]">{formatCurrency(Number(p.revenue) || 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#5A524B]">{formatNumber(Number(p.quantity) || 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-emerald-600">{formatCurrency(Number(p.gross_profit) || 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#8A7D72]">{formatPercent(Number(p.cumulative_pct) || 0)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block w-6 h-6 rounded-full text-[11px] font-bold leading-6 ${rankColors[p.abc_rank as 'A' | 'B' | 'C'] || 'bg-gray-100 text-gray-600'}`}>{p.abc_rank}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

export default function ABCAnalysisPage() {
  return <Suspense><ABCContent /></Suspense>
}
