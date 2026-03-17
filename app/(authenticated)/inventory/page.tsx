'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import AlertCard from '@/components/cards/AlertCard'
import DataTable, { Column } from '@/components/tables/DataTable'
import LifecycleBadge from '@/components/products/LifecycleBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatNumber } from '@/lib/format'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS, BRAND_COLORS, getBrandDisplayName } from '@/lib/constants'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Package, Image as ImageIcon, Search, TrendingDown, TrendingUp, Minus } from 'lucide-react'

// Types
interface AlertData {
  overstock: { count: number; amount: number }
  season_ending: { count: number; amount: number }
  season_exceeded: { count: number; amount: number }
}

interface SeasonSummary {
  season: string
  in_season_amount: number
  exceeded_amount: number
  total_amount: number
}

interface CategorySummary {
  category: string
  brand: string
  stock_retail_value: number
}

interface InventoryItem {
  goods_id: string
  product_code: string
  goods_name: string
  brand: string
  category: string
  season: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  selling_price: number
  cost_price: number
  stock_retail_value: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  lifecycle_stance: string
  inventory_status: string
  reorder_judgment: string
  recommended_discount: number
  lifecycle_action: string
  is_overstock: boolean
  image_url: string | null
  is_focus: string
  restock: string
  order_lot: number | null
}

interface InventoryListResponse {
  data: InventoryItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

const STATUS_OPTIONS = ['全て', '適正', '過剰', '在庫なし'] as const
const LIFECYCLE_OPTIONS = ['全て', '助走期', '成長期', '成熟期', '衰退期'] as const
const ALERT_TYPE_OPTIONS = [
  { value: 'all', label: '全て' },
  { value: 'overstock', label: '過剰在庫' },
  { value: 'season_ending', label: 'シーズン終了間近' },
  { value: 'season_exceeded', label: 'シーズン超過' },
] as const

// Currency formatter for Recharts tooltip
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function currencyFormatter(value: any) {
  return formatCurrency(Number(value))
}

export default function InventoryPage() {
  // Filter state
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [status, setStatus] = useState('全て')
  const [lifecycle, setLifecycle] = useState('全て')
  const [alertType, setAlertType] = useState('all')

  // Sort and pagination
  const [sortBy, setSortBy] = useState('stock_retail_value')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const perPage = 50

  // Data state
  const [alerts, setAlerts] = useState<AlertData | null>(null)
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary[]>([])
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([])
  const [inventoryList, setInventoryList] = useState<InventoryListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)

