'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { getBrandDisplayName, BRAND_COLORS, CHANNEL_GROUP_COLORS } from '@/lib/constants'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import AlertCard from '@/components/cards/AlertCard'
import {
  LazyDailySalesChart as DailySalesChart,
  LazyBarChart as BarChart,
  LazyStackedBarChart as StackedBarChart,
  LazyDonutChart as DonutChart,
} from '@/components/charts/LazyCharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrency,
  formatPercent,
  formatNumber,
  formatChangeRate,
  formatYoY,
  getCurrentMonth,
  getPreviousMonth,
  getLastYearMonth,
  formatMonth,
} from '@/lib/format'
import { getCached, setCache, isFresh, fetchWithDedup } from '@/lib/client-cache'
import type { SalesSummaryResponse, MonthlyTrendItem, BrandCompositionItem, CategoryRankingItem, YoYComparisonItem, DailySalesItem } from '@/types/sales'
import type { CustomerSummary } from '@/types/customer'
import type { InventoryAlerts } from '@/types/inventory'
import { Users, UserPlus, Repeat, TrendingUp, ShoppingCart, Percent, CreditCard } from 'lucide-react'

interface DashboardData {
  summary: SalesSummaryResponse | null
  ranking: CategoryRankingItem[]
  yoy: YoYComparisonItem[]
  dailyTrend: DailySalesItem[]
  monthlyTrend: MonthlyTrendItem[]
  brandComposition: BrandCompositionItem[]
  customerSummary: CustomerSummary | null
  inventoryAlerts: InventoryAlerts | null
}

function DashboardPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const [brand, setBrand] = useState(urlBrand || '全て')
  const brandParam = brand === '全て' ? '' : `&brand=${brand}`
  const cacheKey = `dashboard-v2:${month}:${brandParam}`

  const cached = getCached<DashboardData>(cacheKey)
  const [data, setData] = useState<DashboardData>(
    cached ?? {
      summary: null,
      ranking: [],
      yoy: [],
      dailyTrend: [],
      monthlyTrend: [],
      brandComposition: [],
      customerSummary: null,
      inventoryAlerts: null,
    }
  )
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)

    try {
      const result = await fetchWithDedup<DashboardData>(cacheKey, async () => {
        const [summaryRes, rankRes, yoyRes, dailyRes, trendRes, brandRes, custRes, invRes] = await Promise.all([
          fetch(`/api/sales/summary?month=${month}${brandParam}`),
          fetch(`/api/sales/category-ranking?month=${month}${brandParam}`),
          fetch(`/api/sales/yoy-comparison?month=${month}`),
          fetch(`/api/sales/daily-trend?month=${month}${brandParam}`),
          fetch(`/api/sales/monthly-trend?months=12${brandParam}`),
          fetch(`/api/sales/brand-composition?month=${month}`),
          fetch(`/api/customers/summary?month=${month}${brandParam}`),
          fetch(`/api/inventory/alerts`),
        ])
        const [summaryData, rankData, yoyData, dailyData, trendData, brandData, custData, invData] = await Promise.all([
          summaryRes.ok ? summaryRes.json() : null,
          rankRes.ok ? rankRes.json() : [],
          yoyRes.ok ? yoyRes.json() : [],
          dailyRes.ok ? dailyRes.json() : [],
          trendRes.ok ? trendRes.json() : [],
          brandRes.ok ? brandRes.json() : [],
          custRes.ok ? custRes.json() : null,
          invRes.ok ? invRes.json() : null,
        ])
        return {
          summary: summaryData,
          ranking: Array.isArray(rankData) ? rankData : [],
          yoy: Array.isArray(yoyData) ? yoyData : [],
          dailyTrend: Array.isArray(dailyData) ? dailyData : [],
          monthlyTrend: Array.isArray(trendData) ? trendData : [],
          brandComposition: Array.isArray(brandData) ? brandData : [],
          customerSummary: custData && !custData.error ? custData : null,
          inventoryAlerts: invData && !invData.error ? invData : null,
        }
      })
      if (!mountedRef.current) return
      setData(result)
      setCache(cacheKey, result)
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [month, brandParam, cacheKey])

  useEffect(() => {
    mountedRef.current = true
    const c = getCached<DashboardData>(cacheKey)
    if (c) {
      setData(c)
      setLoading(false)
    }
    fetchData()
    return () => {
      mountedRef.current = false
    }
  }, [fetchData, cacheKey])

  const { summary, ranking, yoy, dailyTrend, monthlyTrend, brandComposition, customerSummary, inventoryAlerts } = data

  // --- Brand × Channel Table ---
  const { brandGroups, grandTotal } = useMemo(() => {
    function extractChannel(raw: string): string {
      const m = raw.match(/【(.+?)】/)
      return m ? m[1] : raw
    }
    function num(v: unknown): number {
      if (typeof v === 'number') return v
      if (typeof v === 'string') return Number(v) || 0
      return 0
    }

    const brandMap: Record<string, { channel: string; current: number; prev: number; orders: number; prevOrders: number; profit: number; prevProfit: number }[]> = {}
    let gCurrent = 0, gPrev = 0, gOrders = 0, gPrevOrders = 0, gProfit = 0, gPrevProfit = 0

    for (const item of yoy) {
      const b = item.brand
      const ch = extractChannel(item.channel)
      const cur = num(item.current_sales)
      const prev = num(item.previous_year_sales)
      const orders = num(item.current_order_count)
      const prevOrders = num(item.previous_year_order_count)
      const profit = num(item.current_gross_profit)
      const prevProfit = num(item.previous_year_gross_profit)

      if (!brandMap[b]) brandMap[b] = []
      const existing = brandMap[b].find((x) => x.channel === ch)
      if (existing) {
        existing.current += cur
        existing.prev += prev
        existing.orders += orders
        existing.prevOrders += prevOrders
        existing.profit += profit
        existing.prevProfit += prevProfit
      } else {
        brandMap[b].push({ channel: ch, current: cur, prev, orders, prevOrders, profit, prevProfit })
      }
      gCurrent += cur
      gPrev += prev
      gOrders += orders
      gPrevOrders += prevOrders
      gProfit += profit
      gPrevProfit += prevProfit
    }

    const brandGroups = Object.entries(brandMap)
      .map(([brand, channels]) => {
        channels.sort((a, b) => b.current - a.current)
        const subtotal = {
          current: channels.reduce((s, c) => s + c.current, 0),
          prev: channels.reduce((s, c) => s + c.prev, 0),
          orders: channels.reduce((s, c) => s + c.orders, 0),
          prevOrders: channels.reduce((s, c) => s + c.prevOrders, 0),
          profit: channels.reduce((s, c) => s + c.profit, 0),
          prevProfit: channels.reduce((s, c) => s + c.prevProfit, 0),
        }
        return { brand, channels, subtotal }
      })
      .sort((a, b) => b.subtotal.current - a.subtotal.current)

    return { brandGroups, grandTotal: { current: gCurrent, prev: gPrev, orders: gOrders, prevOrders: gPrevOrders, profit: gProfit, prevProfit: gPrevProfit } }
  }, [yoy])

  // --- Monthly Trend Chart Data ---
  const { trendChartData, trendKeys } = useMemo(() => {
    const channelGroups = ['楽天系', '公式系', 'TikTok系', 'その他']
    const monthMap: Record<string, Record<string, number>> = {}
    for (const item of monthlyTrend) {
      if (!monthMap[item.month]) monthMap[item.month] = {}
      monthMap[item.month][item.channel_group] = Number(item.sales_amount) || 0
    }
    const trendChartData = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, groups]) => ({ month, ...groups }))
    return { trendChartData, trendKeys: channelGroups }
  }, [monthlyTrend])

  // --- Brand Composition Donut ---
  const donutData = useMemo(() => {
    return brandComposition.map((b) => ({
      name: b.brand,
      value: Number(b.sales_amount) || 0,
      color: BRAND_COLORS[b.brand] || '#999',
    }))
  }, [brandComposition])

  // --- Category Ranking Bar Data ---
  const barData = useMemo(
    () => ranking.map((r) => ({ name: r.category, value: r.sales_amount })),
    [ranking]
  )

  const SkeletonCard = () => <Skeleton className="h-28 rounded-lg" />

  return (
    <>
      <Header title={urlBrand ? `${getBrandDisplayName(urlBrand)} 売上分析` : 'ダッシュボード'} />
      <div className="p-6 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={setBrand} />

        {/* ===== Section 1: 売上 KPI ===== */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">売上サマリー</h2>
          {loading ? (
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : summary ? (
            <div className="grid grid-cols-4 gap-4">
              <KPICard
                title="売上合計"
                value={formatCurrency(summary.current.sales_amount)}
                change={formatChangeRate(summary.current.sales_amount, summary.previous_month.sales_amount)}
                yoyText={formatYoY(summary.current.sales_amount, summary.previous_year.sales_amount)}
                icon={<TrendingUp className="w-5 h-5" />}
              />
              <KPICard
                title="受注件数"
                value={`${formatNumber(summary.current.order_count)}件`}
                change={formatChangeRate(summary.current.order_count, summary.previous_month.order_count)}
                yoyText={formatYoY(summary.current.order_count, summary.previous_year.order_count)}
                icon={<ShoppingCart className="w-5 h-5" />}
              />
              <KPICard
                title="粗利率"
                value={formatPercent(summary.current.gross_profit_rate)}
                change={formatChangeRate(summary.current.gross_profit_rate, summary.previous_month.gross_profit_rate)}
                yoyText={formatPercent(summary.previous_year.gross_profit_rate)}
                icon={<Percent className="w-5 h-5" />}
              />
              <KPICard
                title="客単価"
                value={formatCurrency(summary.current.avg_order_value)}
                change={formatChangeRate(summary.current.avg_order_value, summary.previous_month.avg_order_value)}
                yoyText={formatYoY(summary.current.avg_order_value, summary.previous_year.avg_order_value)}
                icon={<CreditCard className="w-5 h-5" />}
              />
            </div>
          ) : null}
        </div>

        {/* ===== Section 2: 顧客 KPI ===== */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">顧客サマリー</h2>
          {loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : customerSummary ? (
            <div className="grid grid-cols-3 gap-4">
              <KPICard
                title="新規顧客数"
                value={`${formatNumber(customerSummary.new_customers)}人`}
                change={formatChangeRate(customerSummary.new_customers, customerSummary.prev_new_customers)}
                icon={<UserPlus className="w-5 h-5" />}
              />
              <KPICard
                title="リピート顧客数"
                value={`${formatNumber(customerSummary.repeat_customers)}人`}
                change={formatChangeRate(customerSummary.repeat_customers, customerSummary.prev_repeat_customers)}
                icon={<Repeat className="w-5 h-5" />}
              />
              <KPICard
                title="リピート率"
                value={formatPercent(customerSummary.repeat_rate)}
                change={formatChangeRate(customerSummary.repeat_rate, customerSummary.prev_repeat_rate)}
                icon={<Users className="w-5 h-5" />}
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}><CardContent className="p-5 text-center text-gray-400 text-sm">データなし</CardContent></Card>
              ))}
            </div>
          )}
        </div>

        {/* ===== Section 3: 在庫アラート ===== */}
        {inventoryAlerts && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">在庫アラート</h2>
            <div className="grid grid-cols-3 gap-4">
              <AlertCard
                title="過剰在庫"
                count={inventoryAlerts.overstock.count}
                amount={formatCurrency(inventoryAlerts.overstock.amount)}
                color="red"
                onClick={() => router.push('/inventory?alert=overstock')}
              />
              <AlertCard
                title="シーズン終了間近"
                count={inventoryAlerts.season_ending.count}
                amount={formatCurrency(inventoryAlerts.season_ending.amount)}
                color="yellow"
                onClick={() => router.push('/inventory?alert=season_ending')}
              />
              <AlertCard
                title="シーズン超過"
                count={inventoryAlerts.season_exceeded.count}
                amount={formatCurrency(inventoryAlerts.season_exceeded.amount)}
                color="red"
                onClick={() => router.push('/inventory?alert=season_exceeded')}
              />
            </div>
          </div>
        )}

        {/* ===== Section 4: 月別売上推移 + ブランド構成比 ===== */}
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base">月別売上推移（直近12ヶ月）</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[350px]" />
              ) : trendChartData.length > 0 ? (
                <StackedBarChart
                  data={trendChartData}
                  keys={trendKeys}
                  colors={CHANNEL_GROUP_COLORS}
                />
              ) : (
                <div className="h-[350px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ブランド構成比</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px]" />
              ) : donutData.length > 0 ? (
                <DonutChart data={donutData} centerLabel={formatMonth(month)} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ===== Section 5: 日別売上推移 ===== */}
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

        {/* ===== Section 6: ブランド×チャネル売上テーブル ===== */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ブランド × チャネル売上</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px]" />
            ) : brandGroups.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600 w-[160px]"></th>
                      <th className="text-right p-2 font-medium text-gray-600">売上金額</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[70px]">受注件数</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[90px]">粗利額</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[60px]">粗利率</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[60px]">構成比</th>
                      <th className="text-right p-2 font-medium text-gray-600 w-[60px]">前年比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandGroups.map((group) => {
                      const brandRatio = grandTotal.current > 0 ? group.subtotal.current / grandTotal.current : 0
                      const brandYoy = group.subtotal.prev > 0 ? group.subtotal.current / group.subtotal.prev : null
                      return (
                        <React.Fragment key={group.brand}>
                          <tr className="border-b bg-gray-50/80">
                            <td className="p-2 font-semibold text-gray-800">{group.brand}</td>
                            <td className="p-2 text-right font-semibold tabular-nums">{formatCurrency(group.subtotal.current)}</td>
                            <td className="p-2 text-right font-semibold tabular-nums">{formatNumber(group.subtotal.orders)}</td>
                            <td className="p-2 text-right font-semibold tabular-nums">{formatCurrency(group.subtotal.profit)}</td>
                            <td className="p-2 text-right font-semibold tabular-nums text-gray-500">
                              {group.subtotal.current > 0 ? formatPercent(group.subtotal.profit / group.subtotal.current) : '-'}
                            </td>
                            <td className="p-2 text-right tabular-nums text-gray-500 font-medium">{(brandRatio * 100).toFixed(1)}%</td>
                            <td className={`p-2 text-right text-sm font-semibold ${brandYoy == null ? '' : brandYoy >= 1 ? 'text-green-700' : 'text-red-600'}`}>
                              {brandYoy != null ? `${(brandYoy * 100).toFixed(1)}%` : '-'}
                            </td>
                          </tr>
                          {group.channels.map((ch) => {
                            const chRatio = grandTotal.current > 0 ? ch.current / grandTotal.current : 0
                            const chYoy = ch.prev > 0 ? ch.current / ch.prev : null
                            return (
                              <tr key={`${group.brand}-${ch.channel}`} className="border-b hover:bg-gray-50/50">
                                <td className="p-2 pl-6 text-gray-600">{ch.channel}</td>
                                <td className="p-2 text-right tabular-nums">{formatCurrency(ch.current)}</td>
                                <td className="p-2 text-right tabular-nums text-gray-500 text-xs">{formatNumber(ch.orders)}</td>
                                <td className="p-2 text-right tabular-nums text-xs">{formatCurrency(ch.profit)}</td>
                                <td className="p-2 text-right tabular-nums text-gray-400 text-xs">
                                  {ch.current > 0 ? formatPercent(ch.profit / ch.current) : '-'}
                                </td>
                                <td className="p-2 text-right tabular-nums text-gray-400 text-xs">{(chRatio * 100).toFixed(1)}%</td>
                                <td className={`p-2 text-right text-xs font-medium ${chYoy == null ? '' : chYoy >= 1 ? 'text-green-700' : 'text-red-600'}`}>
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
                      <td className="p-2 text-right tabular-nums">{formatNumber(grandTotal.orders)}</td>
                      <td className="p-2 text-right tabular-nums">{formatCurrency(grandTotal.profit)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-500">
                        {grandTotal.current > 0 ? formatPercent(grandTotal.profit / grandTotal.current) : '-'}
                      </td>
                      <td className="p-2 text-right tabular-nums text-gray-500">100.0%</td>
                      <td className={`p-2 text-right text-sm font-semibold ${grandTotal.prev > 0 ? (grandTotal.current / grandTotal.prev >= 1 ? 'text-green-700' : 'text-red-600') : ''}`}>
                        {grandTotal.prev > 0 ? `${((grandTotal.current / grandTotal.prev) * 100).toFixed(1)}%` : '-'}
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

        {/* ===== Section 7: カテゴリ別売上ランキング ===== */}
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

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardPageContent />
    </Suspense>
  )
}
