'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/Header'
import DataTable, { Column } from '@/components/tables/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate, formatPercent } from '@/lib/format'
import { BRAND_OPTIONS, CATEGORY_OPTIONS, SEASON_OPTIONS } from '@/lib/constants'
import { Plus, Upload, Search, Image, Trash2, Pencil, Download } from 'lucide-react'
import type { ProductMaster, RakutenImageResult } from '@/types/master'

const STANCE_OPTIONS = ['全て', '助走期', '最盛期', '安定期', '衰退期'] as const
const STANCE_COLORS: Record<string, string> = {
  '助走期': 'bg-blue-100 text-blue-700',
  '最盛期': 'bg-green-100 text-green-700',
  '安定期': 'bg-yellow-100 text-yellow-700',
  '衰退期': 'bg-red-100 text-red-700',
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
}

// Empty form state
function emptyForm(): Partial<ProductMaster> {
  return {
    product_code: '',
    product_name: '',
    brand: 'NOAHL',
    category: 'トップス',
    season: '春',
    collaborator: '',
    commission_rate: 0.05,
    selling_price: 0,
    cost_price: 0,
    order_lot: null,
    sales_start_date: '',
    sales_end_date: '',
    lifecycle_stance: '助走期',
    operation_note: '',
    image_url: null,
    sku_images: [],
  }
}

