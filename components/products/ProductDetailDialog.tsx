'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, BarChart3, Trophy } from 'lucide-react'
import ProductImage from '@/components/ui/product-image'
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
  LineChart,
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

interface RankingRecord {
  fetched_at: string
  ranking_type: string
  genre_id: string
  rank: number
  item_name: string
  matched_product_code: string
  best_rank: number
  rank_count: number
  first_ranked_at: string
}

interface RankingSummary {
  genre_id: string
  genre_name: string
  best_rank: number
  latest_rank: number
  rank_count: number
  first_ranked_at: string
  history: { date: string; rank: number }[]
}

const RANKING_GENRE_MAP: Record<string, string> = {
  '100371': 'レディースファッション',
  '555086': 'トップス',
  '303656': 'Tシャツ・カットソー',
  '566018': 'タンクトップ',
  '206471': 'シャツ・ブラウス',
  '403871': 'カーディガン・ボレロ',
  '403890': 'ベスト・ジレ',
  '566028': 'セーター',
  '502556': 'パーカー',
  '403923': 'スウェット・トレーナー',
  '555089': 'ボトムス',
  '110734': 'スカート',
  '206440': 'パンツ',
  '555087': 'コート・ジャケット',
  '110729': 'ワンピース',
  '553029': 'チュニック',
  '555084': 'ドレス',
  '555091': 'スーツ・セットアップ',
  '555083': 'オールインワン・サロペット',
  '409365': '水着',
  '403911': '福袋',
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
  '楽天': CHANNEL_COLORS.rakuten,
  'Rakuten Fashion': CHANNEL_COLORS.rakuten_fashion,
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

function ChannelBreakdown({ channels, channelLabel = '当月' }: { channels: ChannelRow[]; channelLabel?: string }) {
  if (channels.length === 0) return null
  const totalAmount = channels.reduce((s, c) => s + Number(c.sales_amount), 0)

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-gray-500 text-sm mb-3 font-medium">チャネル別販売実績（{channelLabel}）</div>
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

interface SkuTrendRow {
  goods_id: string
  month: string
  quantity: number
  sales_amount: number
}

const SKU_COLORS = [
  '#4A90D9', '#E5684E', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#EF4444', '#A855F7', '#0EA5E9', '#D946EF',
]

function SkuComparisonChart({ data, metric, allSkus }: { data: SkuTrendRow[]; metric: 'sales_amount' | 'quantity'; allSkus: SkuData[] }) {
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">データなし</div>
  }

  // Build a label map from allSkus (color/size from Sheets data)
  const skuLabelMap = new Map<string, string>()
  for (const sku of allSkus) {
    const label = [sku.color, sku.size].filter(Boolean).join('/') || sku.goods_id
    skuLabelMap.set(sku.goods_id, label)
  }

  // Group by goods_id
  const skuMap = new Map<string, { label: string; data: Map<string, number> }>()
  for (const row of data) {
    if (!skuMap.has(row.goods_id)) {
      const label = skuLabelMap.get(row.goods_id) || row.goods_id
      skuMap.set(row.goods_id, { label, data: new Map() })
    }
    skuMap.get(row.goods_id)!.data.set(row.month, Number(row[metric]))
  }

  // Collect all months
  const months = Array.from(new Set(data.map(r => r.month))).sort()

  // Build chart data: { month, "SKU1 label": value, ... }
  // Sort SKU entries by total value descending
  const skuEntries = Array.from(skuMap.entries()).sort((a, b) => {
    const totalA = Array.from(a[1].data.values()).reduce((s, v) => s + v, 0)
    const totalB = Array.from(b[1].data.values()).reduce((s, v) => s + v, 0)
    return totalB - totalA
  })

  const chartData = months.map(month => {
    const point: Record<string, string | number | null> = { month }
    skuEntries.forEach(([, sku]) => {
      point[sku.label] = sku.data.get(month) ?? null
    })
    return point
  })

  // Build color map for consistent lookup
  const skuColorMap = new Map<string, string>()
  skuEntries.forEach(([, sku], i) => {
    skuColorMap.set(sku.label, SKU_COLORS[i % SKU_COLORS.length])
  })

  // Custom tooltip sorted by value descending
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomSkuTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const sorted = [...payload].sort((a: { value: number }, b: { value: number }) => (b.value ?? 0) - (a.value ?? 0))
    const parts = String(label).split('-')
    const monthLabel = `${parts[0]}年${parseInt(parts[1])}月`
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-xs">
        <div className="font-medium text-gray-700 mb-1.5">{monthLabel}</div>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {sorted.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-1.5 py-0.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600 truncate flex-1">{entry.dataKey}</span>
            <span className="font-medium text-gray-800 ml-2 tabular-nums">
              {metric === 'sales_amount'
                ? `¥${Math.round(Number(entry.value)).toLocaleString()}`
                : `${Math.round(Number(entry.value))}点`
              }
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={metric === 'sales_amount' ? fmtYAxis : (v: number) => String(Math.round(v))}
            tick={{ fontSize: 11 }}
            width={55}
          />
          <Tooltip content={<CustomSkuTooltip />} />
          {skuEntries.map(([, sku], i) => (
            <Line
              key={sku.label}
              type="monotone"
              dataKey={sku.label}
              stroke={SKU_COLORS[i % SKU_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Custom legend outside chart to avoid overlap */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
        {skuEntries.map(([, sku], i) => (
          <div key={sku.label} className="flex items-center gap-1">
            <div className="w-2.5 h-0.5 rounded flex-shrink-0" style={{ backgroundColor: SKU_COLORS[i % SKU_COLORS.length] }} />
            <span className="text-[10px] text-gray-500 whitespace-nowrap">{sku.label}</span>
          </div>
        ))}
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

function RankSparklineMini({ history }: { history: { date: string; rank: number }[] }) {
  if (history.length < 2) return null

  const sorted = [...history].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
  const ranks = sorted.map((h) => h.rank)
  const maxRank = Math.max(...ranks, 100)
  const minRank = Math.min(...ranks, 1)
  const range = Math.max(maxRank - minRank, 1)

  const w = 80
  const h = 24
  const padding = 2

  const points = ranks.map((rank, i) => {
    const x = padding + (i / (ranks.length - 1)) * (w - padding * 2)
    const y = padding + ((rank - minRank) / range) * (h - padding * 2)
    return `${x},${y}`
  })

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#BF0000"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="2"
          fill="#BF0000"
        />
      )}
    </svg>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const colors = ['', 'text-yellow-500', 'text-gray-400', 'text-amber-600']
    const bgColors = ['', 'bg-yellow-50', 'bg-gray-50', 'bg-amber-50']
    return (
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${bgColors[rank]}`}>
        <Trophy className={`w-3 h-3 ${colors[rank]}`} />
        <span className={`text-sm font-bold ${colors[rank]}`}>{rank}位</span>
      </span>
    )
  }
  return <span className="text-sm font-bold text-gray-700">{rank}位</span>
}

function formatRankingDate(date: unknown): string {
  if (!date) return '-'
  const raw = typeof date === 'object' && date !== null && 'value' in date
    ? (date as { value: string }).value
    : String(date)
  const d = new Date(raw)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function RankingSection({ rankings }: { rankings: RankingSummary[] }) {
  if (rankings.length === 0) return null

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4" style={{ color: '#BF0000' }} />
        <span className="text-gray-500 text-sm font-medium">楽天ランキング実績</span>
      </div>
      <div className="space-y-2">
        {rankings.map((r) => (
          <div key={r.genre_id} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400 mb-0.5">{r.genre_name}</div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">最高</span>
                  <RankBadge rank={r.best_rank} />
                </div>
                <span className="text-gray-200">|</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">最新</span>
                  <span className="text-sm font-medium text-gray-700">{r.latest_rank}位</span>
                </div>
                <span className="text-gray-200">|</span>
                <span className="text-xs text-gray-500">{r.rank_count}回ランクイン</span>
              </div>
            </div>
            <div className="flex-shrink-0">
              <RankSparklineMini history={r.history} />
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-gray-300 mt-2 text-right">
        初回ランクイン: {formatRankingDate(rankings[0].first_ranked_at)}
      </div>
    </div>
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
  const [trendMonths, setTrendMonths] = useState<string>('12')
  const [skuTrends, setSkuTrends] = useState<SkuTrendRow[]>([])
  const [skuTrendsLoading, setSkuTrendsLoading] = useState(false)
  const [skuTrendMetric, setSkuTrendMetric] = useState<'sales_amount' | 'quantity'>('sales_amount')
  const [rankings, setRankings] = useState<RankingSummary[]>([])
  const [rankingsLoading, setRankingsLoading] = useState(false)

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
  const fetchTrend = useCallback((goodsId?: string, months?: string) => {
    if (!productCode) return
    setTrend(null)
    setTrendLoading(true)

    const params = new URLSearchParams({ months: months || '12' })
    if (goodsId) params.set('goods_id', goodsId)
    if (period) params.set('period', period)
    if (period === 'month' && month) params.set('month', month)

    fetch(`/api/products/${encodeURIComponent(productCode)}/trend?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTrend(data))
      .catch(() => {})
      .finally(() => setTrendLoading(false))
  }, [productCode, period, month])

  useEffect(() => {
    if (!open) return
    fetchTrend(selectedSku?.goods_id, trendMonths)
  }, [open, selectedSku?.goods_id, fetchTrend, trendMonths])

  // Fetch SKU comparison trends (product view only)
  useEffect(() => {
    if (!open || !productCode || isSkuView) return
    setSkuTrendsLoading(true)
    fetch(`/api/products/${encodeURIComponent(productCode)}/sku-trends?months=${trendMonths}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setSkuTrends(data?.data || []))
      .catch(() => setSkuTrends([]))
      .finally(() => setSkuTrendsLoading(false))
  }, [open, productCode, isSkuView, trendMonths])

  // Fetch ranking data (product view only)
  useEffect(() => {
    if (!open || !productCode || isSkuView) return
    setRankingsLoading(true)
    fetch(`/api/rakuten-ranking/history?product_code=${encodeURIComponent(productCode)}&days=90`)
      .then(res => res.ok ? res.json() : null)
      .then((data: RankingRecord[] | null) => {
        if (!data || !Array.isArray(data) || data.length === 0) {
          setRankings([])
          return
        }
        // Group by genre_id
        const map = new Map<string, RankingSummary>()
        for (const r of data) {
          if (!map.has(r.genre_id)) {
            map.set(r.genre_id, {
              genre_id: r.genre_id,
              genre_name: RANKING_GENRE_MAP[r.genre_id] || r.genre_id,
              best_rank: r.best_rank,
              latest_rank: r.rank,
              rank_count: r.rank_count,
              first_ranked_at: r.first_ranked_at,
              history: [],
            })
          }
          const entry = map.get(r.genre_id)!
          entry.history.push({ date: r.fetched_at, rank: r.rank })
        }
        setRankings(Array.from(map.values()).sort((a, b) => a.best_rank - b.best_rank))
      })
      .catch(() => setRankings([]))
      .finally(() => setRankingsLoading(false))
  }, [open, productCode, isSkuView])

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

  // Period label helper
  const periodLabel = (() => {
    if (period === 'month' && month) {
      const [y, mo] = month.split('-').map(Number)
      return `${y}年${mo}月実績`
    }
    if (period === '7d') return '直近7日間実績'
    if (period === '30d') return '直近30日間実績'
    if (period === '60d') return '直近60日間実績'
    if (period === 'all') return '全期間実績'
    return '当月実績'
  })()

  const channelPeriodLabel = (() => {
    if (period === 'month' && month) {
      const [y, mo] = month.split('-').map(Number)
      return `${y}年${mo}月`
    }
    if (period === '7d') return '直近7日間'
    if (period === '30d') return '直近30日間'
    if (period === '60d') return '直近60日間'
    if (period === 'all') return '全期間'
    return '当月'
  })()

  // Find prev month and prev year totals from trend
  const currentMonthData = trend?.data?.[trend.data.length - 1]
  const prevMonthData = trend?.data?.[trend.data.length - 2]
  const prevYearMap = new Map(trend?.prev_year?.map(r => [r.month, r]) || [])
  const prevYearData = currentMonthData ? prevYearMap.get(currentMonthData.month) : null

  // Use product/sku data for display values
  // When period=all and channel data is available, prefer channel totals (from raw orders)
  // over mart table data which may be stale
  const channelTotalQuantity = trend?.channels?.reduce((s, c) => s + Number(c.quantity), 0) ?? 0
  const channelTotalAmount = trend?.channels?.reduce((s, c) => s + Number(c.sales_amount), 0) ?? 0
  const trendTotalQuantity = trend?.data?.reduce((s, r) => s + Number(r.quantity), 0) ?? 0
  const trendTotalAmount = trend?.data?.reduce((s, r) => s + Number(r.sales_amount), 0) ?? 0

  const displayQuantity = isSkuView
    ? selectedSku.total_quantity
    : (period === 'all' && channelTotalQuantity > 0)
      ? channelTotalQuantity
      : (period === 'all' && trendTotalQuantity > 0)
        ? trendTotalQuantity
        : prodData?.total_quantity ?? 0
  const displayAmount = isSkuView
    ? selectedSku.sales_amount
    : (period === 'all' && channelTotalAmount > 0)
      ? channelTotalAmount
      : (period === 'all' && trendTotalAmount > 0)
        ? trendTotalAmount
        : prodData?.sales_amount ?? 0

  // Header info
  const title = isSkuView ? selectedSku.goods_id : (prodData?.product_name || productCode)
  const subtitle = isSkuView
    ? [selectedSku.color, selectedSku.size].filter(Boolean).join(' / ') || '-'
    : productCode
  const imageUrl = isSkuView ? selectedSku.sku_image_url : prodData?.image_url

  // Gross profit rate
  const grossProfitRate = isSkuView
    ? selectedSku.gross_profit_rate
    : prodData?.gross_profit_rate ?? 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] lg:max-w-5xl xl:max-w-6xl max-h-[90vh] overflow-y-auto">
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
              <ProductImage src={imageUrl} size={80} />
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

        {/* Sales summary: 当月 + 前年同月 */}
        <div className="grid grid-cols-2 gap-3">
          <SalesCard
            label={periodLabel}
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
        </div>

        {/* Channel breakdown */}
        {trend?.channels && trend.channels.length > 0 && (
          <ChannelBreakdown channels={trend.channels} channelLabel={channelPeriodLabel} />
        )}

        {/* Inventory & Sales velocity & Profit - 2 columns */}
        <div className="grid grid-cols-2 gap-3 text-sm">
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

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1.5 font-medium">販売速度・粗利</div>
            <div className="space-y-1">
              {isSkuView ? (
                <>
                  <div className="flex justify-between"><span>日販</span><span className="font-medium">{selectedSku.daily_sales > 0 ? selectedSku.daily_sales.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{selectedSku.stock_days > 0 ? `${Math.round(selectedSku.stock_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>回転率(年)</span><span className="font-medium">{selectedSku.turnover_rate_annual > 0 ? selectedSku.turnover_rate_annual.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1"><span>粗利率</span><span className="font-medium">{grossProfitRate > 0 ? `${(grossProfitRate * 100).toFixed(1)}%` : '-'}</span></div>
                </>
              ) : prodData ? (
                <>
                  <div className="flex justify-between"><span>日販</span><span className="font-medium">{prodData.daily_sales > 0 ? prodData.daily_sales.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{prodData.stock_days > 0 ? `${Math.round(prodData.stock_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫状態</span><span className="font-medium">{prodData.inventory_status || '-'}</span></div>
                  <div className="flex justify-between border-t pt-1 mt-1"><span>粗利率</span><span className="font-medium">{grossProfitRate > 0 ? `${(grossProfitRate * 100).toFixed(1)}%` : '-'}</span></div>
                  <div className="flex justify-between"><span>粗利金額（{channelPeriodLabel}）</span><span className="font-medium">{formatCurrency(Math.round(displayAmount * grossProfitRate))}</span></div>
                </>
              ) : null}
            </div>
          </div>

          {/* Lifecycle (SKU only) */}
          {isSkuView && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 mb-1.5 font-medium">ライフサイクル</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>ステージ</span><span className="font-medium">{selectedSku.lifecycle_stance || '-'}</span></div>
                <div className="flex justify-between"><span>回転日数</span><span className="font-medium">{selectedSku.turnover_days > 0 ? `${Math.round(selectedSku.turnover_days)}日` : '-'}</span></div>
                <div className="flex justify-between"><span>最終入出庫</span><span className="font-medium">{selectedSku.last_io_date ? formatDate(selectedSku.last_io_date) : '-'}</span></div>
              </div>
            </div>
          )}

          {/* Alerts (SKU only) */}
          {isSkuView && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 mb-1.5 font-medium">アラート</div>
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
                {!selectedSku.stagnation_alert && !selectedSku.lifecycle_action && !selectedSku.days_since_last_io && (
                  <div className="text-green-600">問題なし</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Ranking info (product view only) */}
        {!isSkuView && (
          rankingsLoading ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4" style={{ color: '#BF0000' }} />
                <span className="text-gray-500 text-sm font-medium">楽天ランキング実績</span>
              </div>
              <div className="text-sm text-gray-400 text-center py-2">読み込み中...</div>
            </div>
          ) : rankings.length > 0 ? (
            <RankingSection rankings={rankings} />
          ) : null
        )}

        {/* Trend chart */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-gray-500 text-sm font-medium">売上推移（{trendMonths === 'all' ? '全期間' : `${trendMonths}ヶ月`}）</div>
            <Select value={trendMonths} onValueChange={setTrendMonths}>
              <SelectTrigger className="w-28 h-7 text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6ヶ月</SelectItem>
                <SelectItem value="12">12ヶ月</SelectItem>
                <SelectItem value="24">24ヶ月</SelectItem>
                <SelectItem value="all">全期間</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

        {/* SKU comparison trend chart (product view only) */}
        {!isSkuView && allSkus.length > 1 && (
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500 text-sm font-medium">SKU別売上比較（{trendMonths === 'all' ? '全期間' : `${trendMonths}ヶ月`}）</span>
              </div>
              <Select value={skuTrendMetric} onValueChange={(v) => setSkuTrendMetric(v as 'sales_amount' | 'quantity')}>
                <SelectTrigger className="w-24 h-7 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_amount">売上金額</SelectItem>
                  <SelectItem value="quantity">販売数</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {skuTrendsLoading ? (
              <div className="h-[280px] flex items-center justify-center">
                <div className="text-sm text-gray-400">読み込み中...</div>
              </div>
            ) : (
              <SkuComparisonChart data={skuTrends} metric={skuTrendMetric} allSkus={allSkus} />
            )}
          </div>
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
                    <ProductImage src={s.sku_image_url} size={40} />
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