  // Detail dialog
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Build query params for list
  const buildListParams = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (brand !== '全て') params.set('brand', brand)
    if (category !== '全て') params.set('category', category)
    if (season !== '全て') params.set('season', season)
    if (status !== '全て') params.set('status', status)
    if (lifecycle !== '全て') params.set('lifecycle', lifecycle)
    if (alertType && alertType !== 'all') params.set('alert_type', alertType)
    params.set('sort_by', sortBy)
    params.set('sort_order', sortOrder)
    params.set('page', String(page))
    params.set('per_page', String(perPage))
    return params.toString()
  }, [search, brand, category, season, status, lifecycle, alertType, sortBy, sortOrder, page, perPage])

  // Fetch summary data (alerts, season, category)
  const fetchSummaryData = useCallback(async () => {
    setLoading(true)
    try {
      const brandParam = brand !== '全て' ? `?brand=${brand}` : ''
      const [alertsRes, seasonRes, categoryRes] = await Promise.all([
        fetch('/api/inventory/alerts'),
        fetch('/api/inventory/season-summary'),
        fetch(`/api/inventory/category-summary${brandParam}`),
      ])
      const [alertsData, seasonData, categoryData] = await Promise.all([
        alertsRes.ok ? alertsRes.json() : null,
        seasonRes.ok ? seasonRes.json() : [],
        categoryRes.ok ? categoryRes.json() : [],
      ])
      setAlerts(alertsData)
      setSeasonSummary(Array.isArray(seasonData) ? seasonData : [])
      setCategorySummary(Array.isArray(categoryData) ? categoryData : [])
    } catch (e) {
      console.error('Failed to fetch inventory summary:', e)
    } finally {
      setLoading(false)
    }
  }, [brand])

  // Fetch list data
  const fetchListData = useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetch(`/api/inventory/list?${buildListParams()}`)
      const data = res.ok ? await res.json() : null
      setInventoryList(data)
    } catch (e) {
      console.error('Failed to fetch inventory list:', e)
    } finally {
      setListLoading(false)
    }
  }, [buildListParams])

  useEffect(() => {
    fetchSummaryData()
  }, [fetchSummaryData])

  useEffect(() => {
    fetchListData()
  }, [fetchListData])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, brand, category, season, status, lifecycle, alertType])

  // Handle alert card click
  const handleAlertClick = (type: string) => {
    setAlertType((prev) => (prev === type ? 'all' : type))
  }

  // Handle sort
  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortBy(key)
    setSortOrder(order)
    setPage(1)
  }

  // Handle row click -> open detail dialog
  const handleRowClick = (row: Record<string, unknown>) => {
    setDetailItem(row as unknown as InventoryItem)
    setDetailOpen(true)
  }

  // Row background color
  const getRowClassName = (row: Record<string, unknown>) => {
    const remainingDays = row.season_remaining_days as number
    const totalStock = row.total_stock as number
    if (remainingDays <= 0 && totalStock > 0) return 'bg-red-50'
    if (remainingDays < 30 && totalStock > 0) return 'bg-yellow-50'
    return ''
  }

  // Transform category summary for stacked bar chart
  const brands = Array.from(new Set(categorySummary.map((c) => c.brand)))
  const categoryChartData = (() => {
    const grouped: Record<string, Record<string, number>> = {}
    for (const item of categorySummary) {
      if (!grouped[item.category]) grouped[item.category] = {}
      grouped[item.category][item.brand] = (grouped[item.category][item.brand] || 0) + item.stock_retail_value
    }
    return Object.entries(grouped)
      .map(([cat, brandValues]) => ({
        category: cat,
        ...brandValues,
      }))
      .sort((a, b) => {
        const totalA = brands.reduce((sum, br) => sum + ((a as Record<string, unknown>)[br] as number || 0), 0)
        const totalB = brands.reduce((sum, br) => sum + ((b as Record<string, unknown>)[br] as number || 0), 0)
        return totalB - totalA
      })
  })()

  // Table columns
  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'image_url',
      label: '',
      className: 'w-[52px]',
      render: (row) => {
        const url = row.image_url as string | null
        return url ? (
          <img src={url} alt="" className="w-[40px] min-w-[40px] h-[40px] min-h-[40px] object-cover rounded shrink-0" />
        ) : (
          <div className="w-[40px] min-w-[40px] h-[40px] min-h-[40px] bg-gray-100 rounded flex items-center justify-center text-gray-300 shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
        )
      },
    },
    {
      key: 'product_code',
      label: '品番',
      className: 'min-w-[100px]',
      render: (row) => {
        const focus = row.is_focus as string
        return (
          <div>
            <span className="font-mono font-medium text-sm">{String(row.product_code || '-')}</span>
            {focus ? (
              <Badge className="ml-1.5 bg-orange-100 text-orange-700 px-1 py-0 text-[10px]">{focus}</Badge>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'goods_name',
      label: '商品名',
      sortable: true,
      className: 'min-w-[180px] max-w-[220px]',
      render: (row) => (
        <span className="truncate block text-sm" title={String(row.goods_name || '')}>
          {String(row.goods_name || '-')}
        </span>
      ),
    },
    {
      key: 'brand',
      label: 'ブランド',
      sortable: true,
      className: 'min-w-[90px]',
    },
    {
      key: 'season',
      label: 'シーズン',
      sortable: true,
      className: 'min-w-[70px]',
    },
    {
      key: 'total_stock',
      label: '総在庫',
      sortable: true,
      align: 'right',
      render: (row) => formatNumber(row.total_stock as number),
    },
    {
      key: 'stock_retail_value',
      label: '在庫金額',
      sortable: true,
      align: 'right',
      render: (row) => formatCurrency(row.stock_retail_value as number),
    },
    {
      key: 'daily_sales',
      label: '日販',
      sortable: true,
      align: 'right',
      render: (row) => {
        const v = row.daily_sales as number
        return v != null ? v.toFixed(1) : '-'
      },
    },
    {
      key: 'stock_days',
      label: '在庫日数',
      sortable: true,
      align: 'right',
      render: (row) => {
        const v = row.stock_days as number
        if (v == null) return '-'
        if (v > 180) return <span className="text-red-600 font-medium">{formatNumber(v)}</span>
        if (v > 90) return <span className="text-yellow-600">{formatNumber(v)}</span>
        return formatNumber(v)
      },
    },
    {
      key: 'season_remaining_days',
      label: '残日数',
      sortable: true,
      align: 'right',
      render: (row) => {
        const v = row.season_remaining_days as number
        if (v == null) return '-'
        if (v <= 0) return <span className="text-red-600 font-medium">超過</span>
        if (v < 30) return <span className="text-yellow-600 font-medium">{v}日</span>
        return `${v}日`
      },
    },
    {
      key: 'lifecycle_stance',
      label: 'ライフサイクル',
      render: (row) => <LifecycleBadge stage={String(row.lifecycle_stance || '')} />,
    },
    {
      key: 'inventory_status',
      label: 'ステータス',
      render: (row) => {
        const s = String(row.inventory_status || '-')
        const variant = s.includes('過剰') ? 'destructive' : s.includes('不足') ? 'outline' : 'secondary'
        return <Badge variant={variant}>{s}</Badge>
      },
    },
    {
      key: 'reorder_judgment',
      label: '発注判定',
      className: 'min-w-[110px]',
      render: (row) => {
        const v = String(row.reorder_judgment || '-')
        if (v === '追加発注推奨') return <span className="text-blue-600 font-medium">{v}</span>
        if (v === '値引推奨') return <span className="text-red-600 font-medium">{v}</span>
        return <span className="text-gray-500">{v}</span>
      },
    },
  ]

  // Compute summary from current list
  const listSummary = inventoryList ? {
    totalItems: inventoryList.total,
    totalStock: inventoryList.data.reduce((s, d) => s + d.total_stock, 0),
    totalValue: inventoryList.data.reduce((s, d) => s + d.stock_retail_value, 0),
  } : null

  return (
    <>
      <Header title="在庫管理" subtitle="商品マスタ連携" />
      <div className="p-6 space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="品番・商品名で検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 pl-9 bg-white"
            />
          </div>
          <Select value={brand} onValueChange={(v) => setBrand(v ?? '全て')}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="ブランド" />
            </SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>{getBrandDisplayName(b)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v ?? '全て')}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => setSeason(v ?? '全て')}>
            <SelectTrigger className="w-28 bg-white">
              <SelectValue placeholder="シーズン" />
            </SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v ?? '全て')}>
            <SelectTrigger className="w-28 bg-white">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lifecycle} onValueChange={(v) => setLifecycle(v ?? '全て')}>
            <SelectTrigger className="w-32 bg-white">
              <SelectValue placeholder="ライフサイクル" />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_OPTIONS.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={alertType} onValueChange={(v) => setAlertType(v ?? 'all')}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="アラート" />
            </SelectTrigger>
            <SelectContent>
              {ALERT_TYPE_OPTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Alert Cards */}
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : alerts ? (
          <div className="grid grid-cols-3 gap-4">
            <AlertCard
              title="過剰在庫"
              count={alerts.overstock.count}
              amount={formatCurrency(alerts.overstock.amount)}
              color="red"
              onClick={() => handleAlertClick('overstock')}
            />
            <AlertCard
              title="シーズン終了間近（30日以内）"
              count={alerts.season_ending.count}
              amount={formatCurrency(alerts.season_ending.amount)}
              color="yellow"
              onClick={() => handleAlertClick('season_ending')}
            />
            <AlertCard
              title="シーズン超過"
              count={alerts.season_exceeded.count}
              amount={formatCurrency(alerts.season_exceeded.amount)}
              color="red"
              onClick={() => handleAlertClick('season_exceeded')}
            />
          </div>
        ) : null}

        {/* Charts Row */}
        <div className="grid grid-cols-2 gap-6">
          {/* Season Summary - Stacked Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">シーズン別在庫金額</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px]" />
              ) : seasonSummary.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={seasonSummary} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={currencyFormatter} />
                    <YAxis type="category" dataKey="season" width={50} />
                    <Tooltip formatter={currencyFormatter} />
                    <Legend />
                    <Bar dataKey="in_season_amount" name="シーズン内" stackId="a" fill="#3B82F6" />
                    <Bar dataKey="exceeded_amount" name="シーズン超過" stackId="a" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>

          {/* Category Summary - Stacked Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">カテゴリ×ブランド在庫金額</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px]" />
              ) : categoryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={currencyFormatter} />
                    <Tooltip formatter={currencyFormatter} />
                    <Legend />
                    {brands.map((b) => (
                      <Bar
                        key={b}
                        dataKey={b}
                        name={b}
                        stackId="a"
                        fill={BRAND_COLORS[b] || '#6B7280'}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">データがありません</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                在庫一覧
                {inventoryList && (
                  <span className="text-sm font-normal text-gray-500">
                    ({formatNumber(inventoryList.total)}件)
                  </span>
                )}
              </CardTitle>
              {listSummary && (
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>表示分 在庫数: <strong className="text-gray-700">{formatNumber(listSummary.totalStock)}</strong></span>
                  <span>在庫金額: <strong className="text-gray-700">{formatCurrency(listSummary.totalValue)}</strong></span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <Skeleton className="h-[400px]" />
            ) : inventoryList ? (
              <DataTable
                columns={columns}
                data={inventoryList.data as unknown as Record<string, unknown>[]}
                pageSize={perPage}
                currentPage={inventoryList.page}
                totalItems={inventoryList.total}
                onPageChange={setPage}
                onSort={handleSort}
                sortKey={sortBy}
                sortOrder={sortOrder}
                rowClassName={getRowClassName}
                onRowClick={handleRowClick}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">データの読み込みに失敗しました</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {detailItem?.image_url ? (
                <img src={detailItem.image_url} alt="" className="w-14 h-14 object-cover rounded" />
              ) : (
                <div className="w-14 h-14 bg-gray-100 rounded flex items-center justify-center text-gray-300">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
              <div>
                <div className="font-mono text-base">{detailItem?.product_code}</div>
                <div className="text-sm text-gray-500 font-normal">{detailItem?.goods_name}</div>
              </div>
            </DialogTitle>
          </DialogHeader>

          {detailItem && (
            <div className="mt-4 space-y-5">
              {/* Basic Info + Master Info side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">基本情報</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <InfoCell label="ブランド" value={detailItem.brand} />
                    <InfoCell label="カテゴリ" value={detailItem.category} />
                    <InfoCell label="シーズン" value={detailItem.season} />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">マスタデータ</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <InfoCell label="上代" value={formatCurrency(detailItem.selling_price)} />
                    <InfoCell label="下代" value={formatCurrency(detailItem.cost_price)} />
                    <InfoCell label="注力" value={detailItem.is_focus || '-'} />
                    <InfoCell label="再入荷" value={detailItem.restock || '-'} />
                  </div>
                </div>
              </div>

              {/* Stock Breakdown + Optimal Stock Gauge */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">在庫内訳</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <InfoCell label="総在庫" value={formatNumber(detailItem.total_stock)} highlight />
                    <InfoCell label="フリー在庫" value={formatNumber(detailItem.free_stock)} />
                    <InfoCell label="ZOZO在庫" value={formatNumber(detailItem.zozo_stock)} />
                    <InfoCell label="自社在庫" value={formatNumber(detailItem.own_stock)} />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">適正在庫との乖離</h4>
                  <OptimalStockGauge
                    currentStock={detailItem.total_stock}
                    dailySales={detailItem.daily_sales}
                    seasonRemainingDays={detailItem.season_remaining_days}
                  />
                </div>
              </div>

              {/* Sales & Stock Analysis + Lead Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">販売・在庫分析</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <InfoCell label="在庫金額" value={formatCurrency(detailItem.stock_retail_value)} highlight />
                    <InfoCell label="日販" value={`${detailItem.daily_sales.toFixed(1)} 個/日`} />
                    <InfoCell label="在庫日数" value={`${formatNumber(detailItem.stock_days)} 日`} />
                    <InfoCell label="残日数" value={
                      detailItem.season_remaining_days <= 0
                        ? 'シーズン超過'
                        : `${detailItem.season_remaining_days} 日`
                    } warn={detailItem.season_remaining_days <= 30} />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">発注リードタイム</h4>
                  <LeadTimeInfo
                    orderLot={detailItem.order_lot}
                    restock={detailItem.restock}
                    dailySales={detailItem.daily_sales}
                    totalStock={detailItem.total_stock}
                  />
                </div>
              </div>

              {/* Consumption Forecast */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">消化予測</h4>
                <ConsumptionForecast
                  totalStock={detailItem.total_stock}
                  dailySales={detailItem.daily_sales}
                  seasonRemainingDays={detailItem.season_remaining_days}
                  sellingPrice={detailItem.selling_price}
                />
              </div>

              {/* IO History (simulated) */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">入出庫履歴（直近30日）</h4>
                <IOHistory productCode={detailItem.product_code} />
              </div>

              {/* Status & Action */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">ステータス・アクション</h4>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[11px] text-gray-500 mb-1">ライフサイクル</div>
                    <LifecycleBadge stage={detailItem.lifecycle_stance} />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-[11px] text-gray-500 mb-1">在庫ステータス</div>
                    <Badge variant={detailItem.inventory_status.includes('過剰') ? 'destructive' : detailItem.inventory_status.includes('不足') ? 'outline' : 'secondary'}>
                      {detailItem.inventory_status}
                    </Badge>
                  </div>
                  <InfoCell label="発注判定" value={detailItem.reorder_judgment || '-'} />
                  <InfoCell label="発注ロット" value={detailItem.order_lot ? `${detailItem.order_lot} 個` : '-'} />
                </div>
              </div>

              {/* Recommended Action */}
              {detailItem.lifecycle_action && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    {detailItem.lifecycle_action.includes('値引') ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : detailItem.lifecycle_action.includes('発注') ? (
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Minus className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="font-medium text-blue-800">推奨アクション:</span>
                    <span className="text-blue-700">{detailItem.lifecycle_action}</span>
                    {detailItem.recommended_discount > 0 && (
                      <Badge className="bg-red-100 text-red-700 ml-2">
                        {detailItem.recommended_discount}%OFF推奨
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Optimal stock gauge component
function OptimalStockGauge({ currentStock, dailySales, seasonRemainingDays }: {
  currentStock: number
  dailySales: number
  seasonRemainingDays: number
}) {
  // Optimal stock = daily sales * min(remaining days, 90) with safety buffer
  const targetDays = Math.min(Math.max(seasonRemainingDays, 0), 90)
  const optimalStock = Math.round(dailySales * targetDays * 1.1) // 10% safety buffer
  const ratio = optimalStock > 0 ? currentStock / optimalStock : 0
  const fillPct = Math.min(ratio * 100, 150)

  let barColor = 'bg-green-500'
  let statusText = '適正'
  let statusColor = 'text-green-600'
  if (ratio > 1.5) {
    barColor = 'bg-red-500'
    statusText = '大幅過剰'
    statusColor = 'text-red-600'
  } else if (ratio > 1.2) {
    barColor = 'bg-yellow-500'
    statusText = 'やや過剰'
    statusColor = 'text-yellow-600'
  } else if (ratio < 0.5 && dailySales > 0) {
    barColor = 'bg-orange-500'
    statusText = '不足気味'
    statusColor = 'text-orange-600'
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">現在庫: {formatNumber(currentStock)}</span>
        <span className="text-xs text-gray-500">適正: {formatNumber(optimalStock)}</span>
      </div>
      <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${Math.min(fillPct, 100)}%` }}
        />
        {/* Optimal line marker */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-600" style={{ left: `${Math.min(100 / (fillPct / 100 || 1), 100)}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>
        <span className="text-xs text-gray-400">{(ratio * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

// Lead time info
function LeadTimeInfo({ orderLot, restock, dailySales, totalStock }: {
  orderLot: number | null
  restock: string
  dailySales: number
  totalStock: number
}) {
  // Estimate lead time based on restock info
  const estimatedLeadDays = restock === '可' ? 14 : restock === '要確認' ? 21 : 30
  const stockRunoutDays = dailySales > 0 ? Math.round(totalStock / dailySales) : null
  const needsReorder = stockRunoutDays !== null && stockRunoutDays < estimatedLeadDays * 1.5

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-[11px] text-gray-500 mb-0.5">推定リードタイム</div>
        <div className="text-sm font-medium text-gray-700">{estimatedLeadDays}日</div>
      </div>
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-[11px] text-gray-500 mb-0.5">発注ロット</div>
        <div className="text-sm font-medium text-gray-700">{orderLot ? `${orderLot}個` : '-'}</div>
      </div>
      <div className={`rounded-lg p-3 ${needsReorder ? 'bg-red-50' : 'bg-gray-50'}`}>
        <div className="text-[11px] text-gray-500 mb-0.5">在庫切れ予測</div>
        <div className={`text-sm font-medium ${needsReorder ? 'text-red-600' : 'text-gray-700'}`}>
          {stockRunoutDays !== null ? `${stockRunoutDays}日後` : '-'}
        </div>
        {needsReorder && (
          <div className="text-[10px] text-red-500 mt-0.5">要発注</div>
        )}
      </div>
    </div>
  )
}

// Consumption forecast
function ConsumptionForecast({ totalStock, dailySales, seasonRemainingDays, sellingPrice }: {
  totalStock: number
  dailySales: number
  seasonRemainingDays: number
  sellingPrice: number
}) {
  const forecasts = [
    { label: '現在ペース', rate: 1.0 },
    { label: '10%OFF時', rate: 1.15 },
    { label: '20%OFF時', rate: 1.35 },
    { label: '30%OFF時', rate: 1.6 },
  ]

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left text-xs text-gray-500 pb-2 font-medium">シナリオ</th>
              <th className="text-right text-xs text-gray-500 pb-2 font-medium">予測日販</th>
              <th className="text-right text-xs text-gray-500 pb-2 font-medium">完売予測日数</th>
              <th className="text-right text-xs text-gray-500 pb-2 font-medium">シーズン内完売</th>
              <th className="text-right text-xs text-gray-500 pb-2 font-medium">残在庫金額</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => {
              const adjDaily = dailySales * f.rate
              const daysToSellout = adjDaily > 0 ? Math.ceil(totalStock / adjDaily) : Infinity
              const willSellInSeason = seasonRemainingDays > 0 && daysToSellout <= seasonRemainingDays
              const remainingAtSeasonEnd = seasonRemainingDays > 0
                ? Math.max(0, Math.round(totalStock - adjDaily * seasonRemainingDays))
                : totalStock
              const remainingValue = remainingAtSeasonEnd * sellingPrice

              return (
                <tr key={f.label} className="border-b last:border-0">
                  <td className="py-1.5 text-gray-700">{f.label}</td>
                  <td className="py-1.5 text-right text-gray-700">{adjDaily > 0 ? adjDaily.toFixed(1) : '-'}</td>
                  <td className="py-1.5 text-right text-gray-700">{daysToSellout < 9999 ? `${daysToSellout}日` : '-'}</td>
                  <td className="py-1.5 text-right">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${willSellInSeason ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {willSellInSeason ? '可能' : '不可'}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-gray-700">
                    {remainingAtSeasonEnd > 0 ? formatCurrency(remainingValue) : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// IO History (simulated - in production would fetch from API)
function IOHistory({ productCode }: { productCode: string }) {
  // Generate simulated IO history
  const events = (() => {
    const result: { date: string; type: '入庫' | '出庫'; qty: number; source: string }[] = []
    const now = new Date()
    const seed = productCode.split('').reduce((s, c) => s + c.charCodeAt(0), 0)

    for (let i = 0; i < 10; i++) {
      const daysAgo = Math.floor((seed * (i + 1) * 7) % 30) + 1
      const date = new Date(now)
      date.setDate(date.getDate() - daysAgo)
      const dateStr = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`

      const isIn = (seed + i) % 3 === 0
      const qty = Math.floor(((seed * (i + 1)) % 20) + 1)
      const sources = isIn ? ['仕入先入庫', 'EC返品', '移管入庫'] : ['NE出荷', 'ZOZO出荷', '店舗出荷']
      const source = sources[(seed + i) % sources.length]

      result.push({ date: dateStr, type: isIn ? '入庫' : '出庫', qty, source })
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  })()

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="max-h-[180px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b">
              <th className="text-left text-xs text-gray-500 pb-1.5 font-medium">日付</th>
              <th className="text-left text-xs text-gray-500 pb-1.5 font-medium">種別</th>
              <th className="text-right text-xs text-gray-500 pb-1.5 font-medium">数量</th>
              <th className="text-left text-xs text-gray-500 pb-1.5 font-medium pl-4">区分</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1 text-gray-600">{ev.date}</td>
                <td className="py-1">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ev.type === '入庫' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {ev.type}
                  </span>
                </td>
                <td className={`py-1 text-right font-medium ${ev.type === '入庫' ? 'text-blue-600' : 'text-orange-600'}`}>
                  {ev.type === '入庫' ? '+' : '-'}{ev.qty}
                </td>
                <td className="py-1 text-gray-500 pl-4">{ev.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Info cell for detail dialog
function InfoCell({ label, value, highlight, warn }: {
  label: string
  value: string
  highlight?: boolean
  warn?: boolean
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-[11px] text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${highlight ? 'text-gray-900' : warn ? 'text-red-600' : 'text-gray-700'}`}>
        {value}
      </div>
    </div>
  )
}
