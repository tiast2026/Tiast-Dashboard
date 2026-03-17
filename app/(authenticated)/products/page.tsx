'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import { TableRow, TableCell } from '@/components/ui/table'
import AlertCard from '@/components/cards/AlertCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatDate, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { Mail, Truck, HelpCircle, ChevronDown, ChevronRight, X } from 'lucide-react'
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
  free_stock: number
  reserved_stock: number
  advance_stock?: number
  zozo_stock: number
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

interface SkuRow {
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

// Column header with help tooltip
function colHelp(label: string, tooltip: string) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      <span title={tooltip}><HelpCircle className="w-3 h-3 text-gray-400 cursor-help" /></span>
    </span>
  )
}

// SKU detail panel - shown when clicking a SKU row
function SkuDetailPanel({ sku, onClose }: { sku: SkuRow; onClose: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 my-1 mx-2">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {sku.sku_image_url ? (
            <img src={sku.sku_image_url} alt="" className="w-16 h-16 object-cover rounded" />
          ) : null}
          <div>
            <div className="font-medium text-sm">{sku.goods_id}</div>
            {sku.color && <span className="text-xs text-gray-500">{sku.color} / {sku.size}</span>}
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose() }} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Channel breakdown */}
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-500 mb-1">チャネル別在庫</div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>自社(NE)</span><span className="font-medium">{formatNumber(sku.own_stock)}</span></div>
            <div className="flex justify-between"><span>フリー</span><span className="font-medium">{formatNumber(sku.free_stock)}</span></div>
            <div className="flex justify-between"><span>ZOZO</span><span className="font-medium">{formatNumber(sku.zozo_stock)}</span></div>
          </div>
        </div>
        {/* Sales velocity */}
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-500 mb-1">販売速度</div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>日販</span><span className="font-medium">{sku.daily_sales > 0 ? sku.daily_sales.toFixed(1) : '-'}</span></div>
            <div className="flex justify-between"><span>在庫日数</span><span className="font-medium">{sku.stock_days > 0 ? `${Math.round(sku.stock_days)}日` : '-'}</span></div>
            <div className="flex justify-between"><span>回転率(年)</span><span className="font-medium">{sku.turnover_rate_annual > 0 ? sku.turnover_rate_annual.toFixed(1) : '-'}</span></div>
          </div>
        </div>
        {/* Lifecycle */}
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-500 mb-1">ライフサイクル</div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>ステージ</span><span className="font-medium">{sku.lifecycle_stance || '-'}</span></div>
            <div className="flex justify-between"><span>回転日数</span><span className="font-medium">{sku.turnover_days > 0 ? `${Math.round(sku.turnover_days)}日` : '-'}</span></div>
            <div className="flex justify-between"><span>最終入出庫</span><span className="font-medium">{sku.last_io_date ? formatDate(sku.last_io_date) : '-'}</span></div>
          </div>
        </div>
        {/* Alerts & Actions */}
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-500 mb-1">アラート</div>
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
      </div>
    </div>
  )
}

