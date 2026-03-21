'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Star, RefreshCw, Download, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import ProductImage from '@/components/ui/product-image'
import ProductDetailDialog from '@/components/products/ProductDetailDialog'
import { getBrandDisplayName } from '@/lib/constants'

interface Review {
  review_type: string
  product_name: string
  review_url: string
  rating: number
  posted_at: string
  title: string
  review_body: string
  flag: number
  order_number: string
  unhandled_flag: number
  matched_product_code: string | null
  review_source: string | null
  image_url: string | null
}

interface Summary {
  total_reviews: number
  product_reviews: number
  shop_reviews: number
  avg_rating: number
  positive_count: number
  negative_count: number
  matched_count: number
  unmatched_count: number
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function ReviewsPage() {
  return (
    <Suspense>
      <ReviewsContent />
    </Suspense>
  )
}

function ReviewsContent() {
  const searchParams = useSearchParams()
  const brand = searchParams.get('brand') || ''

  const [reviews, setReviews] = useState<Review[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('全て')
  const [ratingFilter, setRatingFilter] = useState('全て')
  const [matchStatus, setMatchStatus] = useState('全て')
  const [sourceFilter, setSourceFilter] = useState('全て')
  const [rematchLoading, setRematchLoading] = useState(false)
  const [rematchResult, setRematchResult] = useState<string | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(50)
  const [dialogProductCode, setDialogProductCode] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))
      if (brand) params.set('brand', brand)
      if (search) params.set('search', search)
      if (typeFilter !== '全て') params.set('type', typeFilter)
      if (ratingFilter !== '全て') params.set('rating', ratingFilter)
      if (matchStatus !== '全て') params.set('match_status', matchStatus)
      if (sourceFilter !== '全て') params.set('source', sourceFilter)

