'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { getBrandDisplayName, BRAND_COLORS, CHANNEL_GROUP_COLORS } from '@/lib/constants'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import {
  LazyDailySalesChart as DailySalesChart,
  LazyBarChart as BarChart,
  LazyStackedBarChart as StackedBarChart,
  LazyDonutChart as DonutChart,
} from '@/components/charts/LazyCharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import DataSourceBadge from '@/components/ui/data-source-badge'
import { Users, UserPlus, Repeat, TrendingUp, ShoppingCart, Percent, CreditCard, Monitor, Smartphone, ArrowDown, AlertTriangle, CheckCircle2, Info, TrendingDown } from 'lucide-react'

interface RakutenDailyItem {
  date: string
  sales_amount: number
  order_count: number
  access_count: number
  unique_users: number
  conversion_rate: number
  avg_order_value: number
}

interface RakutenFunnelData {
  access_count: number
  unique_users: number
  total_buyers: number
  order_count: number
}

interface RakutenDeviceItem {
  device: string
  sales_amount: number
  order_count: number
  access_count: number
  unique_users: number
  conversion_rate: number
  avg_order_value: number
}

interface CouponAnalysis {
  total_sales: number
  deal_sales: number
  deal_orders: number
  deal_conversion_rate: number
  normal_sales: number
  normal_orders: number
  normal_conversion_rate: number
  points_sales: number
  points_cost: number
  coupon_store: number
  coupon_rakuten: number
  free_shipping: number
}

interface NewRepeatStoreItem {
  month: string
  new_buyers: number
  new_sales: number
  new_avg_order_value: number
  repeat_buyers: number
  repeat_sales: number
  repeat_avg_order_value: number
  repeat_rate: number
}

