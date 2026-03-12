'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import SalesLineChart from '@/components/charts/SalesLineChart'
import DailySalesChart from '@/components/charts/DailySalesChart'
import DonutChart from '@/components/charts/DonutChart'
import BarChart from '@/components/charts/BarChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatChangeRate, formatYoY, getCurrentMonth, getPreviousMonth, getLastYearMonth, formatMonth } from '@/lib/format'
import { BRAND_COLORS, CHANNEL_GROUP_COLORS } from '@/lib/constants'
import type { SalesSummaryResponse, MonthlyTrendItem, BrandCompositionItem, CategoryRankingItem, YoYComparisonItem, DailySalesItem } from '@/types/sales'

export default function DashboardPage() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [brand, setBrand] = useState('全て')
  const [summary, setSummary] = useState<SalesSummaryResponse | null>(null)
  const [trend, setTrend] = useState<MonthlyTrendItem[]>([])
  const [composition, setComposition] = useState<BrandCompositionItem[]>([])
  const [ranking, setRanking] = useState<CategoryRankingItem[]>([])
  const [yoy, setYoy] = useState<YoYComparisonItem[]>([])
  const [dailyTrend, setDailyTrend] = useState<DailySalesItem[]>([])
  const [loading, setLoading] = useState(true)

  const brandParam = brand === '全て' ? '' : `&brand=${brand}`

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, trendRes, compRes, rankRes, yoyRes, dailyRes] = await Promise.all([
        fetch(`/api/sales/summary?month=${month}${brandParam}`),
        fetch(`/api/sales/monthly-trend?months=24${brandParam}`),
        fetch(`/api/sales/brand-composition?month=${month}`),
        fetch(`/api/sales/category-ranking?month=${month}${brandParam}`),
        fetch(`/api/sales/yoy-comparison?month=${month}`),
        fetch(`/api/sales/daily-trend?month=${month}${brandParam}`),
      ])
      const [summaryData, trendData, compData, rankData, yoyData, dailyData] = await Promise.all([
        summaryRes.ok ? summaryRes.json() : null,
        trendRes.ok ? trendRes.json() : [],
        compRes.ok ? compRes.json() : [],
        rankRes.ok ? rankRes.json() : [],
        yoyRes.ok ? yoyRes.json() : [],
        dailyRes.ok ? dailyRes.json() : [],
      ])
      setSummary(summaryData)
      setTrend(Array.isArray(trendData) ? trendData : [])
      setComposition(Array.isArray(compData) ? compData : [])
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

  // Transform trend data for line chart: pivot channel_group into columns per month
  const trendChartData = (() => {
    const grouped: Record<string, Record<string, number>> = {}
    for (const item of trend) {
      if (!grouped[item.month]) grouped[item.month] = {}
      grouped[item.month][item.channel_group] = (grouped[item.month][item.channel_group] || 0) + item.sales_amount
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, channels]) => ({ month: m, ...channels }))
  })()

  const trendKeys = Object.keys(CHANNEL_GROUP_COLORS)

  const donutData = composition.map((c) => ({
    name: c.brand,
    value: c.sales_amount,
    color: BRAND_COLORS[c.brand] || '#999',
  }))

  const donutCenter = summary ? formatCurrency(summary.current.sales_amount) : ''

  const barData = ranking.map((r) => ({
    name: r.category,
    value: r.sales_amount,
  }))

  // YoY table: group by brand, then channels
  const yoyBrands = Array.from(new Set(yoy.map((y) => y.brand)))
  const yoyChannels = Array.from(new Set(yoy.map((y) => y.channel)))

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

        {/* Main Charts */}
        <div className="grid grid-cols-5 gap-6">
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle className="text-base">月別売上推移（チャネル別）</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[350px]" />
              ) : trendChartData.length > 0 ? (
                <SalesLineChart data={trendChartData} keys={trendKeys} colors={CHANNEL_GROUP_COLORS} />
              ) : (
                <div className="h-[350px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base">ブランド別売上構成比</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px]" />
              ) : donutData.length > 0 ? (
                <DonutChart data={donutData} centerLabel={donutCenter} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sub Charts */}
        <div className="grid grid-cols-5 gap-6">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base">カテゴリ別売上ランキング</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[400px]" />
              ) : barData.length > 0 ? (
                <BarChart data={barData} color="#6B7280" />
              ) : (
                <div className="h-[400px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle className="text-base">ブランド×チャネル 前年同月比</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[200px]" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-2 font-medium text-gray-600">ブランド</th>
                        {yoyChannels.map((ch) => (
                          <th key={ch} className="text-right p-2 font-medium text-gray-600 text-xs">{ch}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yoyBrands.map((b) => (
                        <tr key={b} className="border-b">
                          <td className="p-2 font-medium">{b}</td>
                          {yoyChannels.map((ch) => {
                            const item = yoy.find((y) => y.brand === b && y.channel === ch)
                            const ratio = item?.yoy_ratio
                            const display = ratio != null ? `${(ratio * 100).toFixed(1)}%` : '-'
                            const color = ratio == null ? '' : ratio >= 1 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                            return (
                              <td key={ch} className={`p-2 text-right text-xs font-medium ${color}`}>
                                {display}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
