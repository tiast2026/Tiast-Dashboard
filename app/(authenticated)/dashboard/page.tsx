'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import DailySalesChart from '@/components/charts/DailySalesChart'
import BarChart from '@/components/charts/BarChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatChangeRate, formatYoY, getCurrentMonth, getPreviousMonth, getLastYearMonth, formatMonth } from '@/lib/format'
import type { SalesSummaryResponse, CategoryRankingItem, YoYComparisonItem, DailySalesItem } from '@/types/sales'

export default function DashboardPage() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [brand, setBrand] = useState('全て')
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null)
  const [ranking, setRanking] = useState<CategoryRankingItem[]>([])
  const [yoy, setYoy] = useState<YoYComparisonItem[]>([])
  const [dailyTrend, setDailyTrend] = useState<DailySalesItem[]>([])
  const [loading, setLoading] = useState(true)

  const brandParam = brand === '全て' ? '' : `&brand=${brand}`

  const fetchData = useCallback(async () => {
    setLoading(true)
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
      setSummary(summaryData)
      setRanking(Array.isArray(rankData) ? rankData : [])
      setYoy(Array.isArray(yoyData) ? yoyData : [])
      setDailyTrend(Array.isArray(dailyData) ? dailyData : [])
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }, [month, brandParam])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Build brand×channel matrix from YoY data
  const { channels, brands, matrix, channelTotals, grandTotal } = (() => {
    const channelSet = new Set<string>()
    const brandSet = new Set<string>()
    const map: Record<string, Record<string, { current: number; prev: number }>> = {}

    for (const item of yoy) {
      channelSet.add(item.channel)
      brandSet.add(item.brand)
      if (!map[item.channel]) map[item.channel] = {}
      map[item.channel][item.brand] = {
        current: item.current_sales,
        prev: item.previous_year_sales,
      }
    }

    const channels = Array.from(channelSet)
    const brands = Array.from(brandSet)

    // Calculate totals per channel
    const channelTotals: Record<string, { current: number; prev: number }> = {}
    let grandTotal = { current: 0, prev: 0 }
    for (const ch of channels) {
      let chCurrent = 0
      let chPrev = 0
      for (const b of brands) {
        chCurrent += map[ch]?.[b]?.current || 0
        chPrev += map[ch]?.[b]?.prev || 0
      }
      channelTotals[ch] = { current: chCurrent, prev: chPrev }
      grandTotal = { current: grandTotal.current + chCurrent, prev: grandTotal.prev + chPrev }
    }

    return { channels, brands, matrix: map, channelTotals, grandTotal }
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
            ) : yoy.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600">チャネル</th>
                      {brands.map((b) => (
                        <th key={b} className="text-right p-2 font-medium text-gray-600">{b}</th>
                      ))}
                      <th className="text-right p-2 font-semibold text-gray-700">合計</th>
                      <th className="text-right p-2 font-medium text-gray-600">構成比</th>
                      <th className="text-right p-2 font-medium text-gray-600">前年比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((ch) => {
                      const chTotal = channelTotals[ch]
                      const ratio = grandTotal.current > 0 ? chTotal.current / grandTotal.current : 0
                      const yoyRatio = chTotal.prev > 0 ? chTotal.current / chTotal.prev : null
                      return (
                        <tr key={ch} className="border-b hover:bg-gray-50/50">
                          <td className="p-2 font-medium">{ch}</td>
                          {brands.map((b) => {
                            const val = matrix[ch]?.[b]?.current || 0
                            return (
                              <td key={b} className="p-2 text-right tabular-nums">
                                {val > 0 ? formatCurrency(val) : <span className="text-gray-300">-</span>}
                              </td>
                            )
                          })}
                          <td className="p-2 text-right font-semibold tabular-nums">
                            {formatCurrency(chTotal.current)}
                          </td>
                          <td className="p-2 text-right tabular-nums text-gray-500">
                            {(ratio * 100).toFixed(1)}%
                          </td>
                          <td className={`p-2 text-right text-xs font-medium ${
                            yoyRatio == null ? '' : yoyRatio >= 1 ? 'text-green-700' : 'text-red-600'
                          }`}>
                            {yoyRatio != null ? `${(yoyRatio * 100).toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-gray-50 font-semibold">
                      <td className="p-2">合計</td>
                      {brands.map((b) => {
                        const brandTotal = channels.reduce((sum, ch) => sum + (matrix[ch]?.[b]?.current || 0), 0)
                        return (
                          <td key={b} className="p-2 text-right tabular-nums">
                            {brandTotal > 0 ? formatCurrency(brandTotal) : '-'}
                          </td>
                        )
                      })}
                      <td className="p-2 text-right tabular-nums">
                        {formatCurrency(grandTotal.current)}
                      </td>
                      <td className="p-2 text-right tabular-nums text-gray-500">100.0%</td>
                      <td className={`p-2 text-right text-xs font-medium ${
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