      const res = await fetch(`/api/reviews?${params}`)
      const json = await res.json()
      setReviews(json.data || [])
      setSummary(json.summary || null)
      setTotal(json.total || 0)
    } catch {
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, typeFilter, ratingFilter, matchStatus, sourceFilter, brand])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  const handleRematch = async () => {
    setRematchLoading(true)
    setRematchResult(null)
    let round = 0
    let hasMore = true

    while (hasMore) {
      round++
      try {
        const res = await fetch('/api/reviews/mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rematch' }),
        })
        const text = await res.text()
        try {
          const json = JSON.parse(text)
          const msg = json.message || json.error || '完了'
          hasMore = msg.includes('もう一度実行')
          if (hasMore) {
            setRematchResult(`処理中... ${round}回目完了（${json.scraped || 0}件取得）`)
          } else {
            setRematchResult(msg)
          }
        } catch {
          setRematchResult(`エラー: ${text.slice(0, 100)}`)
          hasMore = false
        }
      } catch (e) {
        setRematchResult(`エラー: ${e}`)
        hasMore = false
      }
    }

    fetchReviews()
    setRematchLoading(false)
  }

  const handleImport = async (reprocess = false) => {
    if (reprocess && !confirm('既存レビューを全削除して再取り込みします。よろしいですか？')) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, reprocess }),
      })
      const text = await res.text()
      try {
        const json = JSON.parse(text)
        if (json.success) {
          const parts: string[] = []
          if (json.imported > 0) {
            parts.push(`${json.imported}件インポート完了`)
            if (json.official_reviews) parts.push(`(公式: ${json.official_reviews}件)`)
          } else {
            parts.push(json.message || '新規レビューなし')
          }
          if (json.skipped_duplicates) parts.push(`重複スキップ: ${json.skipped_duplicates}件`)
          if (json.files_processed) parts.push(`ファイル: ${json.files_processed.join(', ')}`)
          setImportResult(parts.join(' / '))
          fetchReviews()
        } else {
          setImportResult(json.error || json.message || 'エラー')
        }
      } catch {
        setImportResult(`エラー: ${text.slice(0, 100)}`)
      }
    } catch (e) {
      setImportResult(`エラー: ${e}`)
    } finally {
      setImportLoading(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const headerTitle = brand ? `${getBrandDisplayName(brand)} レビュー管理` : 'レビュー管理'

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-200'}`}
        />
      ))}
    </div>
  )

  return (
    <>
      <Header title={headerTitle}>
        {(importResult || rematchResult) && (
          <span className="text-xs text-gray-500 max-w-[300px] truncate">
            {importResult || rematchResult}
          </span>
        )}
        <button
          onClick={() => handleImport(false)}
          disabled={importLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {importLoading ? '処理中...' : 'インポート'}
        </button>
<button
          onClick={handleRematch}
          disabled={rematchLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#2C2420] text-white rounded-md hover:bg-[#3d332d] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${rematchLoading ? 'animate-spin' : ''}`} />
          {rematchLoading ? '処理中...' : '再マッチング'}
        </button>
      </Header>
      <div className="p-6 pb-0 space-y-4 flex flex-col h-[calc(100vh-4rem)]">
        {/* Summary row */}
        {summary && (
          <div className="grid grid-cols-6 gap-3">
            <StatCard label="総レビュー数" value={summary.total_reviews.toLocaleString()} />
            <StatCard label="平均評価" value={String(summary.avg_rating)}>
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 ml-1" />
            </StatCard>
            <StatCard label="商品レビュー" value={summary.product_reviews.toLocaleString()} />
            <StatCard label="ショップレビュー" value={summary.shop_reviews.toLocaleString()} />
            <StatCard label="マッチ済" value={summary.matched_count.toLocaleString()} color="text-green-600" />
            <StatCard label="未マッチ" value={summary.unmatched_count.toLocaleString()} color="text-orange-500" />
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="商品名・品番・レビュー内容で検索"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="w-72 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(0) }}>
            <SelectTrigger className="w-40 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="全て">タイプ: 全て</SelectItem>
              <SelectItem value="商品レビュー">商品レビュー</SelectItem>
              <SelectItem value="ショップレビュー">ショップレビュー</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={v => { setSourceFilter(v); setPage(0) }}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="全て">ソース: 全て</SelectItem>
              <SelectItem value="楽天">楽天</SelectItem>
              <SelectItem value="公式">公式</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ratingFilter} onValueChange={v => { setRatingFilter(v); setPage(0) }}>
            <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="全て">評価: 全て</SelectItem>
              <SelectItem value="5">★5</SelectItem>
              <SelectItem value="4">★4</SelectItem>
              <SelectItem value="3">★3</SelectItem>
              <SelectItem value="2">★2</SelectItem>
              <SelectItem value="1">★1</SelectItem>
            </SelectContent>
          </Select>
          <Select value={matchStatus} onValueChange={v => { setMatchStatus(v); setPage(0) }}>
            <SelectTrigger className="w-36 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="全て">ステータス: 全て</SelectItem>
              <SelectItem value="matched">マッチ済</SelectItem>
              <SelectItem value="unmatched">未マッチ</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0) }}>
              <SelectTrigger className="w-28 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}件表示</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-sm">レビューがありません</p>
              <p className="text-xs mt-1">CSVインポートでレビューを取り込んでください</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="w-[220px] text-xs px-2">商品</TableHead>
                  <TableHead className="w-[150px] text-xs px-2">評価</TableHead>
                  <TableHead className="text-xs px-2">レビュー内容</TableHead>
                  <TableHead className="w-[30px] text-xs px-1"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review, i) => (
                  <TableRow key={i} className="hover:bg-gray-50/50">
                    <TableCell className="py-2 px-2 align-top">
                      {review.matched_product_code ? (
                        <button
                          onClick={() => setDialogProductCode(review.matched_product_code)}
                          className="flex items-center gap-2 text-left hover:bg-gray-50 rounded p-1 -m-1 transition group w-full"
                        >
                          {review.image_url ? (
                            <ProductImage src={review.image_url} alt="" size={36} className="rounded flex-shrink-0" />
                          ) : (
                            <div className="w-9 h-9 bg-gray-100 rounded flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] text-gray-500 line-clamp-1 group-hover:text-gray-700" title={review.product_name}>
                              {review.product_name}
                            </div>
                            <span className="text-[10px] px-1 py-0.5 bg-green-50 text-green-700 rounded font-medium">
                              {review.matched_product_code}
                            </span>
                          </div>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 p-1 -m-1">
                          <div className="w-9 h-9 bg-gray-100 rounded flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] text-gray-500 line-clamp-1" title={review.product_name}>
                              {review.product_name}
                            </div>
                            {review.review_type === '商品レビュー' && (
                              <span className="text-[10px] px-1 py-0.5 bg-orange-50 text-orange-500 rounded font-medium">
                                未マッチ
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2 align-top">
                      <div className="flex items-center gap-1">
                        {renderStars(review.rating)}
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium whitespace-nowrap ${
                          review.review_source === '公式'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-red-50 text-red-600'
                        }`}>{review.review_source || '楽天'}</span>
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium whitespace-nowrap ${
                          review.review_type === '商品レビュー'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          {review.review_type === '商品レビュー' ? '商品' : 'ショップ'}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{review.posted_at}</div>
                    </TableCell>
                    <TableCell className="py-2 px-2 align-top">
                      {review.title && (
                        <div className="text-sm font-medium text-gray-800 line-clamp-1">{review.title}</div>
                      )}
                      <div className="text-xs text-gray-400 line-clamp-2">
                        {review.review_body || '（本文なし）'}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-1">
                      {review.review_url && (
                        <a
                          href={review.review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-blue-500 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-gray-500">
              全{total.toLocaleString()}件中 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)}件
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs text-gray-500 min-w-[60px] text-center">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {dialogProductCode && (
        <ProductDetailDialog
          open={!!dialogProductCode}
          onClose={() => setDialogProductCode(null)}
          mode="product"
          productCode={dialogProductCode}
        />
      )}
    </>
  )
}

function StatCard({ label, value, color, children }: {
  label: string; value: string; color?: string; children?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className={`text-lg font-semibold flex items-center ${color || 'text-gray-800'}`}>
        {value}{children}
      </div>
    </div>
  )
}