// SKU cell renderer — maps a column key to the SKU cell content
function skuCellContent(sku: SkuRow, colKey: string, stockDays: number, stockDayColor: string, statusCls: string, isSelected: boolean): React.ReactNode {
  switch (colKey) {
    case 'expand':
      return isSelected
        ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        : <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
    case 'image_url':
      return sku.sku_image_url
        ? <img src={sku.sku_image_url} alt="" className="w-[40px] aspect-square object-cover rounded" />
        : <div className="w-[40px] aspect-square bg-gray-100 rounded" />
    case 'product_name':
      return (
        <div className="max-w-[220px]">
          <div className="truncate text-xs font-mono text-gray-600">{sku.goods_id}</div>
          <div className="text-[11px] text-gray-400">
            {[sku.color, sku.size].filter(Boolean).join(' / ') || '-'}
          </div>
        </div>
      )
    case 'total_quantity':
      return <span className="text-xs text-[#3D352F]">{sku.total_quantity > 0 ? formatNumber(sku.total_quantity) : '-'}</span>
    case 'sales_amount':
      return <span className="text-xs text-[#3D352F]">{sku.sales_amount > 0 ? formatCurrency(sku.sales_amount) : '-'}</span>
    case 'gross_profit_rate':
      return sku.gross_profit_rate > 0 ? <ProfitRateBar rate={sku.gross_profit_rate} /> : <span className="text-gray-300">-</span>
    case 'free_stock':
      return <span className="text-xs text-[#3D352F]">{formatNumber(sku.free_stock)}</span>
    case 'reserved_stock': {
      const advanceStock = sku.advance_stock ?? 0
      return advanceStock > 0 ? <span className="text-xs text-[#3D352F]">{formatNumber(advanceStock)}</span> : <span className="text-gray-300">-</span>
    }
    case 'zozo_stock':
      return sku.zozo_stock > 0 ? <span className="text-xs text-[#3D352F]">{formatNumber(sku.zozo_stock)}</span> : <span className="text-gray-300">-</span>
    case 'stock_days':
      return <span className={`text-xs font-medium ${stockDayColor}`}>{stockDays > 0 ? `${stockDays}日` : '-'}</span>
    case 'inventory_status':
      return sku.inventory_status
        ? <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${statusCls}`}>{sku.inventory_status}</span>
        : null
    default:
      return null // empty cell for columns without SKU-level data
  }
}

// Inline SKU expansion — renders SKU rows as actual TableRow elements aligned with parent columns
function SkuExpansionRows({ productCode, period, month, columns }: { productCode: string; period: string; month: string; columns: Column<ProductRow>[] }) {
  const [skus, setSkus] = useState<SkuRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSku, setSelectedSku] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (period === 'month') params.set('month', month)
    fetch(`/api/products/${encodeURIComponent(productCode)}/skus?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setSkus(data?.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [productCode, period, month])

  if (loading) return (
    <TableRow className="bg-[#FAFAF8]">
      <TableCell colSpan={columns.length} className="py-3 px-4">
        <Skeleton className="h-16 w-full" />
      </TableCell>
    </TableRow>
  )
  if (skus.length === 0) return (
    <TableRow className="bg-[#FAFAF8]">
      <TableCell colSpan={columns.length} className="py-3 px-4 text-xs text-gray-400">
        SKUデータなし
      </TableCell>
    </TableRow>
  )

  return (
    <>
      {skus.map((sku) => {
        const isSelected = selectedSku === sku.goods_id
        const stockDays = Math.round(sku.stock_days)
        const stockDayColor = stockDays > 90 ? 'text-red-600' : stockDays > 60 ? 'text-amber-600' : 'text-gray-700'
        const statusCls = sku.inventory_status === '過剰' ? 'bg-red-100 text-red-700' : sku.inventory_status === '在庫なし' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'

        return (
          <TableRow
            key={sku.goods_id}
            className="bg-[#FAFAF8] border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => setSelectedSku(isSelected ? null : sku.goods_id)}
          >
            {columns.map((col) => {
              const stickyStyle = col.stickyLeft != null
                ? { position: 'sticky' as const, left: col.stickyLeft, zIndex: 5 }
                : undefined
              return (
                <TableCell
                  key={col.key}
                  className={`py-1.5 text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.stickyLeft != null ? 'bg-[#FAFAF8]' : ''} ${col.className || ''}`}
                  style={stickyStyle}
                >
                  {skuCellContent(sku, col.key, stockDays, stockDayColor, statusCls, isSelected)}
                </TableCell>
              )
            })}
          </TableRow>
        )
      })}
      {/* Detail panel for selected SKU */}
      {selectedSku && skus.find(s => s.goods_id === selectedSku) && (
        <TableRow className="bg-[#FAFAF8]">
          <TableCell colSpan={columns.length} className="p-0">
            <SkuDetailPanel
              sku={skus.find(s => s.goods_id === selectedSku)!}
              onClose={() => setSelectedSku(null)}
            />
          </TableCell>
        </TableRow>
      )}
    </>
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

  // Compute cumulative sticky left offsets
  const stickyWidths: [string, number][] = [
    ['expand', 40],
    ['image_url', 68],
    ['product_name', 240],
    ...(!urlBrand ? [['brand', 80] as [string, number]] : []),
    ['category', 80],
    ['season', 64],
    ['collaborator', 80],
  ]
  const sl: Record<string, number> = {}
  let cumLeft = 0
  for (const [key, w] of stickyWidths) {
    sl[key] = cumLeft
    cumLeft += w
  }

  const columns: Column<ProductRow>[] = [
    {
      key: 'expand',
      label: '',
      width: 40,
      className: 'w-[40px] !px-1',
      stickyLeft: sl.expand,
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
      width: 68,
      className: 'w-[68px] !px-1',
      stickyLeft: sl.image_url,
      render: (row) =>
        row.image_url ? (
          <img src={row.image_url} alt="" className="w-[50px] aspect-square object-cover rounded" />
        ) : (
          <div className="w-[50px] aspect-square bg-gray-100 rounded flex items-center justify-center text-gray-400 text-[10px]">
            No Img
          </div>
        ),
    },
    {
      key: 'product_name',
      label: '商品名',
      width: 240,
      className: 'w-[240px] min-w-[180px] max-w-[240px]',
      stickyLeft: sl.product_name,
      render: (row) => (
        <div className="max-w-[220px]">
          <div className="truncate font-medium text-xs" title={row.product_name}>
            {row.product_name}
          </div>
          <div className="text-xs text-gray-400 truncate">{row.product_code}</div>
        </div>
      ),
    },
    ...(!urlBrand ? [{
      key: 'brand' as const,
      label: 'ブランド',
      width: 80,
      className: 'whitespace-nowrap',
      stickyLeft: sl.brand,
      headerRender: () => colHelp('ブランド', '商品マスタ（Googleスプレッドシート）'),
    }] : []),
    {
      key: 'category', label: 'カテゴリ',
      width: 80,
      className: 'whitespace-nowrap',
      stickyLeft: sl.category,
      headerRender: () => colHelp('カテゴリ', '商品マスタ（Googleスプレッドシート）'),
    },
    {
      key: 'season', label: 'シーズン',
      width: 64,
      className: 'whitespace-nowrap',
      stickyLeft: sl.season,
      headerRender: () => colHelp('シーズン', '商品マスタ（Googleスプレッドシート）'),
    },
    {
      key: 'collaborator',
      label: 'コラボ',
      width: 80,
      className: 'whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]',
      stickyLeft: sl.collaborator,
      headerRender: () => colHelp('コラボ', '商品マスタ（Googleスプレッドシート）'),
      render: (row: ProductRow) => row.collaborator ? (
        <span className="text-xs text-purple-600">{row.collaborator}</span>
      ) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'size',
      label: '配送',
      width: 50,
      className: 'w-[50px]',
      headerRender: () => colHelp('配送', '商品マスタ「サイズ」列\nメール便=✉ ¥330 / 宅配便=🚚 ¥660'),
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
      width: 90,
      align: 'right',
      headerRender: () => colHelp('販売価格', '商品マスタ「上代」列'),
      render: (row) => formatCurrency(row.selling_price),
    },
    {
      key: 'cost_price',
      label: '原価',
      width: 80,
      align: 'right',
      headerRender: () => colHelp('原価', '商品マスタ「下代」列'),
      render: (row) => formatCurrency(row.cost_price),
    },
    {
      key: 'total_quantity',
      label: '販売数',
      width: 72,
      align: 'right',
      sortable: true,
      headerRender: () => colHelp('販売数', 'BigQuery受注データ NE+ZOZO合算の販売個数'),
      render: (row) => formatNumber(row.total_quantity),
    },
    {
      key: 'sales_amount',
      label: '売上金額',
      width: 110,
      align: 'right',
      sortable: true,
      headerRender: () => colHelp('売上金額', 'BigQuery受注データ NE+ZOZO合算の売上合計'),
      render: (row) => formatCurrency(row.sales_amount),
    },
    {
      key: 'gross_profit_rate',
      label: '粗利',
      width: 120,
      headerRender: () => colHelp('粗利', '粗利金額と粗利率'),
      align: 'right',
      sortable: true,
      render: (row: ProductRow) => {
        const grossProfit = Math.round(row.sales_amount * row.gross_profit_rate)
        return (
          <div>
            <div className="text-[11px] text-[#5A524B]">{formatCurrency(grossProfit)}</div>
            <ProfitRateBar rate={row.gross_profit_rate} />
          </div>
        )
      },
    },
    {
      key: 'free_stock',
      label: 'NE(フリー)',
      width: 90,
      align: 'right',
      sortable: true,
      headerRender: () => colHelp('NE(フリー)', 'NextEngine フリー在庫'),
      render: (row) => formatNumber(row.free_stock),
    },
    {
      key: 'reserved_stock',
      label: 'NE(予約)',
      width: 80,
      align: 'right',
      headerRender: () => colHelp('NE(予約)', 'NextEngine 予約在庫数'),
      render: (row) => row.reserved_stock > 0 ? formatNumber(row.reserved_stock) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'zozo_stock',
      label: 'ZOZO在庫',
      width: 90,
      align: 'right',
      sortable: true,
      headerRender: () => colHelp('ZOZO在庫', 'ZOZO預け在庫'),
      render: (row) => row.zozo_stock > 0 ? formatNumber(row.zozo_stock) : <span className="text-gray-300">-</span>,
    },
    {
      key: 'stock_days',
      label: '在庫日数',
      width: 80,
      align: 'right',
      sortable: true,
      headerRender: () => colHelp('在庫日数', '在庫数 ÷ 30日間平均日販'),
      render: (row) => {
        const days = Math.round(row.stock_days)
        const color = days > 90 ? 'text-red-600' : days > 60 ? 'text-amber-600' : 'text-gray-700'
        return <span className={`text-xs font-medium ${color}`}>{days > 0 ? `${days}日` : '-'}</span>
      },
    },
    {
      key: 'inventory_status',
      label: '在庫状態',
      width: 80,
      headerRender: () => colHelp('在庫状態', '適正 / 過剰（>90日）/ 在庫なし'),
      render: (row) => {
        const s = row.inventory_status
        const cls = s === '過剰' ? 'bg-red-100 text-red-700' : s === '在庫なし' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
        return s ? <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{s}</span> : null
      },
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
          <div className="relative">
            <textarea
              placeholder={"商品名・商品コードで検索\n複数: カンマ or 改行で区切り"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              rows={1}
              onFocus={(e) => { e.currentTarget.rows = 3 }}
              onBlur={(e) => { if (!e.currentTarget.value) e.currentTarget.rows = 1 }}
              className="w-72 min-h-[36px] px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            {search && (
              <span className="absolute right-2 top-1.5 text-[10px] text-gray-400">
                {search.split(/[,\n\r]+/).filter(s => s.trim()).length > 1
                  ? `${search.split(/[,\n\r]+/).filter(s => s.trim()).length}件`
                  : ''}
              </span>
            )}
          </div>
          {!urlBrand && (
            <Select value={brand} onValueChange={(v) => v && setBrand(v)}>
              <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="ブランド" /></SelectTrigger>
              <SelectContent>
                {BRAND_OPTIONS.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue placeholder="カテゴリ" /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (<SelectItem key={c} value={c}>{c === '全て' ? 'カテゴリ: 全て' : c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => v && setSeason(v)}>
            <SelectTrigger className="w-32 bg-white"><SelectValue placeholder="シーズン" /></SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map((s) => (<SelectItem key={s} value={s}>{s === '全て' ? 'シーズン: 全て' : s}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => v && setPeriod(v)}>
            <SelectTrigger className="w-28 bg-white"><SelectValue placeholder="期間" /></SelectTrigger>
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
            renderExpandedRows={(row, cols) => (
              <SkuExpansionRows
                productCode={row.product_code}
                period={period}
                month={month}
                columns={cols}
              />
            )}
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
