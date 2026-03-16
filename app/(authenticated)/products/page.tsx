'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import AlertCard from '@/components/cards/AlertCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatDate, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Mail, Truck, HelpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS, PROFIT_RATE_COLORS } from '@/lib/constants'

interface ProductRow {
  [key: string]: unknown
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  selling_price: number
  cost_price: number
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null
  collaborator: string | null
  size: string
  total_stock: number
  daily_sales: number
  stock_days: number
  inventory_status: string
}

interface ProductListResponse {
  data: ProductRow[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

interface SkuItem {
  goods_id: string
  goods_name: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  daily_sales: number
  stock_days: number
  selling_price: number
  cost_price: number
}

const PERIOD_OPTIONS = [
  { value: 'month', label: '月別' },
  { value: '7d', label: '7日間' },
  { value: '30d', label: '30日間' },
  { value: '60d', label: '60日間' },
  { value: 'all', label: '全期間' },
] as const

function generateMonths(count: number = 24): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonthLabel(m: string): string {
  const [year, month] = m.split('-')
  return `${year}年${parseInt(month)}月`
}

function ProfitRateBar({ rate }: { rate: number }) {
  const pct = Math.min(rate * 100, 100)
  const color =
    rate >= PROFIT_RATE_COLORS.high.threshold
      ? PROFIT_RATE_COLORS.high.color
      : rate >= PROFIT_RATE_COLORS.mid.threshold
        ? PROFIT_RATE_COLORS.mid.color
        : PROFIT_RATE_COLORS.low.color

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs" style={{ color }}>{formatPercent(rate)}</span>
    </div>
  )
}

// Inline SKU expansion row
function SkuExpansion({ productCode }: { productCode: string }) {
  const [skus, setSkus] = useState<SkuItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/products/${encodeURIComponent(productCode)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setSkus(data?.inventory || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [productCode])

  if (loading) return <div className="py-3 px-4"><Skeleton className="h-16 w-full" /></div>
  if (skus.length === 0) return <div className="py-3 px-4 text-xs text-gray-400">SKUデータなし</div>

  return (
    <div className="py-2 px-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-100">
            <th className="text-left py-1.5 font-medium">SKU名</th>
            <th className="text-right py-1.5 font-medium">総在庫</th>
            <th className="text-right py-1.5 font-medium">フリー</th>
            <th className="text-right py-1.5 font-medium">ZOZO</th>
            <th className="text-right py-1.5 font-medium">自社</th>
            <th className="text-right py-1.5 font-medium">日販</th>
            <th className="text-right py-1.5 font-medium">在庫日数</th>
          </tr>
        </thead>
        <tbody>
          {skus.map(sku => (
            <tr key={sku.goods_id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-1.5 max-w-[200px] truncate" title={sku.goods_name}>{sku.goods_name}</td>
              <td className="text-right py-1.5">{formatNumber(sku.total_stock)}</td>
              <td className="text-right py-1.5">{formatNumber(sku.free_stock)}</td>
              <td className="text-right py-1.5">{formatNumber(sku.zozo_stock)}</td>
              <td className="text-right py-1.5">{formatNumber(sku.own_stock)}</td>
              <td className="text-right py-1.5">{sku.daily_sales?.toFixed(1) || '-'}</td>
              <td className="text-right py-1.5">
                {sku.stock_days > 0 ? (
                  <span className={sku.stock_days > 90 ? 'text-red-600 font-medium' : ''}>
                    {Math.round(sku.stock_days)}日
                  </span>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductsPageContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState(urlBrand || '全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [priceTier] = useState('全て')
  const [period, setPeriod] = useState('month')
  const [month, setMonth] = useState(getCurrentMonth())
  const [sortBy, setSortBy] = useState('sales_amount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [alerts, setAlerts] = useState<{ overstock: { count: number; amount: number }; season_ending: { count: number; amount: number }; season_exceeded: { count: number; amount: number } } | null>(null)
  const mountedRef = useRef(true)

  const buildCacheKey = useCallback(() => {
    return `products:${search}:${brand}:${category}:${season}:${priceTier}:${period}:${month}:${sortBy}:${sortOrder}:${page}`
  }, [search, brand, category, season, priceTier, period, month, sortBy, sortOrder, page])

  const cached = getCached<ProductListResponse>(buildCacheKey())
  const [loading, setLoading] = useState(!cached)
  const [result, setResult] = useState<ProductListResponse | null>(cached)

  const fetchProducts = useCallback(async () => {
    const key = buildCacheKey()
    if (isFresh(key)) return
    if (!getCached(key)) setLoading(true)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (brand !== '全て') params.set('brand', brand)
      if (category !== '全て') params.set('category', category)
      if (season !== '全て') params.set('season', season)
      if (priceTier !== '全て') params.set('price_tier', priceTier)
      params.set('period', period)
      if (period === 'month') params.set('month', month)
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('page', String(page))
      params.set('per_page', String(perPage))

      const res = await fetch(`/api/products/list?${params.toString()}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current) {
        setResult(data)
        if (data) setCache(key, data)
      }
    } catch (e) {
      console.error('Failed to fetch products:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [search, brand, category, season, priceTier, period, month, sortBy, sortOrder, page, perPage, buildCacheKey])

  useEffect(() => {
    mountedRef.current = true
    const key = buildCacheKey()
    const c = getCached<ProductListResponse>(key)
    if (c) {
      setResult(c)
      setLoading(false)
    }
    fetchProducts()
    return () => { mountedRef.current = false }
  }, [fetchProducts, buildCacheKey])

  // Fetch inventory alerts
  useEffect(() => {
    fetch('/api/inventory/alerts')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (mountedRef.current) setAlerts(data) })
      .catch(() => {})
  }, [])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, brand, category, season, priceTier, period, month])

  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortBy(key)
    setSortOrder(order)
  }

  const toggleExpand = (productCode: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(productCode)) next.delete(productCode)
      else next.add(productCode)
      return next
    })
  }

  const monthOptions = generateMonths()

  const columns: Column<ProductRow>[] = [
    {
      key: 'expand',
      label: '',
      className: 'w-[32px]',
      render: (row) => {
        const isExpanded = expandedRows.has(row.product_code)
        return (
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(row.product_code) }}
            className="p-0.5 hover:bg-gray-100 rounded transition-colors"
          >
            {isExpanded
              ? <ChevronDown className="w-4 h-4 text-gray-500" />
              : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>
        )
      },
    },
    {
      key: 'image_url',
      label: '',
      className: 'w-[60px]',
      render: (row) =>
        row.image_url ? (
          <img src={row.image_url} alt="" className="w-[50px] h-[50px] object-cover rounded" />
        ) : (
          <div className="w-[50px] h-[50px] bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">
            No Img
          </div>
        ),
    },
    {
      key: 'product_name',
      label: '商品名',
      className: 'min-w-[180px]',
      render: (row) => (
        <div className="max-w-[220px]">
          <div className="truncate font-medium text-sm" title={row.product_name}>
            {row.product_name}
          </div>
          <div className="text-xs text-gray-400 truncate">{row.product_code}</div>
        </div>
      ),
    },
    ...(!urlBrand ? [{ key: 'brand' as const, label: 'ブランド' }] : []),
    { key: 'category', label: 'カテゴリ' },
    { key: 'season', label: 'シーズン' },
    {
      key: 'collaborator',
      label: 'コラボ',
      render: (row: ProductRow) => row.collaborator ? (
        <span className="text-xs text-purple-600">{row.collaborator}</span>
      ) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'size',
      label: '配送',
      className: 'w-[50px]',
      render: (row: ProductRow) => {
        const s = (row.size || '').trim()
        if (s.includes('メール') || s === 'M' || s === 'メール便') {
          return <span className="inline-flex items-center text-blue-600" title="メール便 ¥330"><Mail className="w-3.5 h-3.5" /></span>
        }
        if (s.includes('宅配') || s === 'L' || s === '宅配便') {
          return <span className="inline-flex items-center text-amber-600" title="宅配便 ¥660"><Truck className="w-3.5 h-3.5" /></span>
        }
        return s ? <span className="text-xs text-gray-500" title={s}>{s}</span> : <span className="text-gray-300">-</span>
      },
    },
    {
      key: 'selling_price',
      label: '販売価格',
      align: 'right',
      render: (row) => formatCurrency(row.selling_price),
    },
    {
      key: 'cost_price',
      label: '原価',
      align: 'right',
      render: (row) => formatCurrency(row.cost_price),
    },
    {
      key: 'total_quantity',
      label: '販売数',
      align: 'right',
      sortable: true,
      render: (row) => formatNumber(row.total_quantity),
    },
    {
      key: 'sales_amount',
      label: '売上金額',
      align: 'right',
      sortable: true,
      render: (row) => formatCurrency(row.sales_amount),
    },
    {
      key: 'gross_profit_rate',
      label: '粗利率',
      headerRender: () => (
        <span className="inline-flex items-center gap-1">
          粗利率
          <span title={"(売上 - 仕入原価 - 送料) / 売上\nメール便: ¥330/個, 宅配便: ¥660/個"}><HelpCircle className="w-3 h-3 text-gray-400 cursor-help" /></span>
        </span>
      ),
      align: 'right',
      sortable: true,
      render: (row: ProductRow) => <ProfitRateBar rate={row.gross_profit_rate} />,
    },
    {
      key: 'total_stock',
      label: '在庫数',
      align: 'right',
      sortable: true,
      render: (row) => formatNumber(row.total_stock),
    },
    {
      key: 'stock_days',
      label: '在庫日数',
      align: 'right',
      sortable: true,
      render: (row) => {
        const days = Math.round(row.stock_days)
        const color = days > 90 ? 'text-red-600' : days > 60 ? 'text-amber-600' : 'text-gray-700'
        return <span className={`text-xs font-medium ${color}`}>{days > 0 ? `${days}日` : '-'}</span>
      },
    },
    {
      key: 'inventory_status',
      label: '在庫状態',
      render: (row) => {
        const s = row.inventory_status
        const cls = s === '過剰' ? 'bg-red-100 text-red-700' : s === '在庫なし' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
        return s ? <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{s}</span> : null
      },
    },
    {
      key: 'sales_start_date',
      label: '販売開始',
      render: (row) => <span className="text-xs text-gray-500">{formatDate(row.sales_start_date)}</span>,
    },
    {
      key: 'sales_end_date',
      label: '販売終了',
      render: (row) => <span className="text-xs text-gray-500">{formatDate(row.sales_end_date)}</span>,
    },
  ]

  return (
    <>
      <Header title={urlBrand ? `${urlBrand} 商品分析` : '商品分析'} />
      <div className="p-6 space-y-4">
        {/* Inventory Alerts */}
        {alerts && (
          <div className="grid grid-cols-3 gap-4">
            <AlertCard title="過剰在庫" count={alerts.overstock.count} amount={formatCurrency(alerts.overstock.amount)} color="red" />
            <AlertCard title="シーズン終了間近（30日以内）" count={alerts.season_ending.count} amount={formatCurrency(alerts.season_ending.amount)} color="yellow" />
            <AlertCard title="シーズン超過" count={alerts.season_exceeded.count} amount={formatCurrency(alerts.season_exceeded.amount)} color="red" />
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="商品名・商品コードで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 bg-white"
          />
          <Select value={brand} onValueChange={(v) => v && setBrand(v)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => v && setSeason(v)}>
            <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
            </SelectContent>
          </Select>
          {period === 'month' && (
            <Select value={month} onValueChange={(v) => v && setMonth(v)}>
              <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (<SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        ) : result ? (
          <DataTable<ProductRow>
            columns={columns}
            data={result.data}
            pageSize={perPage}
            currentPage={result.page}
            totalItems={result.total}
            onPageChange={setPage}
            onSort={handleSort}
            sortKey={sortBy}
            sortOrder={sortOrder}
            expandedRowKeys={expandedRows}
            renderExpandedRow={(row) => <SkuExpansion productCode={row.product_code} />}
            rowKeyField="product_code"
          />
        ) : null}
      </div>
    </>
  )
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsPageContent />
    </Suspense>
  )
}
