'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import DailySalesChart from '@/components/charts/DailySalesChart'
import BarChart from '@/components/charts/BarChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatChangeRate, formatYoY, getCurrentMonth, getPreviousMonth, getLastYearMonth, formatMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import type { SalesSummaryResponse, CategoryRankingItem, YoYComparisonItem, DailySalesItem } from '@/types/sales'

interface DashboardData {
  summary: SalesSummaryResponse | null
  ranking: CategoryRankingItem[]
  yoy: YoYComparisonItem[]
  dailyTrend: DailySalesItem[]
}

export default function DashboardPage() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [brand, setBrand] = useState('全て')
  const brandParam = brand === '全て' ? '' : `&brand=${brand}`
  const cacheKey = `dashboard:${month}:${brandParam}`

  const cached = getCached<DashboardData>(cacheKey)
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(cached?.summary ?? null)
  const [ranking, setRanking] = useState<CategoryRankingItem[]>(cached?.ranking ?? [])
  const [yoy, setYoy] = useState<YoYComparisonItem[]>(cached?.yoy ?? [])
  const [dailyTrend, setDailyTrend] = useState<DailySalesItem[]>(cached?.dailyTrend ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    // Skip fetch if cache is fresh (< 5 min)
    if (isFresh(cacheKey)) return

    // Only show loading if no cached data
    if (!getCached(cacheKey)) setLoading(true)

    try {
      const [summaryRes, rankRes, yoyRes, dailyRes] = await Promise.all([
        fetch(`/api/sales/summary?month=${month}${brandParam}`),
        fetch(`/api/sales/category-ranking?month=${month}${brandParam}`),
        fetch(`/api/sales/yoy-comparison?month=${month}`),
        fetch(`/api/sales/daily-trend?month=${month}${brandParam}`),
      ])
      const [summaryData, rankData, yoyData, dailyData] = await Promise.all([
        summaryRes.ok ? summaryRes.json() : null,
        rankRes.ok ? rankRes.json() : [],
        yoyRes.ok ? yoyRes.json() : [],
        dailyRes.ok ? dailyRes.json() : [],
      ])
      if (!mountedRef.current) return
      const data: DashboardData = {
        summary: summaryData,
        ranking: Array.isArray(rankData) ? rankData : [],
        yoy: Array.isArray(yoyData) ? yoyData : [],
        dailyTrend: Array.isArray(dailyData) ? dailyData : [],
      }
      setSummary(data.summary)
      setRanking(data.ranking)
      setYoy(data.yoy)
      setDailyTrend(data.dailyTrend)
      setCache(cacheKey, data)
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [month, brandParam, cacheKey])

  useEffect(() => {
    mountedRef.current = true
    // Restore from cache immediately
    const c = getCached<DashboardData>(cacheKey)
    if (c) {
      setSummary(c.summary)
      setRanking(c.ranking)
      setYoy(c.yoy)
      setDailyTrend(c.dailyTrend)
      setLoading(false)
    }
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData, cacheKey])

  // Build brand-grouped channel sales from YoY data
  const { brandGroups, grandTotal } = (() => {
    // Extract pure channel name from patterns like 【楽天】NOAHL
    function extractChannel(raw: string): string {
      const m = raw.match(/【(.+?)】/)
      if (m) return m[1]
      return raw
    }

    // Ensure numeric values (BigQuery NUMERIC can come as strings)
    function num(v: unknown): number {
      if (typeof v === 'number') return v
      if (typeof v === 'string') return Number(v) || 0
      return 0
    }

    // Group: brand → channel → { current, prev }
    const brandMap: Record<string, { channel: string; current: number; prev: number }[]> = {}
    let gCurrent = 0
    let gPrev = 0

    for (const item of yoy) {
      const b = item.brand
      const ch = extractChannel(item.channel)
      const cur = num(item.current_sales)
      const prev = num(item.previous_year_sales)

      if (!brandMap[b]) brandMap[b] = []
      // Merge if same channel exists for same brand
      const existing = brandMap[b].find((x) => x.channel === ch)
      if (existing) {
        existing.current += cur
        existing.prev += prev
      } else {
        brandMap[b].push({ channel: ch, current: cur, prev: prev })
      }
      gCurrent += cur
      gPrev += prev
    }

    // Sort channels within each brand by current sales desc
    const brandGroups = Object.entries(brandMap)
      .map(([brand, channels]) => {
        channels.sort((a, b) => b.current - a.current)
        const subtotal = {
          current: channels.reduce((s, c) => s + c.current, 0),
          prev: channels.reduce((s, c) => s + c.prev, 0),
        }
        return { brand, channels, subtotal }
      })
      .sort((a, b) => b.subtotal.current - a.subtotal.current)

    return { brandGroups, grandTotal: { current: gCurrent, prev: gPrev } }
  })()

  const barData = ranking.map((r) => ({
    name: r.category,
    value: r.sales_amount,
  }))

  return (
    <>
      <Header title="ダッシュボード" />
      <div className="p-6 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={setBrand} />

        {/* KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              title="今月売上合計"
              value={formatCurrency(summary.current.sales_amount)}
              change={formatChangeRate(summary.current.sales_amount, summary.previous_month.sales_amount)}
              yoyText={formatYoY(summary.current.sales_amount, summary.previous_year.sales_amount)}
            />
            <KPICard
              title="今月受注件数"
              value={`${formatNumber(summary.current.order_count)}件`}
              change={formatChangeRate(summary.current.order_count, summary.previous_month.order_count)}
              yoyText={formatYoY(summary.current.order_count, summary.previous_year.order_count)}
            />
            <KPICard
              title="今月粗利率"
              value={formatPercent(summary.current.gross_profit_rate)}
              change={formatChangeRate(summary.current.gross_profit_rate, summary.previous_month.gross_profit_rate)}
              yoyText={formatPercent(summary.previous_year.gross_profit_rate)}
            />
            <KPICard
              title="今月客単価"
              value={formatCurrency(summary.current.avg_order_value)}
              change={formatChangeRate(summary.current.avg_order_value, summary.previous_month.avg_order_value)}
              yoyText={formatYoY(summary.current.avg_order_value, summary.previous_year.avg_order_value)}
            />
          </div>
        ) : null}

        {/* Brand × Channel Sales Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ブランド×チャネル売上</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px]" />
            ) : brandGroups.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600 w-[200px]"></th>
                      <th className="text-right p-2 font-medium text-gray-600">売上金額</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[80px]">構成比</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[80px]">前年比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandGroups.map((group) => {
                      const brandRatio = grandTotal.current > 0 ? group.subtotal.current / grandTotal.current : 0
                      const brandYoy = group.subtotal.prev > 0 ? group.subtotal.current / group.subtotal.prev : null
                      return (
                        <React.Fragment key={group.brand}>
                          {/* Brand header row */}
                          <tr className="border-b bg-gray-50/80">
                            <td className="p-2 font-semibold text-gray-800">{group.brand}</td>
                            <td className="p-2 text-right font-semibold tabular-nums">
                              {formatCurrency(group.subtotal.current)}
                            </td>
                            <td className="p-2 text-right tabular-nums text-gray-500 font-medium">
                              {(brandRatio * 100).toFixed(1)}%
                            </td>
                            <td className={`p-2 text-right text-sm font-semibold ${
                              brandYoy == null ? '' : brandYoy >= 1 ? 'text-green-700' : 'text-red-600'
                            }`}>
                              {brandYoy != null ? `${(brandYoy * 100).toFixed(1)}%` : '-'}
                            </td>
                          </tr>
                          {/* Channel rows */}
                          {group.channels.map((ch) => {
                            const chRatio = grandTotal.current > 0 ? ch.current / grandTotal.current : 0
                            const chYoy = ch.prev > 0 ? ch.current / ch.prev : null
                            return (
                              <tr key={`${group.brand}-${ch.channel}`} className="border-b hover:bg-gray-50/50">
                                <td className="p-2 pl-6 text-gray-600">{ch.channel}</td>
                                <td className="p-2 text-right tabular-nums">{formatCurrency(ch.current)}</td>
                                <td className="p-2 text-right tabular-nums text-gray-400 text-xs">
                                  {(chRatio * 100).toFixed(1)}%
                                </td>
                                <td className={`p-2 text-right text-xs font-medium ${
                                  chYoy == null ? '' : chYoy >= 1 ? 'text-green-700' : 'text-red-600'
                                }`}>
                                  {chYoy != null ? `${(chYoy * 100).toFixed(1)}%` : '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-gray-100 font-semibold">
                      <td className="p-2">合計</td>
                      <td className="p-2 text-right tabular-nums">{formatCurrency(grandTotal.current)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-500">100.0%</td>
                      <td className={`p-2 text-right text-sm font-semibold ${
                        grandTotal.prev > 0 ? (grandTotal.current / grandTotal.prev >= 1 ? 'text-green-700' : 'text-red-600') : ''
                      }`}>
                        {grandTotal.prev > 0 ? `${(grandTotal.current / grandTotal.prev * 100).toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
            )}
          </CardContent>
        </Card>

        {/* Daily Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">日別売上推移</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[350px]" />
            ) : dailyTrend.length > 0 ? (
              <DailySalesChart
                data={dailyTrend}
                currentLabel={formatMonth(month)}
                prevMonthLabel={formatMonth(getPreviousMonth(month))}
                prevYearLabel={formatMonth(getLastYearMonth(month))}
              />
            ) : (
              <div className="h-[350px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
            )}
          </CardContent>
        </Card>

        {/* Category Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別売上ランキング</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px]" />
            ) : barData.length > 0 ? (
              <BarChart data={barData} color="#6B7280" />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
