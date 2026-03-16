/* eslint-disable react/display-name */
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/format'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS } from '@/lib/constants'
import { ExternalLink, Image as ImageIcon, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import type { ProductMaster } from '@/types/master'

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1m_slCKW-k_pcEDW7goMDc7Mt3-gTQBL75mchKU-GOv8/edit?gid=1735499737#gid=1735499737'

const PAGE_SIZE_OPTIONS = [30, 50, 100, 200]

interface HeaderInfo {
  key: string
  label: string
  isExtra: boolean
}

interface MasterRow extends ProductMaster {
  [key: string]: unknown
}

interface ListResponse {
  data: MasterRow[]
  total: number
  page: number
  per_page: number
  total_pages: number
  headers?: HeaderInfo[]
}

interface SkuImageItem {
  product_code: string
  shop_name: string
  sku_code: string
  color: string
  size: string
  sku_image_url: string
  extra_fields: Record<string, string>
}

interface SkuHeaderInfo {
  key: string
  label: string
  isExtra: boolean
}

// Known column renderers (special formatting)
function getKnownColumnRenderer(key: string): ((row: MasterRow) => React.ReactNode) | null {
  switch (key) {
    case 'image_url':
      return (row) =>
        row.image_url ? (
          <img src={row.image_url} alt="" className="w-[44px] min-w-[44px] h-[44px] min-h-[44px] object-cover rounded shrink-0" />
        ) : (
          <div className="w-[44px] min-w-[44px] h-[44px] min-h-[44px] bg-gray-100 rounded flex items-center justify-center text-gray-300 shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
        )
    case 'product_code':
      return (row) => <span className="font-mono font-medium">{row.product_code}</span>
    case 'zozo_product_code':
      return (row) => <span className="font-mono text-gray-500">{row.zozo_product_code || '-'}</span>
    case 'is_focus':
      return (row) => row.is_focus ? (
        <Badge className="bg-orange-100 text-orange-700 px-1.5">{row.is_focus}</Badge>
      ) : <span className="text-gray-300">-</span>
    case 'selling_price':
      return (row) => <span>{row.selling_price ? formatCurrency(row.selling_price) : '-'}</span>
    case 'cost_price':
      return (row) => <span>{row.cost_price ? formatCurrency(row.cost_price) : '-'}</span>
    case 'order_lot':
      return (row) => <span>{row.order_lot ?? '-'}</span>
    case 'sales_start_date':
      return (row) => <span className="text-gray-500">{formatDate(row.sales_start_date)}</span>
    case 'sales_end_date':
      return (row) => <span className="text-gray-500">{formatDate(row.sales_end_date)}</span>
    case 'restock':
      return (row) => <span className="text-gray-500">{row.restock || '-'}</span>
    case 'collaborator':
      return (row) => <span>{row.collaborator || '-'}</span>
    case 'size':
      return (row) => <span className="text-gray-500">{row.size || '-'}</span>
    case 'season_extraction':
      return (row) => <span>{row.season_extraction || '-'}</span>
    default:
      return null
  }
}

// Right-aligned columns
const RIGHT_ALIGN_KEYS = new Set(['selling_price', 'cost_price', 'order_lot'])

// Columns to hide from table (rendered separately or internal)
const HIDDEN_KEYS = new Set(['image_url'])

export default function MasterPage() {
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ListResponse | null>(null)

  // SKU dialog state
  const [skuDialogOpen, setSkuDialogOpen] = useState(false)
  const [skuDialogProduct, setSkuDialogProduct] = useState<MasterRow | null>(null)
  const [skuImages, setSkuImages] = useState<SkuImageItem[]>([])
  const [skuHeaders, setSkuHeaders] = useState<SkuHeaderInfo[]>([])
  const [skuLoading, setSkuLoading] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (brand !== '全て') params.set('brand', brand)
      if (category !== '全て') params.set('category', category)
      if (season !== '全て') params.set('season', season)
      params.set('page', String(page))
      params.set('per_page', String(perPage))

      const res = await fetch(`/api/master?${params}`)
      if (res.ok) {
        setResult(await res.json())
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `データの取得に失敗しました (${res.status})`)
      }
    } catch (e) {
      console.error('Failed to fetch master:', e)
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [search, brand, category, season, page, perPage])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { setPage(1) }, [search, brand, category, season, perPage])

  // Handle row click → fetch SKU images
  const handleRowClick = useCallback(async (row: MasterRow) => {
    setSkuDialogProduct(row)
    setSkuDialogOpen(true)
    setSkuLoading(true)
    setSkuImages([])
    setSkuHeaders([])

    try {
      const res = await fetch(`/api/master/sku-images?product_code=${encodeURIComponent(row.product_code)}`)
      if (res.ok) {
        const data = await res.json()
        setSkuImages(data.data || [])
        setSkuHeaders(data.headers || [])
      }
    } catch (e) {
      console.error('Failed to fetch SKU images:', e)
    } finally {
      setSkuLoading(false)
    }
  }, [])

  // Build columns dynamically from API headers
  const columns: Column<MasterRow>[] = useMemo(() => {
    const headers = result?.headers || []
    if (headers.length === 0) return []

    const cols: Column<MasterRow>[] = []

    // Add image column
    const hasImage = headers.some(h => h.key === 'image_url')
    if (hasImage) {
      cols.push({
        key: 'image_url',
        label: '',
        className: 'w-[52px]',
        render: getKnownColumnRenderer('image_url')!,
      })
    }

    // Add remaining columns in spreadsheet order
    for (const h of headers) {
      if (HIDDEN_KEYS.has(h.key)) continue

      const renderer = h.isExtra ? null : getKnownColumnRenderer(h.key)
      const col: Column<MasterRow> = {
        key: h.key,
        label: h.label,
        className: h.key === 'product_code' ? 'min-w-[140px]' : 'whitespace-nowrap',
        align: RIGHT_ALIGN_KEYS.has(h.key) ? 'right' : undefined,
      }

      if (renderer) {
        col.render = renderer
      } else if (h.isExtra) {
        col.render = (row) => {
          const val = row.extra_fields?.[h.label]
          return <span>{val || '-'}</span>
        }
      }

      cols.push(col)
    }

    return cols
  }, [result?.headers])

  return (
    <>
      <Header title="商品マスタ" />
      <div className="p-6 space-y-4">
        {/* Info banner */}
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-sm text-blue-800">
            マスタデータはスプレッドシートで管理しています。編集はスプレッドシートで行ってください。
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => fetchList()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />再読込
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => window.open(SPREADSHEET_URL, '_blank')}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" />スプレッドシートを開く
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="品番で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 bg-white"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">ブランド</span>
            <Select value={brand} onValueChange={(v) => v && setBrand(v)}>
              <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BRAND_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">カテゴリ</span>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500">シーズン</span>
            <Select value={season} onValueChange={(v) => v && setSeason(v)}>
              <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEASON_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-sm text-gray-500">表示</span>
            <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v))}>
              <SelectTrigger className="w-20 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}件</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <div className="text-sm text-red-700">{error}</div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => fetchList()}>
              再試行
            </Button>
          </div>
        )}

        {/* Table (read-only) */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded" />
            ))}
          </div>
        ) : result ? (
          <DataTable<MasterRow>
            columns={columns}
            data={result.data as MasterRow[]}
            pageSize={perPage}
            currentPage={result.page}
            totalItems={result.total}
            onPageChange={setPage}
            onRowClick={handleRowClick}
          />
        ) : null}
      </div>

      {/* SKU Images Dialog */}
      <Dialog open={skuDialogOpen} onOpenChange={setSkuDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {skuDialogProduct?.image_url && (
                <img src={skuDialogProduct.image_url} alt="" className="w-12 h-12 object-cover rounded" />
              )}
              <div>
                <div className="font-mono text-base">{skuDialogProduct?.product_code}</div>
                <div className="text-sm text-gray-500 font-normal">
                  {skuDialogProduct?.brand} / {skuDialogProduct?.category}
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">SKU一覧（{skuImages.length}件）</h3>
            {skuLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
              </div>
            ) : skuImages.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                SKUデータがありません
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">画像</th>
                      {skuHeaders
                        .filter(h => h.key !== 'sku_image_url' && h.key !== 'product_code' && h.key !== 'shop_name')
                        .map(h => (
                          <th key={h.key} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">
                            {h.label}
                          </th>
                        ))
                      }
                    </tr>
                  </thead>
                  <tbody>
                    {skuImages.map((sku, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          {sku.sku_image_url ? (
                            <img src={sku.sku_image_url} alt={sku.sku_code} className="w-14 h-14 object-cover rounded" />
                          ) : (
                            <div className="w-14 h-14 bg-gray-100 rounded flex items-center justify-center text-gray-300">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                        {skuHeaders
                          .filter(h => h.key !== 'sku_image_url' && h.key !== 'product_code' && h.key !== 'shop_name')
                          .map(h => {
                            let val: string
                            if (h.isExtra) {
                              val = sku.extra_fields?.[h.label] || '-'
                            } else {
                              val = String((sku as unknown as Record<string, unknown>)[h.key] ?? '-')
                            }
                            return (
                              <td key={h.key} className="px-3 py-2 whitespace-nowrap">
                                {h.key === 'sku_code' ? (
                                  <span className="font-mono">{val}</span>
                                ) : val}
                              </td>
                            )
                          })
                        }
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
