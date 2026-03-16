'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/format'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS } from '@/lib/constants'
import { ExternalLink, Image, RefreshCw } from 'lucide-react'
import type { ProductMaster } from '@/types/master'

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1m_slCKW-k_pcEDW7goMDc7Mt3-gTQBL75mchKU-GOv8/edit?gid=1735499737#gid=1735499737'

interface MasterRow extends ProductMaster {
  [key: string]: unknown
}

interface ListResponse {
  data: MasterRow[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export default function MasterPage() {
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ListResponse | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (brand !== '全て') params.set('brand', brand)
      if (category !== '全て') params.set('category', category)
      if (season !== '全て') params.set('season', season)
      params.set('page', String(page))
      params.set('per_page', '50')

      const res = await fetch(`/api/master?${params}`)
      if (res.ok) {
        setResult(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch master:', e)
    } finally {
      setLoading(false)
    }
  }, [search, brand, category, season, page])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { setPage(1) }, [search, brand, category, season])

  const columns: Column<MasterRow>[] = [
    {
      key: 'image_url',
      label: '',
      className: 'w-[52px]',
      render: (row) =>
        row.image_url ? (
          <img src={row.image_url} alt="" className="w-10 h-10 object-cover rounded" />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300">
            <Image className="w-4 h-4" />
          </div>
        ),
    },
    {
      key: 'product_code',
      label: '代表品番',
      className: 'min-w-[140px]',
      render: (row) => (
        <div className="font-mono text-sm font-medium">{row.product_code}</div>
      ),
    },
    {
      key: 'is_focus',
      label: '注力',
      className: 'w-[50px]',
      render: (row) => row.is_focus ? (
        <Badge className="bg-orange-100 text-orange-700 text-[11px]">{row.is_focus}</Badge>
      ) : <span className="text-gray-300">-</span>,
    },
    { key: 'brand', label: 'ブランド' },
    { key: 'category', label: 'カテゴリ' },
    { key: 'season', label: 'シーズン' },
    {
      key: 'collaborator',
      label: 'コラボ',
      render: (row) => <span className="text-sm">{row.collaborator || '-'}</span>,
    },
    {
      key: 'size',
      label: 'サイズ',
      render: (row) => <span className="text-sm text-gray-500">{row.size || '-'}</span>,
    },
    {
      key: 'selling_price',
      label: '上代',
      align: 'right',
      render: (row) => <span className="text-sm">{row.selling_price ? formatCurrency(row.selling_price) : '-'}</span>,
    },
    {
      key: 'cost_price',
      label: '下代',
      align: 'right',
      render: (row) => <span className="text-sm">{row.cost_price ? formatCurrency(row.cost_price) : '-'}</span>,
    },
    {
      key: 'restock',
      label: '再入荷',
      render: (row) => <span className="text-sm text-gray-500">{row.restock || '-'}</span>,
    },
    {
      key: 'sales_start_date',
      label: '販売期間',
      render: (row) => (
        <span className="text-xs text-gray-500">
          {formatDate(row.sales_start_date)}
          {row.sales_end_date ? ` ~ ${formatDate(row.sales_end_date)}` : ' ~'}
        </span>
      ),
    },
  ]

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
          <Select value={brand} onValueChange={(v) => v && setBrand(v)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BRAND_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => v && setCategory(v)}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={season} onValueChange={(v) => v && setSeason(v)}>
            <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEASON_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

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
            pageSize={50}
            currentPage={result.page}
            totalItems={result.total}
            onPageChange={setPage}
          />
        ) : null}
      </div>
    </>
  )
}
