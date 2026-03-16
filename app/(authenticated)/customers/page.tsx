'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import KPICard from '@/components/cards/KPICard'
import StackedBarChart from '@/components/charts/StackedBarChart'
import BarChart from '@/components/charts/BarChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatChangeRate, getCurrentMonth } from '@/lib/format'

interface SummaryData {
  new_customers: number
  repeat_customers: number
  repeat_rate: number
  new_avg_order_value: number
  repeat_avg_order_value: number
  prev_new_customers: number
  prev_repeat_customers: number
  prev_repeat_rate: number
}

interface TrendItem {
  month: string
  new_count: number
  repeat_count: number
  repeat_rate: number
}

interface ChannelRepeatItem {
  shop_name: string
  repeat_rate: number
  customer_count: number
}

interface ChannelDetailItem {
  shop_name: string
  new_customers: number
  new_sales: number
  new_avg_order_value: number
  repeat_customers: number
  repeat_sales: number
  repeat_avg_order_value: number
  repeat_rate: number
  new_sales_share: number
  repeat_sales_share: number
}

interface BrandSummary {
  brand: string
  new_customers: number
  new_sales: number
  new_avg_order_value: number
  repeat_customers: number
  repeat_sales: number
  repeat_avg_order_value: number
  repeat_rate: number
}

function extractBrand(shopName: string): string {
  const match = shopName.match(/】(.+)$/)
  return match ? match[1] : shopName
}

function CustomersPageContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const [brand, setBrand] = useState(urlBrand || '全て')
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [channelRepeat, setChannelRepeat] = useState<ChannelRepeatItem[]>([])
  const [channelDetail, setChannelDetail] = useState<ChannelDetailItem[]>([])
  const [loading, setLoading] = useState(true)

  const brandParam = brand === '全て' ? '' : `&brand=${brand}`

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, trendRes, repeatRes, detailRes] = await Promise.all([
        fetch(`/api/customers/summary?month=${month}${brandParam}`),
        fetch(`/api/customers/monthly-trend?months=24${brandParam}`),
        fetch(`/api/customers/channel-repeat-rate?month=${month}${brandParam}`),
        fetch(`/api/customers/channel-detail?month=${month}${brandParam}`),
      ])
      const [summaryData, trendData, repeatData, detailData] = await Promise.all([
        summaryRes.ok ? summaryRes.json() : null,
        trendRes.ok ? trendRes.json() : [],
        repeatRes.ok ? repeatRes.json() : [],
        detailRes.ok ? detailRes.json() : [],
      ])
      setSummary(summaryData)
      setTrend(Array.isArray(trendData) ? trendData : [])
      setChannelRepeat(Array.isArray(repeatData) ? repeatData : [])
      setChannelDetail(Array.isArray(detailData) ? detailData : [])
    } catch (e) {
      console.error('Failed to fetch customer data:', e)
    } finally {
      setLoading(false)
    }
  }, [month, brandParam])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Transform trend data for StackedBarChart
  const trendChartData = trend.map((item) => ({
    month: item.month,
    '新規': item.new_count,
    'リピート': item.repeat_count,
    'リピート率': item.repeat_rate,
  }))

  const trendKeys = ['新規', 'リピート']
  const trendColors: Record<string, string> = {
    '新規': '#93C5FD',
    'リピート': '#1E40AF',
  }

  // Transform channel repeat data for horizontal BarChart
  const repeatBarData = channelRepeat.map((item) => ({
    name: item.shop_name,
    value: item.repeat_rate,
  }))

  // Brand summary: aggregate channel detail by brand
  const brandSummary: BrandSummary[] = (() => {
    const brandMap: Record<string, { newCust: number; newSales: number; newOrders: number; repCust: number; repSales: number; repOrders: number }> = {}
    for (const ch of channelDetail) {
      const b = extractBrand(ch.shop_name)
      if (!brandMap[b]) {
        brandMap[b] = { newCust: 0, newSales: 0, newOrders: 0, repCust: 0, repSales: 0, repOrders: 0 }
      }
      brandMap[b].newCust += ch.new_customers
      brandMap[b].newSales += ch.new_sales
      brandMap[b].repCust += ch.repeat_customers
      brandMap[b].repSales += ch.repeat_sales
      // Reconstruct order counts from avg and customer counts
      if (ch.new_avg_order_value > 0) {
        brandMap[b].newOrders += Math.round(ch.new_sales / ch.new_avg_order_value)
      }
      if (ch.repeat_avg_order_value > 0) {
        brandMap[b].repOrders += Math.round(ch.repeat_sales / ch.repeat_avg_order_value)
      }
    }
    return Object.entries(brandMap).map(([b, d]) => {
      const totalCust = d.newCust + d.repCust
      return {
        brand: b,
        new_customers: d.newCust,
        new_sales: d.newSales,
        new_avg_order_value: d.newOrders > 0 ? d.newSales / d.newOrders : 0,
        repeat_customers: d.repCust,
        repeat_sales: d.repSales,
        repeat_avg_order_value: d.repOrders > 0 ? d.repSales / d.repOrders : 0,
        repeat_rate: totalCust > 0 ? d.repCust / totalCust : 0,
      }
    })
  })()

  return (
    <>
      <Header title={urlBrand ? `${urlBrand} 顧客分析` : '顧客分析'} />
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
              title="今月新規顧客数"
              value={`${formatNumber(summary.new_customers)}人`}
              change={formatChangeRate(summary.new_customers, summary.prev_new_customers)}
            />
            <KPICard
              title="今月リピート顧客数"
              value={`${formatNumber(summary.repeat_customers)}人`}
              change={formatChangeRate(summary.repeat_customers, summary.prev_repeat_customers)}
            />
            <KPICard
              title="リピート率"
              value={formatPercent(summary.repeat_rate)}
              change={formatChangeRate(summary.repeat_rate, summary.prev_repeat_rate)}
            />
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">客単価比較</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <div>
                    <span className="text-xs text-gray-400 block">新規</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatCurrency(summary.new_avg_order_value)}
                    </span>
                  </div>
                  <span className="text-gray-300 text-lg">/</span>
                  <div>
                    <span className="text-xs text-gray-400 block">リピート</span>
                    <span
                      className={`text-lg font-bold ${
                        summary.repeat_avg_order_value > summary.new_avg_order_value
                          ? 'text-green-600'
                          : 'text-gray-900'
                      }`}
                    >
                      {formatCurrency(summary.repeat_avg_order_value)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Main Charts */}
        <div className="grid grid-cols-5 gap-6">
          <Card className="col-span-3">
            <CardHeader>
              <CardTitle className="text-base">新規 vs リピート 月別推移</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[350px]" />
              ) : trendChartData.length > 0 ? (
                <StackedBarChart
                  data={trendChartData}
                  keys={trendKeys}
                  colors={trendColors}
                  lineKey="リピート率"
                  lineColor="#F97316"
                />
              ) : (
                <div className="h-[350px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle className="text-base">チャネル別リピート率（直近3ヶ月）</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[350px]" />
              ) : repeatBarData.length > 0 ? (
                <BarChart
                  data={repeatBarData}
                  color="#1E40AF"
                  formatValue={(v) => formatPercent(v)}
                />
              ) : (
                <div className="h-[350px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Channel Detail Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">チャネル別 顧客詳細</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600">チャネル</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規顧客</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規売上</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規客単価</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート顧客</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート売上</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート客単価</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート率</th>
                      <th className="text-right p-2 font-medium text-gray-600">売上構成比 (新規:リピート)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelDetail.map((ch) => (
                      <tr key={ch.shop_name} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{ch.shop_name}</td>
                        <td className="p-2 text-right">{formatNumber(ch.new_customers)}</td>
                        <td className="p-2 text-right">{formatCurrency(ch.new_sales)}</td>
                        <td className="p-2 text-right">{formatCurrency(ch.new_avg_order_value)}</td>
                        <td className="p-2 text-right">{formatNumber(ch.repeat_customers)}</td>
                        <td className="p-2 text-right">{formatCurrency(ch.repeat_sales)}</td>
                        <td className="p-2 text-right">{formatCurrency(ch.repeat_avg_order_value)}</td>
                        <td className="p-2 text-right font-medium">
                          <span className={ch.repeat_rate >= 0.3 ? 'text-green-600' : 'text-gray-900'}>
                            {formatPercent(ch.repeat_rate)}
                          </span>
                        </td>
                        <td className="p-2 text-right text-xs text-gray-500">
                          {formatPercent(ch.new_sales_share, 0)} : {formatPercent(ch.repeat_sales_share, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand Summary Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ブランド別 顧客サマリ</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[150px]" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2 font-medium text-gray-600">ブランド</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規顧客</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規売上</th>
                      <th className="text-right p-2 font-medium text-gray-600">新規客単価</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート顧客</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート売上</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート客単価</th>
                      <th className="text-right p-2 font-medium text-gray-600">リピート率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandSummary.map((bs) => (
                      <tr key={bs.brand} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{bs.brand}</td>
                        <td className="p-2 text-right">{formatNumber(bs.new_customers)}</td>
                        <td className="p-2 text-right">{formatCurrency(bs.new_sales)}</td>
                        <td className="p-2 text-right">{formatCurrency(bs.new_avg_order_value)}</td>
                        <td className="p-2 text-right">{formatNumber(bs.repeat_customers)}</td>
                        <td className="p-2 text-right">{formatCurrency(bs.repeat_sales)}</td>
                        <td className="p-2 text-right">{formatCurrency(bs.repeat_avg_order_value)}</td>
                        <td className="p-2 text-right font-medium">
                          <span className={bs.repeat_rate >= 0.3 ? 'text-green-600' : 'text-gray-900'}>
                            {formatPercent(bs.repeat_rate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersPageContent />
    </Suspense>
  )
}
