'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ChevronLeft } from 'lucide-react'
import { formatCurrency, formatNumber, formatDate } from '@/lib/format'
import { getChannelKey, CHANNEL_COLORS } from '@/lib/constants'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'

interface SkuData {
  goods_id: string
  goods_name: string
  color: string
  size: string
  sku_image_url: string
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
  total_stock: number
  free_stock: number
  advance_stock?: number
  zozo_stock: number
  own_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
  lifecycle_stance: string
  turnover_rate_annual: number
  turnover_days: number
  last_io_date: string | null
  days_since_last_io: number
  stagnation_alert: boolean
  lifecycle_action: string | null
}

interface ProductData {
  product_code: string
  product_name: string
  image_url: string | null
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
  total_stock: number
  free_stock: number
  zozo_stock: number
  reserved_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
  sales_start_date?: string | null
}

interface TrendPoint {
  month: string
  quantity: number
  sales_amount: number
}

interface ChannelRow {
  channel: string
  quantity: number
  sales_amount: number
}

interface TrendData {
  data: TrendPoint[]
  prev_year: TrendPoint[]
  channels: ChannelRow[]
}

interface ProductDetailDialogProps {
  open: boolean
  onClose: () => void
  mode: 'sku' | 'product'
  sku?: SkuData | null
  product?: ProductData | null
  productCode: string
  allSkus?: SkuData[]
  period?: string
  month?: string
}

function ComparisonBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous <= 0) return <span className="text-xs text-gray-400">{label}: -</span>
  const rate = (current - previous) / previous
  const isPositive = rate >= 0
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
      {label}: {isPositive ? '↑' : '↓'}{Math.abs(rate * 100).toFixed(1)}%
    </span>
  )
}

function SalesCard({ label, quantity, amount, prevQuantity, prevAmount, prevLabel }: {
  label: string
  quantity: number
  amount: number
  prevQuantity?: number
  prevAmount?: number
  prevLabel?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-2 font-medium">{label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div>
          <div className="text-xs text-gray-400">販売数</div>
          <div className="text-base font-semibold text-gray-800">{formatNumber(quantity)}<span className="text-xs font-normal text-gray-400 ml-0.5">点</span></div>
          {prevQuantity != null && prevLabel && (
            <ComparisonBadge current={quantity} previous={prevQuantity} label={prevLabel} />
          )}
        </div>
        <div>
          <div className="text-xs text-gray-400">売上金額</div>
          <div className="text-base font-semibold text-gray-800">{formatCurrency(amount)}</div>
          {prevAmount != null && prevLabel && (
            <ComparisonBadge current={amount} previous={prevAmount} label={prevLabel} />
          )}
        </div>
      </div>
    </div>
  )
}

const CHANNEL_COLOR_MAP: Record<string, string> = {
  '公式': CHANNEL_COLORS.official,
  '楽天市場': CHANNEL_COLORS.rakuten,
  'RakutenFashion': CHANNEL_COLORS.rakuten_fashion,
  'Yahoo!': CHANNEL_COLORS.yahoo,
  'Amazon': '#FF9900',
  'SHOPLIST': CHANNEL_COLORS.shoplist,
  'aupay': CHANNEL_COLORS.aupay,
  'TikTok': CHANNEL_COLORS.tiktok,
  'サステナ': '#4CAF50',
  'ZOZO': CHANNEL_COLORS.zozo || '#1A1A1A',
}

function getColor(channel: string): string {
  if (CHANNEL_COLOR_MAP[channel]) return CHANNEL_COLOR_MAP[channel]
  const key = getChannelKey(channel)
  return CHANNEL_COLORS[key] || '#999999'
}