export default function MasterPage() {
  // List state
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('全て')
  const [category, setCategory] = useState('全て')
  const [season, setSeason] = useState('全て')
  const [stance, setStance] = useState('全て')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ListResponse | null>(null)

  // Dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Partial<ProductMaster>>(emptyForm())
  const [isNew, setIsNew] = useState(true)
  const [saving, setSaving] = useState(false)

  // Image search state
  const [imageSearchOpen, setImageSearchOpen] = useState(false)
  const [imageKeyword, setImageKeyword] = useState('')
  const [imageResults, setImageResults] = useState<RakutenImageResult[]>([])
  const [imageSearching, setImageSearching] = useState(false)

  // Import state
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (brand !== '全て') params.set('brand', brand)
      if (category !== '全て') params.set('category', category)
      if (season !== '全て') params.set('season', season)
      if (stance !== '全て') params.set('stance', stance)
      params.set('page', String(page))
      params.set('per_page', '30')

      const res = await fetch(`/api/master?${params}`)
      if (res.ok) {
        setResult(await res.json())
      }
    } catch (e) {
      console.error('Failed to fetch master:', e)
    } finally {
      setLoading(false)
    }
  }, [search, brand, category, season, stance, page])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { setPage(1) }, [search, brand, category, season, stance])

  // Save item
  const handleSave = async () => {
    if (!editForm.product_code) return
    setSaving(true)
    try {
      const res = await fetch('/api/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        setEditOpen(false)
        fetchList()
      }
    } catch (e) {
      console.error('Save error:', e)
    } finally {
      setSaving(false)
    }
  }

  // Delete item
  const handleDelete = async (code: string) => {
    try {
      const res = await fetch(`/api/master?product_code=${encodeURIComponent(code)}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        fetchList()
      }
    } catch (e) {
      console.error('Delete error:', e)
    }
  }

  // Image search
  const handleImageSearch = async () => {
    if (!imageKeyword.trim()) return
    setImageSearching(true)
    try {
      const res = await fetch(`/api/master/rakuten-image?keyword=${encodeURIComponent(imageKeyword)}`)
      if (res.ok) {
        const data = await res.json()
        setImageResults(data.items || [])
      }
    } catch (e) {
      console.error('Image search error:', e)
    } finally {
      setImageSearching(false)
    }
  }

  // CSV Import
  const handleImport = async () => {
    if (!importText.trim()) return
    setImporting(true)
    try {
      const lines = importText.trim().split('\n')
      const headers = lines[0].split(',').map(h => h.trim())
      const items = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const obj: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          const key = csvHeaderMap[h] || h
          const val = vals[i] || ''
          if (['selling_price', 'cost_price', 'order_lot', 'commission_rate'].includes(key)) {
            obj[key] = val ? Number(val) : null
          } else {
            obj[key] = val || null
          }
        })
        return obj
      })

      const res = await fetch('/api/master', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(`${data.imported}件インポートしました`)
        setImportOpen(false)
        setImportText('')
        fetchList()
      }
    } catch (e) {
      console.error('Import error:', e)
    } finally {
      setImporting(false)
    }
  }

  // Export CSV
  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      params.set('per_page', '9999')
      if (brand !== '全て') params.set('brand', brand)
      if (category !== '全て') params.set('category', category)
      const res = await fetch(`/api/master?${params}`)
      if (!res.ok) return
      const data = await res.json()
      const headers = ['品番', '商品名', 'ブランド', 'カテゴリ', 'シーズン', 'コラボ', '紹介料', '販売価格', '原価', '発注ロット', '販売開始', '販売終了', 'スタンス', '運用メモ']
      const rows = data.data.map((item: ProductMaster) => [
        item.product_code, item.product_name, item.brand, item.category, item.season,
        item.collaborator || '', item.commission_rate, item.selling_price, item.cost_price,
        item.order_lot || '', item.sales_start_date || '', item.sales_end_date || '',
        item.lifecycle_stance, item.operation_note,
      ].join(','))
      const csv = [headers.join(','), ...rows].join('\n')
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `master_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export error:', e)
    }
  }

  // Open edit dialog
  const openNew = () => {
    setEditForm(emptyForm())
    setIsNew(true)
    setEditOpen(true)
  }

  const openEdit = (item: ProductMaster) => {
    setEditForm({ ...item })
    setIsNew(false)
    setEditOpen(true)
  }

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
      label: '品番',
      className: 'min-w-[140px]',
      render: (row) => (
        <div>
          <div className="font-mono text-sm font-medium">{row.product_code}</div>
          <div className="text-xs text-gray-400 truncate max-w-[160px]">{row.product_name}</div>
        </div>
      ),
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
      key: 'commission_rate',
      label: '紹介料',
      align: 'right',
      render: (row) => <span className="text-sm">{formatPercent(row.commission_rate, 0)}</span>,
    },
    {
      key: 'selling_price',
      label: '販売価格',
      align: 'right',
      render: (row) => <span className="text-sm">{formatCurrency(row.selling_price)}</span>,
    },
    {
      key: 'order_lot',
      label: 'ロット',
      align: 'right',
      render: (row) => <span className="text-sm">{row.order_lot || '-'}</span>,
    },
    {
      key: 'lifecycle_stance',
      label: 'スタンス',
      render: (row) => (
        <Badge className={`text-[11px] ${STANCE_COLORS[row.lifecycle_stance] || 'bg-gray-100'}`}>
          {row.lifecycle_stance}
        </Badge>
      ),
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
    {
      key: '_actions',
      label: '',
      className: 'w-[80px]',
      render: (row) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(row) }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row.product_code) }}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <Header title="マスタ管理" />
      <div className="p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="品番・商品名で検索"
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
            <Select value={stance} onValueChange={(v) => v && setStance(v)}>
              <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STANCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" />CSV出力
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-1" />一括取込
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1" />新規登録
            </Button>
          </div>
        </div>

        {/* Table */}
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
            pageSize={30}
            currentPage={result.page}
            totalItems={result.total}
            onPageChange={setPage}
            onRowClick={(row) => openEdit(row)}
          />
        ) : null}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? '新規マスタ登録' : `${editForm.product_code} の編集`}</DialogTitle>
            <DialogDescription>
              {isNew ? '品番マスタの新規登録' : '品番マスタの編集'}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">基本情報</TabsTrigger>
              <TabsTrigger value="pricing">価格・発注</TabsTrigger>
              <TabsTrigger value="image">画像</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">品番 *</label>
                  <Input
                    value={editForm.product_code || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, product_code: e.target.value }))}
                    disabled={!isNew}
                    placeholder="例: nltp001-2510"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">商品名</label>
                  <Input
                    value={editForm.product_name || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, product_name: e.target.value }))}
                    placeholder="リネンブレンドオーバーシャツ"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">ブランド</label>
                  <Select value={editForm.brand || 'NOAHL'} onValueChange={(v) => setEditForm(f => ({ ...f, brand: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['NOAHL', 'BLACKQUEEN', 'MYRTH'] as const).map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">カテゴリ</label>
                  <Select value={editForm.category || 'トップス'} onValueChange={(v) => setEditForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.filter(c => c !== '全て').map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">シーズン</label>
                  <Select value={editForm.season || '春'} onValueChange={(v) => setEditForm(f => ({ ...f, season: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEASON_OPTIONS.filter(s => s !== '全て').map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">コラボ</label>
                  <Input
                    value={editForm.collaborator || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, collaborator: e.target.value || null }))}
                    placeholder="例: cocoさん"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">スタンス</label>
                  <Select value={editForm.lifecycle_stance || '助走期'} onValueChange={(v) => setEditForm(f => ({ ...f, lifecycle_stance: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['助走期', '最盛期', '安定期', '衰退期'] as const).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">販売開始日</label>
                  <Input
                    type="date"
                    value={editForm.sales_start_date || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, sales_start_date: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">販売終了日</label>
                  <Input
                    type="date"
                    value={editForm.sales_end_date || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, sales_end_date: e.target.value || null }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">運用のポイント</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px]"
                  value={editForm.operation_note || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, operation_note: e.target.value }))}
                  placeholder="スタンスに応じた運用方針を記載"
                />
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="space-y-3 mt-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">販売価格</label>
                  <Input
                    type="number"
                    value={editForm.selling_price || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, selling_price: Number(e.target.value) }))}
                    placeholder="6990"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">原価</label>
                  <Input
                    type="number"
                    value={editForm.cost_price || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, cost_price: Number(e.target.value) }))}
                    placeholder="2800"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">楽天紹介料</label>
                  <Select
                    value={String(editForm.commission_rate || 0.05)}
                    onValueChange={(v) => setEditForm(f => ({ ...f, commission_rate: Number(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0.03, 0.05, 0.08, 0.10, 0.15].map(r => (
                        <SelectItem key={r} value={String(r)}>{formatPercent(r, 0)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {editForm.selling_price && editForm.cost_price ? (
                <div className="p-3 bg-gray-50 rounded-md text-sm">
                  <span className="text-gray-500">粗利率: </span>
                  <span className="font-medium">
                    {formatPercent((editForm.selling_price - editForm.cost_price) / editForm.selling_price)}
                  </span>
                  <span className="text-gray-500 ml-4">粗利額: </span>
                  <span className="font-medium">
                    {formatCurrency(editForm.selling_price - editForm.cost_price)}
                  </span>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">発注ロット</label>
                  <Input
                    type="number"
                    value={editForm.order_lot || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, order_lot: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="例: 100"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="image" className="space-y-3 mt-4">
              {/* Current image */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">現在の画像</label>
                {editForm.image_url ? (
                  <div className="flex items-start gap-3">
                    <img src={editForm.image_url} alt="" className="w-24 h-24 object-cover rounded border" />
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setEditForm(f => ({ ...f, image_url: null }))}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />削除
                    </Button>
                  </div>
                ) : (
                  <div className="w-24 h-24 bg-gray-100 rounded border flex items-center justify-center text-gray-400 text-xs">
                    未設定
                  </div>
                )}
              </div>

              {/* Manual URL input */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">画像URL直接入力</label>
                <Input
                  value={editForm.image_url || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, image_url: e.target.value || null }))}
                  placeholder="https://..."
                />
              </div>

              {/* Rakuten image search */}
              <div className="border-t pt-3">
                <label className="text-xs font-medium text-gray-500 mb-1 block">楽天画像検索</label>
                <div className="flex gap-2">
                  <Input
                    value={imageKeyword}
                    onChange={(e) => setImageKeyword(e.target.value)}
                    placeholder="商品名やキーワードで検索"
                    onKeyDown={(e) => e.key === 'Enter' && handleImageSearch()}
                  />
                  <Button variant="outline" onClick={handleImageSearch} disabled={imageSearching}>
                    <Search className="w-4 h-4 mr-1" />
                    {imageSearching ? '検索中...' : '検索'}
                  </Button>
                </div>
                {imageResults.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {imageResults.map((img, idx) => (
                      <button
                        key={idx}
                        className="border rounded p-1 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                        onClick={() => {
                          setEditForm(f => ({ ...f, image_url: img.image_url }))
                          setImageResults([])
                        }}
                      >
                        <img src={img.image_url} alt={img.item_name} className="w-full aspect-square object-cover rounded" />
                        <div className="text-[10px] text-gray-500 truncate mt-1">{img.item_name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.product_code}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>CSV一括取込</DialogTitle>
            <DialogDescription>
              CSVデータを貼り付けて一括登録できます
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded font-mono">
            品番,商品名,ブランド,カテゴリ,シーズン,販売価格,原価,発注ロット,スタンス
          </div>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[200px]"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="CSVデータを貼り付けてください..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>キャンセル</Button>
            <Button onClick={handleImport} disabled={importing || !importText.trim()}>
              <Upload className="w-4 h-4 mr-1" />
              {importing ? '取込中...' : '取込実行'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>削除確認</DialogTitle>
            <DialogDescription>
              品番 <strong>{deleteTarget}</strong> を削除しますか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)}>削除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image search dialog (standalone for non-edit contexts) */}
      <Dialog open={imageSearchOpen} onOpenChange={setImageSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>楽天画像検索</DialogTitle>
            <DialogDescription>商品名で楽天の商品画像を検索</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={imageKeyword}
              onChange={(e) => setImageKeyword(e.target.value)}
              placeholder="キーワード"
              onKeyDown={(e) => e.key === 'Enter' && handleImageSearch()}
            />
            <Button onClick={handleImageSearch} disabled={imageSearching}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          {imageResults.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              {imageResults.map((img, idx) => (
                <div key={idx} className="border rounded p-2">
                  <img src={img.image_url} alt={img.item_name} className="w-full aspect-square object-cover rounded" />
                  <div className="text-xs text-gray-600 truncate mt-1">{img.item_name}</div>
                  <div className="text-xs text-gray-400">{formatCurrency(img.price)}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// CSV header mapping
const csvHeaderMap: Record<string, string> = {
  '品番': 'product_code',
  '商品名': 'product_name',
  'ブランド': 'brand',
  'カテゴリ': 'category',
  'シーズン': 'season',
  'コラボ': 'collaborator',
  '紹介料': 'commission_rate',
  '販売価格': 'selling_price',
  '原価': 'cost_price',
  '発注ロット': 'order_lot',
  '販売開始': 'sales_start_date',
  '販売終了': 'sales_end_date',
  'スタンス': 'lifecycle_stance',
  '運用メモ': 'operation_note',
  'ロット': 'order_lot',
  'product_code': 'product_code',
  'product_name': 'product_name',
}
