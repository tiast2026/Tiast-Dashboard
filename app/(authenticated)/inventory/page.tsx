'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import AlertCard from '@/components/cards/AlertCard'
import DataTable, { Column } from '@/components/tables/DataTable'
import LifecycleBadge from '@/components/products/LifecycleBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/format'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS, BRAND_COLORS } from '@/lib/constants'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

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
  { value: '', label: '全て' },
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
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [status, setStatus] = useState('全て')
  const [lifecycle, setLifecycle] = useState('全て')
  const [alertType, setAlertType] = useState('')

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

  // Build query params for list
  const buildListParams = useCallback(() => {
    const params = new URLSearchParams()
    if (brand !== '全て') params.set('brand', brand)
    if (category !== '全て') params.set('category', category)
    if (season !== '全て') params.set('season', season)
    if (status !== '全て') params.set('status', status)
    if (lifecycle !== '全て') params.set('lifecycle', lifecycle)
    if (alertType) params.set('alert_type', alertType)
    params.set('sort_by', sortBy)
    params.set('sort_order', sortOrder)
    params.set('page', String(page))
    params.set('per_page', String(perPage))
    return params.toString()
  }, [brand, category, season, status, lifecycle, alertType, sortBy, sortOrder, page, perPage])

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
  }, [brand, category, season, status, lifecycle, alertType])

  // Handle alert card click
  const handleAlertClick = (type: string) => {
    setAlertType((prev) => (prev === type ? '' : type))
  }

  // Handle sort
  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortBy(key)
    setSortOrder(order)
    setPage(1)
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
    { key: 'product_code', label: '品番', className: 'min-w-[80px]' },
    {
      key: 'goods_name',
      label: '商品名',
      sortable: true,
      className: 'min-w-[200px] max-w-[250px]',
      render: (row) => (
        <span className="truncate block" title={String(row.goods_name || '')}>
          {String(row.goods_name || '-')}
        </span>
      ),
    },
    {
      key: 'brand',
      label: 'ブランド',
      sortable: true,
      className: 'min-w-[100px]',
    },
    {
      key: 'category',
      label: 'カテゴリ',
      sortable: true,
      className: 'min-w-[90px]',
    },
    {
      key: 'season',
      label: 'シーズン',
      sortable: true,
      className: 'min-w-[80px]',
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
        return v != null ? formatNumber(v) : '-'
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
        const variant = s === '過剰' ? 'destructive' : s === '在庫なし' ? 'outline' : 'secondary'
        return <Badge variant={variant}>{s}</Badge>
      },
    },
    {
      key: 'lifecycle_action',
      label: 'アクション',
      className: 'min-w-[120px]',
      render: (row) => String(row.lifecycle_action || '-'),
    },
  ]

  return (
    <>
      <Header title="在庫管理" />
      <div className="p-6 space-y-6">
        {/* Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={brand} onValueChange={(v) => setBrand(v ?? '全て')}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="ブランド" />
            </SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
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
          <Select value={alertType} onValueChange={(v) => setAlertType(v ?? '')}>
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
              ) : (
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
              ) : (
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
              )}
            </CardContent>
          </Card>
        </div>

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              在庫一覧
              {inventoryList && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({formatNumber(inventoryList.total)}件)
                </span>
              )}
            </CardTitle>
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
              />
            ) : (
              <div className="text-center py-8 text-gray-500">データの読み込みに失敗しました</div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