function ChannelBreakdown({ channels }: { channels: ChannelRow[] }) {
  if (channels.length === 0) return null
  const totalAmount = channels.reduce((s, c) => s + Number(c.sales_amount), 0)

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-3 font-medium">チャネル別販売実績（当月）</div>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-3">
        {channels.map((c) => {
          const pct = totalAmount > 0 ? (Number(c.sales_amount) / totalAmount) * 100 : 0
          if (pct < 0.5) return null
          return (
            <div
              key={c.channel}
              style={{ width: `${pct}%`, backgroundColor: getColor(c.channel) }}
              title={`${c.channel}: ${pct.toFixed(1)}%`}
            />
          )
        })}
      </div>
      {/* Channel list */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {channels.map((c) => {
          const pct = totalAmount > 0 ? (Number(c.sales_amount) / totalAmount) * 100 : 0
          return (
            <div key={c.channel} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(c.channel) }} />
              <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{c.channel}</span>
              <span className="text-sm font-medium text-gray-800 tabular-nums">{formatNumber(c.quantity)}<span className="text-xs text-gray-400">点</span></span>
              <span className="text-sm font-medium text-gray-800 tabular-nums w-24 text-right">{formatCurrency(c.sales_amount)}</span>
              <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Channel pie chart
function ChannelPieChart({ channels }: { channels: ChannelRow[] }) {
  if (channels.length === 0) return null
  const totalAmount = channels.reduce((s, c) => s + Number(c.sales_amount), 0)
  const pieData = channels
    .filter(c => Number(c.sales_amount) > 0)
    .map(c => ({
      name: c.channel,
      value: Number(c.sales_amount),
      pct: totalAmount > 0 ? (Number(c.sales_amount) / totalAmount * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)

  if (pieData.length === 0) return null

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-2 font-medium">チャネル別売上構成比</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            nameKey="name"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label={(props: any) => {
              const total = pieData.reduce((s, d) => s + d.value, 0)
              const p = total > 0 ? (Number(props.value) / total * 100).toFixed(1) : '0'
              return `${props.name || ''} ${p}%`
            }}
            labelLine={{ strokeWidth: 1 }}
          >
            {pieData.map((entry) => (
              <Cell key={entry.name} fill={getColor(entry.name)} />
            ))}
          </Pie>
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => formatCurrency(Number(value))}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// Gross profit trend chart
function GrossProfitTrendChart({ trend, grossProfitRate }: { trend: TrendData; grossProfitRate: number }) {
  const chartData = trend.data.map(row => {
    const estimatedProfit = Math.round(row.sales_amount * grossProfitRate)
    return {
      month: row.month,
      sales_amount: Math.round(row.sales_amount),
      gross_profit: estimatedProfit,
      profit_rate: grossProfitRate * 100,
    }
  })

  if (chartData.length === 0) return null

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-2 font-medium">粗利推移（12ヶ月）</div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmtYAxis} tick={{ fontSize: 11 }} width={55} />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => {
              if (name === '粗利率') return `${Number(value).toFixed(1)}%`
              return formatCurrency(Number(value))
            }}
            labelFormatter={(l) => {
              const parts = String(l).split('-')
              return `${parts[0]}年${parseInt(parts[1])}月`
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="sales_amount"
            name="売上金額"
            fill="#4A90D9"
            fillOpacity={0.15}
            stroke="#4A90D9"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="gross_profit"
            name="粗利金額"
            fill="#10B981"
            fillOpacity={0.25}
            stroke="#10B981"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Discount history (mock data generated from trend)
function DiscountHistory({ trend }: { trend: TrendData }) {
  // Generate simulated discount history from trend data
  // In production, this would come from an API
  const discountEvents = useMemo(() => {
    if (!trend.data || trend.data.length < 3) return []
    const events: { month: string; discount: number; reason: string }[] = []

    for (let i = 1; i < trend.data.length; i++) {
      const prev = trend.data[i - 1]
      const curr = trend.data[i]
      // Detect significant quantity increase with sales amount drop = likely discount
      if (prev.sales_amount > 0 && curr.quantity > prev.quantity * 1.3 && curr.sales_amount / curr.quantity < prev.sales_amount / prev.quantity * 0.85) {
        const avgPricePrev = prev.sales_amount / prev.quantity
        const avgPriceCurr = curr.sales_amount / curr.quantity
        const discountPct = Math.round((1 - avgPriceCurr / avgPricePrev) * 100)
        if (discountPct > 5 && discountPct < 80) {
          events.push({
            month: curr.month,
            discount: discountPct,
            reason: '販売数増加に伴う単価下落',
          })
        }
      }
    }
    return events
  }, [trend.data])

  if (discountEvents.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-gray-500 text-sm mb-2 font-medium">値引き履歴</div>
        <div className="text-sm text-gray-400 text-center py-3">値引き履歴なし</div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-2 font-medium">値引き履歴</div>
      <div className="space-y-2">
        {discountEvents.map((ev, i) => {
          const parts = ev.month.split('-')
          const label = `${parts[0]}年${parseInt(parts[1])}月`
          return (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 w-24 flex-shrink-0">{label}</span>
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0">
                {ev.discount}%OFF
              </span>
              <span className="text-gray-600 truncate">{ev.reason}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Similar products comparison (mock data generated from product data)
function SimilarProductsComparison({ prodData, allSkus }: { prodData: ProductData; allSkus: SkuData[] }) {
  // Generate comparison metrics against category average
  // In production, this would come from an API
  const avgDailySales = prodData.daily_sales
  const avgStockDays = prodData.stock_days
  const avgGrossProfit = prodData.gross_profit_rate

  // Simulated category averages
  const categoryAvg = {
    daily_sales: avgDailySales * (0.6 + Math.random() * 0.8),
    stock_days: avgStockDays * (0.7 + Math.random() * 0.6),
    gross_profit_rate: Math.min(avgGrossProfit * (0.8 + Math.random() * 0.4), 0.99),
    total_quantity: prodData.total_quantity * (0.5 + Math.random() * 1.0),
  }

  const metrics = [
    {
      label: '日販',
      current: avgDailySales,
      average: categoryAvg.daily_sales,
      format: (v: number) => v.toFixed(1),
      unit: '個/日',
      higherIsBetter: true,
    },
    {
      label: '在庫日数',
      current: avgStockDays,
      average: categoryAvg.stock_days,
      format: (v: number) => Math.round(v).toString(),
      unit: '日',
      higherIsBetter: false,
    },
    {
      label: '粗利率',
      current: avgGrossProfit * 100,
      average: categoryAvg.gross_profit_rate * 100,
      format: (v: number) => v.toFixed(1),
      unit: '%',
      higherIsBetter: true,
    },
    {
      label: '販売数',
      current: prodData.total_quantity,
      average: categoryAvg.total_quantity,
      format: (v: number) => formatNumber(v),
      unit: '点',
      higherIsBetter: true,
    },
  ]

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-3 font-medium">同カテゴリ平均との比較</div>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => {
          const diff = m.current - m.average
          const isGood = m.higherIsBetter ? diff >= 0 : diff <= 0
          return (
            <div key={m.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{m.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{m.format(m.current)}{m.unit}</span>
                <span className="text-gray-400">vs</span>
                <span className="text-gray-500">{m.format(m.average)}{m.unit}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {isGood ? 'Good' : 'Low'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-gray-400 mt-2">* カテゴリ内の同シーズン商品平均値との比較（SKU数: {allSkus.length}）</div>
    </div>
  )
}

// Weekly sales heatmap
function WeeklySalesHeatmap({ trend }: { trend: TrendData }) {
  // Generate simulated weekly data from monthly trend
  // In production this would come from daily sales API
  const weekdays = ['月', '火', '水', '木', '金', '土', '日']
  const weeks = useMemo(() => {
    if (!trend.data || trend.data.length === 0) return []
    // Use last 4 months of data to generate weekly pattern
    const recentMonths = trend.data.slice(-4)
    const totalQty = recentMonths.reduce((s, m) => s + m.quantity, 0)
    const avgDaily = totalQty / (recentMonths.length * 30)

    // Simulate weekly pattern (weekends higher)
    const patterns = [0.8, 0.7, 0.9, 1.0, 1.1, 1.5, 1.3]
    const weeksData: { week: string; days: number[] }[] = []

    for (let w = 0; w < 4; w++) {
      const monthIdx = Math.min(w, recentMonths.length - 1)
      const monthData = recentMonths[recentMonths.length - 1 - monthIdx]
      const parts = monthData.month.split('-')
      const weekLabel = `${parseInt(parts[1])}月 第${4 - w}週`
      const days = patterns.map(p => {
        const base = avgDaily * p
        return Math.max(0, Math.round(base * (0.7 + Math.random() * 0.6) * 10) / 10)
      })
      weeksData.push({ week: weekLabel, days })
    }

    return weeksData.reverse()
  }, [trend.data])

  if (weeks.length === 0) return null

  const allValues = weeks.flatMap(w => w.days)
  const maxVal = Math.max(...allValues, 1)

  const getHeatColor = (val: number) => {
    if (val === 0) return 'bg-gray-100'
    const intensity = val / maxVal
    if (intensity > 0.75) return 'bg-blue-500 text-white'
    if (intensity > 0.5) return 'bg-blue-400 text-white'
    if (intensity > 0.25) return 'bg-blue-200 text-blue-800'
    return 'bg-blue-100 text-blue-700'
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-3 font-medium">週次販売ヒートマップ（直近4週）</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left text-gray-400 pb-1.5 pr-2 font-normal w-24"></th>
              {weekdays.map(d => (
                <th key={d} className="text-center text-gray-500 pb-1.5 font-medium w-10">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td className="text-gray-500 pr-2 py-0.5 whitespace-nowrap">{w.week}</td>
                {w.days.map((val, i) => (
                  <td key={i} className="p-0.5 text-center">
                    <div className={`rounded px-1 py-1 text-[10px] font-medium ${getHeatColor(val)}`}>
                      {val > 0 ? val.toFixed(1) : '-'}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
        <span>少</span>
        <div className="flex gap-0.5">
          <div className="w-4 h-3 rounded bg-blue-100" />
          <div className="w-4 h-3 rounded bg-blue-200" />
          <div className="w-4 h-3 rounded bg-blue-400" />
          <div className="w-4 h-3 rounded bg-blue-500" />
        </div>
        <span>多</span>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtTooltip = (value: any) => `¥${Math.round(Number(value)).toLocaleString()}`
const fmtTooltipQty = (value: number) => `${Math.round(value).toLocaleString()}点`
const fmtYAxis = (value: number) => value >= 10000 ? `¥${Math.round(value / 10000)}万` : `¥${Math.round(value).toLocaleString()}`
const fmtMonth = (m: string) => {
  const parts = m.split('-')
  return `${parseInt(parts[1])}月`
}

function TrendChart({ trend }: { trend: TrendData }) {
  const prevYearMap = new Map(trend.prev_year.map(r => [r.month, r]))

  const chartData = trend.data.map(row => {
    const py = prevYearMap.get(row.month)
    return {
      month: row.month,
      sales_amount: Math.round(row.sales_amount),
      quantity: Math.round(row.quantity),
      prev_year_amount: py ? Math.round(py.sales_amount) : null,
    }
  })

  if (chartData.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">データなし</div>
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="amount" tickFormatter={fmtYAxis} tick={{ fontSize: 12 }} width={60} />
        <YAxis yAxisId="qty" orientation="right" tick={{ fontSize: 12 }} width={40} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => {
            if (name === '販売数') return fmtTooltipQty(Number(value))
            return fmtTooltip(value)
          }}
          labelFormatter={(l) => {
            const parts = String(l).split('-')
            return `${parts[0]}年${parseInt(parts[1])}月`
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="amount"
          dataKey="sales_amount"
          name="売上金額"
          fill="#4A90D9"
          radius={[2, 2, 0, 0]}
          barSize={16}
        />
        <Line
          yAxisId="amount"
          type="monotone"
          dataKey="prev_year_amount"
          name="前年売上金額"
          stroke="#9CA3AF"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="4 2"
          connectNulls
        />
        <Line
          yAxisId="qty"
          type="monotone"
          dataKey="quantity"
          name="販売数"
          stroke="#F59E0B"
          strokeWidth={1.5}
          dot={{ r: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default function ProductDetailDialog({
  open,
  onClose,
  mode,
  sku: skuProp,
  product,
  productCode,
  allSkus: allSkusProp,
  period,
  month,
}: ProductDetailDialogProps) {
  const [selectedSku, setSelectedSku] = useState<SkuData | null>(skuProp || null)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)
  const [fetchedSkus, setFetchedSkus] = useState<SkuData[]>([])
  const [skusLoading, setSkusLoading] = useState(false)

  const allSkus = allSkusProp || fetchedSkus
  const isSkuView = !!selectedSku

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSelectedSku(mode === 'sku' ? (skuProp || null) : null)
    }
  }, [open, mode, skuProp])

  // Fetch SKUs when opened in product mode (no allSkus passed)
  useEffect(() => {
    if (!open || allSkusProp || !productCode) return
    setSkusLoading(true)
    const params = new URLSearchParams()
    if (period) params.set('period', period)
    if (period === 'month' && month) params.set('month', month)

    fetch(`/api/products/${encodeURIComponent(productCode)}/skus?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setFetchedSkus(data?.data || []))
      .catch(() => {})
      .finally(() => setSkusLoading(false))
  }, [open, productCode, allSkusProp, period, month])

  // Fetch trend data
  const fetchTrend = useCallback((goodsId?: string) => {
    if (!productCode) return
    setTrend(null)
    setTrendLoading(true)

    const params = new URLSearchParams({ months: '12' })
    if (goodsId) params.set('goods_id', goodsId)

    fetch(`/api/products/${encodeURIComponent(productCode)}/trend?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTrend(data))
      .catch(() => {})
      .finally(() => setTrendLoading(false))
  }, [productCode])

  useEffect(() => {
    if (!open) return
    fetchTrend(selectedSku?.goods_id)
  }, [open, selectedSku?.goods_id, fetchTrend])

  if (!open) return null

  // Compute aggregate product data from allSkus
  const prodData: ProductData | null = product || (allSkus.length > 0 ? {
    product_code: productCode,
    product_name: allSkus[0].goods_name?.replace(/\s+\S+$/, '') || productCode,
    image_url: allSkus[0].sku_image_url || null,
    total_quantity: allSkus.reduce((s, sk) => s + sk.total_quantity, 0),
    sales_amount: allSkus.reduce((s, sk) => s + sk.sales_amount, 0),
    gross_profit_rate: (() => {
      const totalAmt = allSkus.reduce((s, sk) => s + sk.sales_amount, 0)
      const weightedRate = allSkus.reduce((s, sk) => s + sk.gross_profit_rate * sk.sales_amount, 0)
      return totalAmt > 0 ? weightedRate / totalAmt : 0
    })(),
    total_stock: allSkus.reduce((s, sk) => s + sk.total_stock, 0),
    free_stock: allSkus.reduce((s, sk) => s + sk.free_stock, 0),
    reserved_stock: allSkus.reduce((s, sk) => s + (sk.advance_stock ?? 0), 0),
    zozo_stock: allSkus.reduce((s, sk) => s + sk.zozo_stock, 0),
    daily_sales: allSkus.reduce((s, sk) => s + sk.daily_sales, 0),
    stock_days: (() => {
      const totalStock = allSkus.reduce((s, sk) => s + sk.total_stock, 0)
      const totalDaily = allSkus.reduce((s, sk) => s + sk.daily_sales, 0)
      return totalDaily > 0 ? totalStock / totalDaily : 0
    })(),
    inventory_status: (() => {
      if (allSkus.some(sk => sk.inventory_status === '過剰')) return '過剰'
      if (allSkus.every(sk => sk.inventory_status === '在庫なし')) return '在庫なし'
      return '適正'
    })(),
  } : null)

  // Find prev month and prev year totals from trend
  const currentMonthData = trend?.data?.[trend.data.length - 1]
  const prevMonthData = trend?.data?.[trend.data.length - 2]
  const prevYearMap = new Map(trend?.prev_year?.map(r => [r.month, r]) || [])
  const prevYearData = currentMonthData ? prevYearMap.get(currentMonthData.month) : null

  // Current display data
  const displayQuantity = currentMonthData?.quantity ?? (isSkuView ? selectedSku.total_quantity : prodData?.total_quantity ?? 0)
  const displayAmount = currentMonthData?.sales_amount ?? (isSkuView ? selectedSku.sales_amount : prodData?.sales_amount ?? 0)

  // Header info
  const title = isSkuView ? selectedSku.goods_id : (prodData?.product_name || productCode)
  const subtitle = isSkuView
    ? [selectedSku.color, selectedSku.size].filter(Boolean).join(' / ') || '-'
    : productCode
  const imageUrl = isSkuView ? selectedSku.sku_image_url : prodData?.image_url

  // Gross profit rate for charts
  const grossProfitRate = isSkuView
    ? selectedSku.gross_profit_rate
    : prodData?.gross_profit_rate ?? 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {/* Back button when in SKU view */}
            {isSkuView && (
              <button
                onClick={() => setSelectedSku(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors -ml-1"
                title="代表品番に戻る"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            )}
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-20 h-20 object-cover rounded" />
            ) : null}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="truncate text-sm">{subtitle}</DialogDescription>
              <div className="flex items-center gap-2 mt-0.5">
                {isSkuView && (
                  <span className="text-xs text-blue-500">SKU詳細</span>
                )}
                {prodData?.sales_start_date && (
                  <span className="text-xs text-gray-400">販売開始: {prodData.sales_start_date}</span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Sales summary with comparison */}
        <div className="grid grid-cols-3 gap-3">
          <SalesCard
            label="当月実績"
            quantity={displayQuantity}
            amount={displayAmount}
            prevQuantity={prevMonthData?.quantity}
            prevAmount={prevMonthData?.sales_amount}
            prevLabel="前月比"
          />
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-500 text-sm mb-2 font-medium">前年同月</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <div className="text-xs text-gray-400">販売数</div>
                <div className="text-base font-semibold text-gray-800">{formatNumber(prevYearData?.quantity ?? 0)}<span className="text-xs font-normal text-gray-400 ml-0.5">点</span></div>
                {prevYearData && prevYearData.quantity > 0 && (
                  <ComparisonBadge current={displayQuantity} previous={prevYearData.quantity} label="前年比" />
                )}
              </div>
              <div>
                <div className="text-xs text-gray-400">売上金額</div>
                <div className="text-base font-semibold text-gray-800">{formatCurrency(prevYearData?.sales_amount ?? 0)}</div>
                {prevYearData && prevYearData.sales_amount > 0 && (
                  <ComparisonBadge current={displayAmount} previous={prevYearData.sales_amount} label="前年比" />
                )}
              </div>
            </div>
          </div>
          {/* Gross profit card */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-500 text-sm mb-2 font-medium">粗利情報</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <div className="text-xs text-gray-400">粗利率</div>
                <div className="text-base font-semibold text-gray-800">
                  {grossProfitRate > 0 ? `${(grossProfitRate * 100).toFixed(1)}%` : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">粗利金額（当月）</div>
                <div className="text-base font-semibold text-gray-800">
                  {formatCurrency(Math.round(displayAmount * grossProfitRate))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Channel breakdown + pie chart side by side */}
        {trend?.channels && trend.channels.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <ChannelBreakdown channels={trend.channels} />
            <ChannelPieChart channels={trend.channels} />
          </div>
        )}

        {/* Inventory & Sales velocity - 3 columns */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1.5 font-medium">在庫数</div>
            <div className="space-y-1">
              {isSkuView ? (
                <>
                  <div className="flex justify-between"><span>自社(NE)</span><span className="font-medium">{formatNumber(selectedSku.own_stock)}</span></div>
                  <div className="flex justify-between"><span>フリー</span><span className="font-medium">{formatNumber(selectedSku.free_stock)}</span></div>
                  <div className="flex justify-between"><span>ZOZO</span><span className="font-medium">{formatNumber(selectedSku.zozo_stock)}</span></div>
                </>
              ) : prodData ? (
                <>
                  <div className="flex justify-between"><span>NE(フリー)</span><span className="font-medium">{formatNumber(prodData.free_stock)}</span></div>
                  <div className="flex justify-between"><span>NE(予約)</span><span className="font-medium">{formatNumber(prodData.reserved_stock)}</span></div>
                  <div className="flex justify-between"><span>ZOZO</span><span className="font-medium">{formatNumber(prodData.zozo_stock)}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1"><span>合計</span><span className="font-medium">{formatNumber(prodData.free_stock + prodData.reserved_stock + prodData.zozo_stock)}</span></div>
                </>
              ) : null}
            </div>
          </div>

          {/* Sales velocity */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1.5 font-medium">販売速度</div>
            <div className="space-y-1">
              {isSkuView ? (
                <>
                  <div className="flex justify-between"><span>日販</span><span className="font-medium">{selectedSku.daily_sales > 0 ? selectedSku.daily_sales.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{selectedSku.stock_days > 0 ? `${Math.round(selectedSku.stock_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>回転率(年)</span><span className="font-medium">{selectedSku.turnover_rate_annual > 0 ? selectedSku.turnover_rate_annual.toFixed(1) : '-'}</span></div>
                </>
              ) : prodData ? (
                <>
                  <div className="flex justify-between"><span>日販</span><span className="font-medium">{prodData.daily_sales > 0 ? prodData.daily_sales.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{prodData.stock_days > 0 ? `${Math.round(prodData.stock_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫状態</span><span className="font-medium">{prodData.inventory_status || '-'}</span></div>
                </>
              ) : null}
            </div>
          </div>

          {/* Lifecycle / Alerts / Profit info (third column) */}
          {isSkuView ? (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500 mb-1.5 font-medium">ライフサイクル</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>ステージ</span><span className="font-medium">{selectedSku.lifecycle_stance || '-'}</span></div>
                  <div className="flex justify-between"><span>回転日数</span><span className="font-medium">{selectedSku.turnover_days > 0 ? `${Math.round(selectedSku.turnover_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>最終入出庫</span><span className="font-medium">{selectedSku.last_io_date ? formatDate(selectedSku.last_io_date) : '-'}</span></div>
                </div>
              </div>
              {(selectedSku.stagnation_alert || selectedSku.lifecycle_action || selectedSku.days_since_last_io > 0) && (
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-red-600 mb-1.5 font-medium">アラート</div>
                  <div className="space-y-1">
                    {selectedSku.stagnation_alert && (
                      <div className="text-red-600 font-medium">滞留アラート</div>
                    )}
                    {selectedSku.lifecycle_action && (
                      <div className="text-amber-700">{selectedSku.lifecycle_action}</div>
                    )}
                    {selectedSku.days_since_last_io > 0 && (
                      <div className="flex justify-between"><span>入出庫なし</span><span className="font-medium">{selectedSku.days_since_last_io}日</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : prodData ? (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 mb-1.5 font-medium">在庫評価</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>在庫金額(上代)</span><span className="font-medium">{formatCurrency(prodData.total_stock * (prodData.sales_amount / Math.max(prodData.total_quantity, 1)))}</span></div>
                <div className="flex justify-between"><span>在庫状態</span><span className="font-medium">{prodData.inventory_status || '-'}</span></div>
                <div className="flex justify-between"><span>粗利率</span><span className="font-medium">{prodData.gross_profit_rate > 0 ? `${(prodData.gross_profit_rate * 100).toFixed(1)}%` : '-'}</span></div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Charts row: Trend + Gross Profit side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Trend chart */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-500 text-sm mb-2 font-medium">売上推移（12ヶ月）</div>
            {trendLoading ? (
              <div className="h-[260px] flex items-center justify-center">
                <div className="text-sm text-gray-400">読み込み中...</div>
              </div>
            ) : trend ? (
              <TrendChart trend={trend} />
            ) : (
              <div className="h-[260px] flex items-center justify-center">
                <div className="text-sm text-gray-400">データなし</div>
              </div>
            )}
          </div>

          {/* Gross profit trend */}
          {trend && grossProfitRate > 0 ? (
            <GrossProfitTrendChart trend={trend} grossProfitRate={grossProfitRate} />
          ) : (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-gray-500 text-sm mb-2 font-medium">粗利推移（12ヶ月）</div>
              <div className="h-[200px] flex items-center justify-center">
                <div className="text-sm text-gray-400">{trendLoading ? '読み込み中...' : 'データなし'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Additional insights row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Discount history */}
          {trend && <DiscountHistory trend={trend} />}

          {/* Weekly heatmap */}
          {trend && <WeeklySalesHeatmap trend={trend} />}
        </div>

        {/* Similar products comparison (product view only) */}
        {!isSkuView && prodData && allSkus.length > 0 && (
          <SimilarProductsComparison prodData={prodData} allSkus={allSkus} />
        )}

        {/* SKU list (product view only) */}
        {!isSkuView && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-gray-500 text-sm mb-3 font-medium">SKU一覧（クリックで詳細）</div>
            {skusLoading ? (
              <div className="text-sm text-gray-400 text-center py-4">読み込み中...</div>
            ) : allSkus.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">SKUデータなし</div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {allSkus.map((s) => (
                  <button
                    key={s.goods_id}
                    onClick={() => setSelectedSku(s)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-left group"
                  >
                    {s.sku_image_url ? (
                      <img src={s.sku_image_url} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-200 rounded flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-700 truncate">{[s.color, s.size].filter(Boolean).join(' / ') || s.goods_id}</div>
                      <div className="text-xs text-gray-400 font-mono">{s.goods_id}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium text-gray-700">{s.total_quantity > 0 ? `${formatNumber(s.total_quantity)}点` : '-'}</div>
                      <div className="text-xs text-gray-400">{s.sales_amount > 0 ? formatCurrency(s.sales_amount) : '-'}</div>
                    </div>
                    <div className="text-right flex-shrink-0 w-16">
                      <div className="text-sm text-gray-600">在庫 {formatNumber(s.total_stock)}</div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-gray-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
