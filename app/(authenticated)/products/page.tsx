'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import ProductDetailPanel from '@/components/products/ProductDetailPanel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS, PRICE_TIER_OPTIONS, PROFIT_RATE_COLORS } from '@/lib/constants'

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
}

interface ProductListResponse {
  data: ProductRow[]
  total: number
  page: number
  per_page: number
  total_pages: number
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

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [priceTier, setPriceTier] = useState('全て')
  const [sortBy, setSortBy] = useState('sales_amount')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const buildCacheKey = useCallback(() => {
    return `products:${search}:${brand}:${category}:${season}:${priceTier}:${sortBy}:${sortOrder}:${page}`
  }, [search, brand, category, season, priceTier, sortBy, sortOrder, page])

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
  }, [search, brand, category, season, priceTier, sortBy, sortOrder, page, perPage, buildCacheKey])

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

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, brand, category, season, priceTier])

  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortBy(key)
    setSortOrder(order)
  }

  const columns: Column<ProductRow>[] = [
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
    { key: 'brand', label: 'ブランド' },
    { key: 'category', label: 'カテゴリ' },
    { key: 'season', label: 'シーズン' },
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
      align: 'right',
      sortable: true,
      render: (row) => <ProfitRateBar rate={row.gross_profit_rate} />,
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
      <Header title="商品分析" />
      <div className="p-6 space-y-4">
        {/* Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="商品名・商品コードで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 bg-white"
          />
          <Select value={brand} onValueChange={(v) => v && setBrand(v)}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => v && setSeason(v)}>
            <SelectTrigger className="w-28 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priceTier} onValueChange={(v) => v && setPriceTier(v)}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICE_TIER_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            onRowClick={(row) => setSelectedProduct(row.product_code)}
          />
        ) : null}
      </div>

      {/* Detail Panel */}
      {selectedProduct && (
        <ProductDetailPanel
          productCode={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  )
}
