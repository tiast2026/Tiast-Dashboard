'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatCurrency, formatNumber, formatDate } from '@/lib/format'
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
  daily_sales: number
  stock_days: number
  inventory_status: string
}

interface TrendPoint {
  month: string
  quantity: number
  sales_amount: number
}

interface TrendData {
  data: TrendPoint[]
  prev_year: TrendPoint[]
}

type ViewMode = 'sku' | 'product'

interface ProductDetailDialogProps {
  open: boolean
  onClose: () => void
  mode: ViewMode
  sku?: SkuData | null
  product?: ProductData | null
  productCode: string
  allSkus?: SkuData[]
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
          name="前年売上"
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
  sku,
  product,
  productCode,
  allSkus,
}: ProductDetailDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(mode)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  // Reset viewMode when mode prop changes
  useEffect(() => {
    setViewMode(mode)
  }, [mode, sku?.goods_id, productCode])

  // Fetch trend data
  useEffect(() => {
    if (!open) return
    setTrend(null)
    setTrendLoading(true)

    const params = new URLSearchParams({ months: '12' })
    if (viewMode === 'sku' && sku) {
      params.set('goods_id', sku.goods_id)
    }

    fetch(`/api/products/${encodeURIComponent(productCode)}/trend?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setTrend(data))
      .catch(() => {})
      .finally(() => setTrendLoading(false))
  }, [open, viewMode, productCode, sku?.goods_id, sku])

  if (!open) return null

  // Compute aggregate product data from allSkus if available
  const prodData: ProductData | null = product || (allSkus && allSkus.length > 0 ? {
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

  const isSkuView = viewMode === 'sku' && sku
  const activeData = isSkuView ? sku : prodData

  if (!activeData) return null

  // Find prev month and prev year totals from trend
  const currentMonthData = trend?.data?.[trend.data.length - 1]
  const prevMonthData = trend?.data?.[trend.data.length - 2]
  const prevYearMap = new Map(trend?.prev_year?.map(r => [r.month, r]) || [])
  const prevYearData = currentMonthData ? prevYearMap.get(currentMonthData.month) : null

  // Header info
  const title = isSkuView ? sku.goods_id : productCode
  const subtitle = isSkuView
    ? [sku.color, sku.size].filter(Boolean).join(' / ') || '-'
    : (prodData?.product_name || '')
  const imageUrl = isSkuView ? sku.sku_image_url : prodData?.image_url

  // Inventory details (SKU only)
  const showInventoryDetail = isSkuView && sku

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-20 h-20 object-cover rounded" />
            ) : null}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{title}</DialogTitle>
              <DialogDescription className="truncate text-sm">{subtitle}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* View mode toggle */}
        {sku && (
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
            <button
              onClick={() => setViewMode('sku')}
              className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'sku' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              SKU別
            </button>
            <button
              onClick={() => setViewMode('product')}
              className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'product' ? 'bg-white shadow-sm font-medium text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              代表品番
            </button>
          </div>
        )}

        {/* Sales summary with comparison */}
        <div className="grid grid-cols-2 gap-3">
          <SalesCard
            label="当月実績"
            quantity={currentMonthData?.quantity ?? (isSkuView ? sku!.total_quantity : prodData?.total_quantity ?? 0)}
            amount={currentMonthData?.sales_amount ?? (isSkuView ? sku!.sales_amount : prodData?.sales_amount ?? 0)}
            prevQuantity={prevMonthData?.quantity}
            prevAmount={prevMonthData?.sales_amount}
            prevLabel="前月比"
          />
          <SalesCard
            label="前年比較"
            quantity={currentMonthData?.quantity ?? (isSkuView ? sku!.total_quantity : prodData?.total_quantity ?? 0)}
            amount={currentMonthData?.sales_amount ?? (isSkuView ? sku!.sales_amount : prodData?.sales_amount ?? 0)}
            prevQuantity={prevYearData?.quantity}
            prevAmount={prevYearData?.sales_amount}
            prevLabel="前年比"
          />
        </div>

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

        {/* Inventory & Lifecycle (detail cards) */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* Channel breakdown */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1.5 font-medium">チャネル別在庫</div>
            <div className="space-y-1">
              {showInventoryDetail ? (
                <>
                  <div className="flex justify-between"><span>自社(NE)</span><span className="font-medium">{formatNumber(sku.own_stock)}</span></div>
                  <div className="flex justify-between"><span>フリー</span><span className="font-medium">{formatNumber(sku.free_stock)}</span></div>
                  <div className="flex justify-between"><span>ZOZO</span><span className="font-medium">{formatNumber(sku.zozo_stock)}</span></div>
                </>
              ) : prodData ? (
                <>
                  <div className="flex justify-between"><span>フリー</span><span className="font-medium">{formatNumber(prodData.free_stock)}</span></div>
                  <div className="flex justify-between"><span>ZOZO</span><span className="font-medium">{formatNumber(prodData.zozo_stock)}</span></div>
                  <div className="flex justify-between"><span>合計</span><span className="font-medium">{formatNumber(prodData.total_stock)}</span></div>
                </>
              ) : null}
            </div>
          </div>

          {/* Sales velocity */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-gray-500 mb-1.5 font-medium">販売速度</div>
            <div className="space-y-1">
              {showInventoryDetail ? (
                <>
                  <div className="flex justify-between"><span>日販</span><span className="font-medium">{sku.daily_sales > 0 ? sku.daily_sales.toFixed(1) : '-'}</span></div>
                  <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{sku.stock_days > 0 ? `${Math.round(sku.stock_days)}日` : '-'}</span></div>
                  <div className="flex justify-between"><span>回転率(年)</span><span className="font-medium">{sku.turnover_rate_annual > 0 ? sku.turnover_rate_annual.toFixed(1) : '-'}</span></div>
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

          {/* Lifecycle (SKU only) */}
          {showInventoryDetail && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-gray-500 mb-1 font-medium">ライフサイクル</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>ステージ</span><span className="font-medium">{sku.lifecycle_stance || '-'}</span></div>
                <div className="flex justify-between"><span>回転日数</span><span className="font-medium">{sku.turnover_days > 0 ? `${Math.round(sku.turnover_days)}日` : '-'}</span></div>
                <div className="flex justify-between"><span>最終入出庫</span><span className="font-medium">{sku.last_io_date ? formatDate(sku.last_io_date) : '-'}</span></div>
              </div>
            </div>
          )}

          {/* Alerts (SKU only) */}
          {showInventoryDetail && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-gray-500 mb-1 font-medium">アラート</div>
              <div className="space-y-1">
                {sku.stagnation_alert && (
                  <div className="text-red-600 font-medium">滞留アラート</div>
                )}
                {sku.lifecycle_action && (
                  <div className="text-amber-700">{sku.lifecycle_action}</div>
                )}
                {sku.days_since_last_io > 0 && (
                  <div className="flex justify-between"><span>入出庫なし</span><span className="font-medium">{sku.days_since_last_io}日</span></div>
                )}
                {!sku.stagnation_alert && !sku.lifecycle_action && !sku.days_since_last_io && (
                  <div className="text-green-600">問題なし</div>
                )}
              </div>
            </div>
          )}

          {/* Product-level: SKU count & profit */}
          {!isSkuView && prodData && (
            <>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <div className="text-gray-500 mb-1 font-medium">粗利情報</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>粗利率</span><span className="font-medium">{prodData.gross_profit_rate > 0 ? `${(prodData.gross_profit_rate * 100).toFixed(1)}%` : '-'}</span></div>
                  <div className="flex justify-between"><span>粗利金額</span><span className="font-medium">{formatCurrency(Math.round(prodData.sales_amount * prodData.gross_profit_rate))}</span></div>
                </div>
              </div>
              {allSkus && allSkus.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <div className="text-gray-500 mb-1 font-medium">SKU内訳</div>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>SKU数</span><span className="font-medium">{allSkus.length}</span></div>
                    <div className="flex justify-between"><span>在庫あり</span><span className="font-medium">{allSkus.filter(s => s.total_stock > 0).length}</span></div>
                    <div className="flex justify-between"><span>販売あり</span><span className="font-medium">{allSkus.filter(s => s.total_quantity > 0).length}</span></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