interface RakutenAnalyticsData {
  daily: RakutenDailyItem[]
  funnel: RakutenFunnelData | null
  device: RakutenDeviceItem[]
  coupon: CouponAnalysis | null
  newRepeat: NewRepeatStoreItem[]
  availability: { rakuten: boolean; official: boolean }
}

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
  // When accessed from brand sidebar (e.g. ?brand=NOAHL), lock to that brand
  const brand = urlBrand || '全て'
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

  // Rakuten store analytics (loaded on-demand when tab is selected)
  const rakutenCacheKey = `rakuten-store-analytics:${month}:${brandParam}`
  const cachedRakuten = getCached<RakutenAnalyticsData>(rakutenCacheKey)
  const [rakutenData, setRakutenData] = useState<RakutenAnalyticsData>(
    cachedRakuten ?? { daily: [], funnel: null, device: [], coupon: null, newRepeat: [], availability: { rakuten: false, official: false } }
  )
  const [rakutenLoading, setRakutenLoading] = useState(false)
  const rakutenFetchedRef = useRef('')

  const fetchRakutenData = useCallback(async () => {
    const fetchKey = `${month}:${brandParam}`
    if (rakutenFetchedRef.current === fetchKey && isFresh(rakutenCacheKey)) return
    setRakutenLoading(true)
    try {
      const shopParam = urlBrand ? `&shop_name=${urlBrand}` : ''
      const [dailyRes, funnelRes, deviceRes, couponRes, nrRes, availRes] = await Promise.all([
        fetch(`/api/rakuten-analytics/store-daily?month=${month}${shopParam}`),
        fetch(`/api/rakuten-analytics/conversion-funnel?month=${month}${shopParam}`),
        fetch(`/api/rakuten-analytics/device-breakdown?month=${month}${shopParam}`),
        fetch(`/api/rakuten-analytics/coupon-analysis?month=${month}${shopParam}`),
        fetch(`/api/rakuten-analytics/new-repeat-store?${urlBrand ? `shop_name=${urlBrand}` : ''}`),
        fetch(`/api/rakuten-analytics/data-availability?${urlBrand ? `shop_name=${urlBrand}` : ''}`),
      ])
      const [dailyData, funnelData, deviceData, couponData, nrData, availData] = await Promise.all([
        dailyRes.ok ? dailyRes.json() : [],
        funnelRes.ok ? funnelRes.json() : null,
        deviceRes.ok ? deviceRes.json() : [],
        couponRes.ok ? couponRes.json() : null,
        nrRes.ok ? nrRes.json() : [],
        availRes.ok ? availRes.json() : { rakuten: false, official: false },
      ])
      const result: RakutenAnalyticsData = {
        daily: Array.isArray(dailyData) ? dailyData : [],
        funnel: funnelData,
        device: Array.isArray(deviceData) ? deviceData : [],
        coupon: couponData,
        newRepeat: Array.isArray(nrData) ? nrData : [],
        availability: availData,
      }
      if (mountedRef.current) {
        setRakutenData(result)
        setCache(rakutenCacheKey, result)
        rakutenFetchedRef.current = fetchKey
      }
    } catch (e) {
      console.error('Failed to fetch Rakuten analytics:', e)
    } finally {
      if (mountedRef.current) setRakutenLoading(false)
    }
  }, [month, urlBrand, brandParam, rakutenCacheKey])

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
    const channelGroups = ['公式', '楽天', 'ZOZO', 'TikTok', 'Rakuten Fashion', 'その他']
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
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />

        {/* ===== 常時表示: 売上 KPI ===== */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-4 rounded-full bg-gradient-to-b from-[#C4A882] to-[#A8896A]" />
            <h2 className="text-[13px] font-semibold text-[#8A7D72] tracking-wide">売上サマリー</h2>
          </div>
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

        {/* ===== 常時表示: 在庫アラート（コンパクト版） ===== */}
        {inventoryAlerts && (inventoryAlerts.overstock.count > 0 || inventoryAlerts.season_ending.count > 0 || inventoryAlerts.season_exceeded.count > 0) && (
          <div className="flex items-center gap-2 p-3 bg-white/60 border border-black/[0.06] rounded-xl backdrop-blur-sm">
            <span className="text-[12px] font-medium text-[#8A7D72] mr-1 shrink-0">在庫アラート</span>
            {inventoryAlerts.overstock.count > 0 && (
              <button
                onClick={() => router.push('/inventory?alert=overstock')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200/60 rounded-full hover:bg-red-100 hover:border-red-300 transition-all duration-200 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 group-hover:bg-red-500 transition-colors" />
                <span className="text-[12px] font-medium text-red-700">過剰在庫</span>
                <span className="text-[11px] font-semibold text-red-500 tabular-nums">{inventoryAlerts.overstock.count}</span>
              </button>
            )}
            {inventoryAlerts.season_ending.count > 0 && (
              <button
                onClick={() => router.push('/inventory?alert=season_ending')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200/60 rounded-full hover:bg-amber-100 hover:border-amber-300 transition-all duration-200 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:bg-amber-500 transition-colors" />
                <span className="text-[12px] font-medium text-amber-700">シーズン終了間近</span>
                <span className="text-[11px] font-semibold text-amber-600 tabular-nums">{inventoryAlerts.season_ending.count}</span>
              </button>
            )}
            {inventoryAlerts.season_exceeded.count > 0 && (
              <button
                onClick={() => router.push('/inventory?alert=season_exceeded')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200/60 rounded-full hover:bg-red-100 hover:border-red-300 transition-all duration-200 group"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 group-hover:bg-red-500 transition-colors" />
                <span className="text-[12px] font-medium text-red-700">シーズン超過</span>
                <span className="text-[11px] font-semibold text-red-500 tabular-nums">{inventoryAlerts.season_exceeded.count}</span>
              </button>
            )}
          </div>
        )}

        {/* ===== タブで詳細を分割 ===== */}
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sales">売上分析</TabsTrigger>
            <TabsTrigger value="customers">顧客</TabsTrigger>
            <TabsTrigger value="channels">チャネル</TabsTrigger>
            <TabsTrigger value="rakuten" onClick={fetchRakutenData}>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BF0000]" />
                楽天詳細
              </span>
            </TabsTrigger>
          </TabsList>

          {/* --- 売上分析タブ --- */}
          <TabsContent value="sales" className="space-y-6">
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
          </TabsContent>

          {/* --- 顧客タブ --- */}
          <TabsContent value="customers" className="space-y-6">
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : customerSummary ? (
              <div className="grid grid-cols-3 gap-5">
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
          </TabsContent>

          {/* --- チャネルタブ --- */}
          <TabsContent value="channels" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ブランド × チャネル売上</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[200px]" />
                ) : brandGroups.length > 0 ? (
                  <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[160px]"></th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider">売上金額</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[80px]">受注件数</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[100px]">粗利額</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[70px]">粗利率</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[70px]">構成比</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider w-[70px]">前年比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandGroups.map((group) => {
                          const brandRatio = grandTotal.current > 0 ? group.subtotal.current / grandTotal.current : 0
                          const brandYoy = group.subtotal.prev > 0 ? group.subtotal.current / group.subtotal.prev : null
                          return (
                            <React.Fragment key={group.brand}>
                              <tr className="border-b border-black/[0.06] bg-[#F8F6F3]">
                                <td className="px-3 py-2 font-semibold text-[13px] text-[#3D352F]">{group.brand}</td>
                                <td className="px-3 py-2 text-right font-semibold text-[13px] tabular-nums text-[#3D352F]">{formatCurrency(group.subtotal.current)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-[13px] tabular-nums text-[#3D352F]">{formatNumber(group.subtotal.orders)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-[13px] tabular-nums text-[#3D352F]">{formatCurrency(group.subtotal.profit)}</td>
                                <td className="px-3 py-2 text-right font-medium text-[13px] tabular-nums text-[#8A7D72]">
                                  {group.subtotal.current > 0 ? formatPercent(group.subtotal.profit / group.subtotal.current) : '-'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-[13px] text-[#8A7D72] font-medium">{(brandRatio * 100).toFixed(1)}%</td>
                                <td className={`px-3 py-2 text-right text-[13px] font-semibold tabular-nums ${brandYoy == null ? 'text-[#8A7D72]' : brandYoy >= 1 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                  {brandYoy != null ? `${(brandYoy * 100).toFixed(1)}%` : '-'}
                                </td>
                              </tr>
                              {group.channels.map((ch, ci) => {
                                const chRatio = grandTotal.current > 0 ? ch.current / grandTotal.current : 0
                                const chYoy = ch.prev > 0 ? ch.current / ch.prev : null
                                return (
                                  <tr key={`${group.brand}-${ch.channel}`} className={`border-b border-black/[0.04] hover:bg-[#FAFAF8] transition-colors ${ci % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                                    <td className="px-3 py-1.5 pl-7 text-[12px] text-[#5A524B]">{ch.channel}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#3D352F]">{formatCurrency(ch.current)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatNumber(ch.orders)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#5A524B]">{formatCurrency(ch.profit)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#A99D93]">
                                      {ch.current > 0 ? formatPercent(ch.profit / ch.current) : '-'}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#A99D93]">{(chRatio * 100).toFixed(1)}%</td>
                                    <td className={`px-3 py-1.5 text-right text-[12px] font-medium tabular-nums ${chYoy == null ? 'text-[#A99D93]' : chYoy >= 1 ? 'text-emerald-600' : 'text-rose-500'}`}>
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
                        <tr className="border-t-2 border-black/[0.1] bg-gradient-to-b from-[#F3F0ED] to-[#EDE9E5] font-semibold">
                          <td className="px-3 py-2.5 text-[13px] text-[#3D352F]">合計</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-[#3D352F]">{formatCurrency(grandTotal.current)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-[#3D352F]">{formatNumber(grandTotal.orders)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-[#3D352F]">{formatCurrency(grandTotal.profit)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-[#8A7D72]">
                            {grandTotal.current > 0 ? formatPercent(grandTotal.profit / grandTotal.current) : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[13px] text-[#8A7D72]">100.0%</td>
                          <td className={`px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums ${grandTotal.prev > 0 ? (grandTotal.current / grandTotal.prev >= 1 ? 'text-emerald-600' : 'text-rose-500') : ''}`}>
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
          </TabsContent>

          {/* --- 楽天詳細タブ --- */}
          <TabsContent value="rakuten" className="space-y-6">
            <DataSourceBadge sources={[
              { key: 'rakuten', label: '楽天', hasData: rakutenData.availability.rakuten },
            ]} />

            {rakutenLoading ? (
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
              </div>
            ) : rakutenData.daily.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-gray-400 text-sm">楽天店舗データがありません</p>
                  <p className="text-gray-300 text-xs mt-1">「楽天データ」ページからCSVをインポートしてください</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* 転換率ファネル */}
                {rakutenData.funnel && (
                  <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-gray-50/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">転換ファネル（月合計）</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-stretch justify-center gap-3">
                        {[
                          { label: 'アクセス数', value: rakutenData.funnel.access_count, gradient: 'from-sky-50 to-sky-100/60', border: 'border-sky-200/50', text: 'text-sky-900', sub: 'text-sky-600' },
                          { label: 'ユニークユーザー', value: rakutenData.funnel.unique_users, gradient: 'from-indigo-50 to-indigo-100/60', border: 'border-indigo-200/50', text: 'text-indigo-900', sub: 'text-indigo-600' },
                          { label: '購入者数', value: rakutenData.funnel.total_buyers, gradient: 'from-violet-50 to-violet-100/60', border: 'border-violet-200/50', text: 'text-violet-900', sub: 'text-violet-600' },
                          { label: '注文件数', value: rakutenData.funnel.order_count, gradient: 'from-rose-50 to-rose-100/60', border: 'border-rose-200/50', text: 'text-rose-900', sub: 'text-rose-600' },
                        ].map((step, i, arr) => (
                          <React.Fragment key={step.label}>
                            <div className={`flex-1 max-w-[220px] rounded-2xl p-5 text-center bg-gradient-to-br ${step.gradient} border ${step.border} transition-transform hover:scale-[1.02]`}>
                              <div className={`text-[11px] font-medium ${step.sub} uppercase tracking-wider`}>{step.label}</div>
                              <div className={`text-2xl font-bold tabular-nums mt-2 ${step.text}`}>{formatNumber(step.value)}</div>
                              {i > 0 && arr[i - 1].value > 0 && (
                                <div className={`text-[11px] mt-2 font-medium ${step.sub}`}>
                                  {formatPercent(step.value / arr[i - 1].value)}
                                </div>
                              )}
                            </div>
                            {i < arr.length - 1 && (
                              <div className="flex items-center">
                                <ArrowDown className="w-4 h-4 text-gray-300 rotate-[-90deg] shrink-0" />
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* コンサルインサイト */}
                {(() => {
                  const insights: { type: 'success' | 'warning' | 'danger' | 'info'; title: string; detail: string }[] = []
                  // 転換率評価
                  if (rakutenData.funnel && rakutenData.funnel.unique_users > 0) {
                    const cvr = rakutenData.funnel.total_buyers / rakutenData.funnel.unique_users
                    if (cvr >= 0.05) {
                      insights.push({ type: 'success', title: '転換率が好調', detail: `CVR ${(cvr * 100).toFixed(2)}% は楽天市場の平均（2〜3%）を大幅に上回っています。現在の施策を継続してください。` })
                    } else if (cvr >= 0.02) {
                      insights.push({ type: 'info', title: '転換率は標準レベル', detail: `CVR ${(cvr * 100).toFixed(2)}% は楽天市場の平均的な水準です。商品ページの改善やレビュー促進で改善余地があります。` })
                    } else {
                      insights.push({ type: 'danger', title: '転換率が低い', detail: `CVR ${(cvr * 100).toFixed(2)}% は改善が必要です。商品画像・説明文の見直し、価格設定、レビュー数の改善を検討してください。` })
                    }
                  }
                  // DEAL依存度
                  if (rakutenData.coupon && (Number(rakutenData.coupon.total_sales) || 0) > 0) {
                    const dealRatio = (Number(rakutenData.coupon.deal_sales) || 0) / (Number(rakutenData.coupon.total_sales) || 1)
                    if (dealRatio > 0.5) {
                      insights.push({ type: 'warning', title: 'DEAL依存度が高い', detail: `売上の${(dealRatio * 100).toFixed(0)}%がスーパーDEAL経由です。利益率を圧迫している可能性があります。通常売上の強化が課題です。` })
                    } else if (dealRatio > 0.3) {
                      insights.push({ type: 'info', title: 'DEAL活用は適切', detail: `DEAL構成比${(dealRatio * 100).toFixed(0)}%は集客ツールとして適切なバランスです。` })
                    }
                  }
                  // モバイル比率
                  if (rakutenData.device.length > 0) {
                    const totalSales = rakutenData.device.reduce((s, x) => s + (Number(x.sales_amount) || 0), 0)
                    const mobileSales = rakutenData.device.filter(d => !d.device?.includes('PC') && !d.device?.includes('パソコン')).reduce((s, x) => s + (Number(x.sales_amount) || 0), 0)
                    const mobileRatio = totalSales > 0 ? mobileSales / totalSales : 0
                    if (mobileRatio > 0.7) {
                      insights.push({ type: 'info', title: 'モバイル中心の売上構造', detail: `モバイル比率${(mobileRatio * 100).toFixed(0)}%。スマホ向けページの最適化と表示速度改善が売上に直結します。` })
                    } else if (mobileRatio < 0.4) {
                      insights.push({ type: 'warning', title: 'モバイル売上が低い', detail: `モバイル比率${(mobileRatio * 100).toFixed(0)}%は低めです。楽天全体ではモバイル70%超が一般的。スマホ向けの商品ページを改善しましょう。` })
                    }
                  }
                  // リピート率
                  if (rakutenData.newRepeat.length > 0) {
                    const latest = rakutenData.newRepeat[rakutenData.newRepeat.length - 1]
                    const repeatRate = Number(latest.repeat_rate) || 0
                    if (repeatRate >= 0.3) {
                      insights.push({ type: 'success', title: 'リピート率が優秀', detail: `直近月のリピート率${(repeatRate * 100).toFixed(1)}%。顧客ロイヤルティが高く、LTV向上が期待できます。` })
                    } else if (repeatRate < 0.15) {
                      insights.push({ type: 'danger', title: 'リピート率に課題', detail: `リピート率${(repeatRate * 100).toFixed(1)}%は低水準です。フォローメール・同梱物・リピート特典の導入を検討してください。` })
                    }
                  }
                  // 客単価
                  if (rakutenData.funnel && rakutenData.funnel.total_buyers > 0) {
                    const totalDailySales = rakutenData.daily.reduce((s, d) => s + (Number(d.sales_amount) || 0), 0)
                    const aov = totalDailySales / rakutenData.funnel.total_buyers
                    if (aov > 0) {
                      insights.push({ type: 'info', title: `客単価 ${formatCurrency(aov)}`, detail: aov >= 5000 ? 'セット売りやまとめ買い促進で更なる向上が見込めます。' : 'クロスセル・アップセルの仕組みを導入し、客単価向上を図りましょう。' })
                    }
                  }

                  if (insights.length === 0) return null
                  const iconMap = { success: CheckCircle2, warning: AlertTriangle, danger: TrendingDown, info: Info }
                  const colorMap = {
                    success: 'bg-emerald-50 border-emerald-200/60 text-emerald-800',
                    warning: 'bg-amber-50 border-amber-200/60 text-amber-800',
                    danger: 'bg-red-50 border-red-200/60 text-red-800',
                    info: 'bg-blue-50 border-blue-200/60 text-blue-800',
                  }
                  const iconColorMap = { success: 'text-emerald-600', warning: 'text-amber-600', danger: 'text-red-600', info: 'text-blue-600' }

                  return (
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#BF0000]" />
                          自動分析インサイト
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {insights.map((insight) => {
                            const Icon = iconMap[insight.type]
                            return (
                              <div key={insight.title} className={`flex gap-3 p-4 rounded-xl border ${colorMap[insight.type]}`}>
                                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColorMap[insight.type]}`} />
                                <div className="min-w-0">
                                  <div className="text-[13px] font-semibold">{insight.title}</div>
                                  <div className="text-[12px] mt-1 opacity-80 leading-relaxed">{insight.detail}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}

                {/* デバイス別 + クーポン/DEAL分析 */}
                <div className="grid grid-cols-2 gap-6">
                  {/* デバイス別内訳 */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">デバイス別内訳</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {rakutenData.device.length > 0 ? (
                        <div className="space-y-3">
                          {rakutenData.device.map((d) => {
                            const totalSales = rakutenData.device.reduce((s, x) => s + (Number(x.sales_amount) || 0), 0)
                            const share = totalSales > 0 ? (Number(d.sales_amount) || 0) / totalSales : 0
                            const isPC = d.device?.includes('PC') || d.device?.includes('パソコン')
                            return (
                              <div key={d.device} className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-50/80 to-white rounded-xl border border-gray-100/60 hover:shadow-sm transition-shadow">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${isPC ? 'bg-blue-50 border border-blue-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                                  {isPC ? <Monitor className="w-5 h-5 text-blue-600" /> : <Smartphone className="w-5 h-5 text-emerald-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[13px] font-semibold text-[#3D352F]">{d.device}</span>
                                    <span className="text-[14px] font-bold text-[#3D352F] tabular-nums">{formatCurrency(Number(d.sales_amount) || 0)}</span>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1.5">
                                    <span className="text-[11px] text-gray-500">構成比 <span className="font-medium text-[#5A524B]">{formatPercent(share)}</span></span>
                                    <span className="text-[11px] text-gray-500">転換率 <span className="font-medium text-[#5A524B]">{formatPercent(Number(d.conversion_rate) || 0)}</span></span>
                                    <span className="text-[11px] text-gray-500">客単価 <span className="font-medium text-[#5A524B]">{formatCurrency(Number(d.avg_order_value) || 0)}</span></span>
                                  </div>
                                  <div className="w-full h-2 bg-gray-100 rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-[#BF0000] to-[#E84040] rounded-full transition-all duration-500" style={{ width: `${share * 100}%` }} />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* クーポン・DEAL・ポイント分析 */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">クーポン・DEAL・ポイント</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {rakutenData.coupon ? (
                        <div className="space-y-4">
                          {/* DEAL vs 通常 */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-100/60">
                              <div className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">スーパーDEAL</div>
                              <div className="text-xl font-bold text-red-800 tabular-nums mt-1">{formatCurrency(Number(rakutenData.coupon.deal_sales) || 0)}</div>
                              <div className="text-[11px] text-red-500 mt-1.5">
                                {formatNumber(Number(rakutenData.coupon.deal_orders) || 0)}件 / 転換率 {formatPercent(Number(rakutenData.coupon.deal_conversion_rate) || 0)}
                              </div>
                            </div>
                            <div className="p-4 bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl border border-gray-100/60">
                              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">通常売上</div>
                              <div className="text-xl font-bold text-gray-800 tabular-nums mt-1">{formatCurrency(Number(rakutenData.coupon.normal_sales) || 0)}</div>
                              <div className="text-[11px] text-gray-500 mt-1.5">
                                {formatNumber(Number(rakutenData.coupon.normal_orders) || 0)}件 / 転換率 {formatPercent(Number(rakutenData.coupon.normal_conversion_rate) || 0)}
                              </div>
                            </div>
                          </div>
                          {/* DEAL構成比バー */}
                          {(Number(rakutenData.coupon.total_sales) || 0) > 0 && (
                            <div className="px-1">
                              <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
                                <span className="font-medium">DEAL構成比</span>
                                <span className="tabular-nums font-semibold text-[#3D352F]">{formatPercent((Number(rakutenData.coupon.deal_sales) || 0) / (Number(rakutenData.coupon.total_sales) || 1))}</span>
                              </div>
                              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-[#BF0000] to-[#E84040] rounded-full transition-all duration-500"
                                  style={{ width: `${((Number(rakutenData.coupon.deal_sales) || 0) / (Number(rakutenData.coupon.total_sales) || 1)) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {/* クーポン・ポイント内訳 */}
                          <div className="border-t border-gray-100/80 pt-4 space-y-2.5">
                            {[
                              { label: '店舗クーポン', value: rakutenData.coupon.coupon_store, danger: false },
                              { label: '楽天クーポン', value: rakutenData.coupon.coupon_rakuten, danger: false },
                              { label: '送料無料クーポン', value: rakutenData.coupon.free_shipping, danger: false },
                              { label: 'ポイント売上', value: rakutenData.coupon.points_sales, danger: false },
                              { label: 'ポイント原資', value: rakutenData.coupon.points_cost, danger: true },
                            ].map((item) => (
                              <div key={item.label} className="flex items-center justify-between text-[12px] py-0.5">
                                <span className="text-gray-500">{item.label}</span>
                                <span className={`font-semibold tabular-nums ${item.danger ? 'text-red-600' : 'text-[#3D352F]'}`}>{formatCurrency(Number(item.value) || 0)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* 新規・リピート推移（月次） */}
                {rakutenData.newRepeat.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">新規・リピート購入者数推移（楽天・月次）</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                              <th className="text-left px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">月</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">新規購入者</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">新規売上</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">新規客単価</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">リピート購入者</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">リピート売上</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">リピート客単価</th>
                              <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">リピート率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rakutenData.newRepeat.map((nr, i) => (
                              <tr key={nr.month} className={`border-b border-black/[0.04] hover:bg-[#FAFAF8] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                                <td className="px-3 py-1.5 text-[12px] text-[#3D352F] font-medium">{nr.month}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-blue-700">{formatNumber(Number(nr.new_buyers) || 0)}人</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#3D352F]">{formatCurrency(Number(nr.new_sales) || 0)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatCurrency(Number(nr.new_avg_order_value) || 0)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-indigo-700">{formatNumber(Number(nr.repeat_buyers) || 0)}人</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#3D352F]">{formatCurrency(Number(nr.repeat_sales) || 0)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatCurrency(Number(nr.repeat_avg_order_value) || 0)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">
                                  <span className={(Number(nr.repeat_rate) || 0) >= 0.3 ? 'text-emerald-600 font-medium' : 'text-[#3D352F]'}>
                                    {formatPercent(Number(nr.repeat_rate) || 0)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 日次売上・アクセス推移テーブル */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-[#3D352F] tracking-tight">日次データ一覧</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                            <th className="text-left px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">日付</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">売上</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">注文数</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">アクセス</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">UU</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">転換率</th>
                            <th className="text-right px-3 py-2 text-[11px] font-semibold text-[#8A7D72]">客単価</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rakutenData.daily.map((d, i) => (
                            <tr key={d.date} className={`border-b border-black/[0.04] hover:bg-[#FAFAF8] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                              <td className="px-3 py-1.5 text-[12px] text-[#3D352F] font-medium">{d.date}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#3D352F]">{formatCurrency(Number(d.sales_amount) || 0)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#5A524B]">{formatNumber(Number(d.order_count) || 0)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#5A524B]">{formatNumber(Number(d.access_count) || 0)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatNumber(Number(d.unique_users) || 0)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatPercent(Number(d.conversion_rate) || 0)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-[12px] text-[#8A7D72]">{formatCurrency(Number(d.avg_order_value) || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black/[0.1] bg-gradient-to-b from-[#F3F0ED] to-[#EDE9E5] font-semibold">
                            <td className="px-3 py-2 text-[12px] text-[#3D352F]">合計</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F]">
                              {formatCurrency(rakutenData.daily.reduce((s, d) => s + (Number(d.sales_amount) || 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F]">
                              {formatNumber(rakutenData.daily.reduce((s, d) => s + (Number(d.order_count) || 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F]">
                              {formatNumber(rakutenData.daily.reduce((s, d) => s + (Number(d.access_count) || 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[12px] text-[#3D352F]">
                              {formatNumber(rakutenData.daily.reduce((s, d) => s + (Number(d.unique_users) || 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right text-[12px] text-[#8A7D72]">-</td>
                            <td className="px-3 py-2 text-right text-[12px] text-[#8A7D72]">-</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
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
