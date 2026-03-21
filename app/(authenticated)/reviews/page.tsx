'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, RefreshCw, Download, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
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

const PAGE_SIZE = 50

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
  const [rematchLoading, setRematchLoading] = useState(false)
  const [rematchResult, setRematchResult] = useState<string | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(page * PAGE_SIZE))
      if (brand) params.set('brand', brand)
      if (search) params.set('search', search)
      if (typeFilter !== '全て') params.set('type', typeFilter)
      if (ratingFilter !== '全て') params.set('rating', ratingFilter)
      if (matchStatus !== '全て') params.set('match_status', matchStatus)

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
  }, [page, search, typeFilter, ratingFilter, matchStatus, brand])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  const handleRematch = async () => {
    setRematchLoading(true)
    setRematchResult(null)
    try {
      const res = await fetch('/api/reviews/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rematch' }),
      })
      const text = await res.text()
      try {
        const json = JSON.parse(text)
        setRematchResult(json.message || json.error || '完了')
      } catch {
        setRematchResult(`エラー: ${text.slice(0, 100)}`)
      }
      fetchReviews()
    } catch (e) {
      setRematchResult(`エラー: ${e}`)
    } finally {
      setRematchLoading(false)
    }
  }

  const handleImport = async () => {
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/reviews/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      })
      const text = await res.text()
      try {
        const json = JSON.parse(text)
        if (json.success) {
          setImportResult(`${json.inserted || 0}件インポート完了`)
          fetchReviews()
        } else {
          setImportResult(json.error || 'エラー')
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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const renderStars = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
        />
      ))}
    </div>
  )

  const headerTitle = brand ? `${getBrandDisplayName(brand)} レビュー管理` : 'レビュー管理'

  return (
    <>
      <Header title={headerTitle} />
      <div className="p-6 space-y-4">
        {/* Action buttons + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {importResult && (
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
                {importResult}
              </div>
            )}
            {rematchResult && (
              <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                {rematchResult}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImport}
              disabled={importLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {importLoading ? 'インポート中...' : 'CSVインポート'}
            </button>
            <button
              onClick={handleRematch}
              disabled={rematchLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[#2C2420] text-white rounded-md hover:bg-[#3d332d] transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${rematchLoading ? 'animate-spin' : ''}`} />
              {rematchLoading ? '処理中...' : '再マッチング'}
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="総レビュー数" value={summary.total_reviews.toLocaleString()} />
            <SummaryCard label="平均評価" value={String(summary.avg_rating)} icon={<Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />} />
            <SummaryCard label="商品レビュー" value={summary.product_reviews.toLocaleString()} />
            <SummaryCard label="ショップレビュー" value={summary.shop_reviews.toLocaleString()} />
            <SummaryCard label="品番マッチ済" value={summary.matched_count.toLocaleString()} valueColor="text-green-600" />
            <SummaryCard label="未マッチ" value={summary.unmatched_count.toLocaleString()} valueColor="text-orange-500" />
          </div>
        )}

        {/* Filters */}
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
          <Select value={ratingFilter} onValueChange={v => { setRatingFilter(v); setPage(0) }}>
            <SelectTrigger className="w-32 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="全て">評価: 全て</SelectItem>
              <SelectItem value="5">★★★★★</SelectItem>
              <SelectItem value="4">★★★★☆</SelectItem>
              <SelectItem value="3">★★★☆☆</SelectItem>
              <SelectItem value="2">★★☆☆☆</SelectItem>
              <SelectItem value="1">★☆☆☆☆</SelectItem>
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
        </div>

        {/* Review list */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-sm">レビューがありません</p>
              <p className="text-xs mt-1">CSVインポートでレビューを取り込んでください</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reviews.map((review, i) => (
                <div key={i} className="px-5 py-4 hover:bg-gray-50/50 transition">
                  {/* Rating + type + date */}
                  <div className="flex items-center gap-3 mb-1.5">
                    {renderStars(review.rating)}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      review.review_type === '商品レビュー'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-purple-50 text-purple-600'
                    }`}>
                      {review.review_type}
                    </span>
                    <span className="text-xs text-gray-400">{review.posted_at}</span>
                  </div>

                  {/* Title */}
                  {review.title && (
                    <h3 className="text-sm font-medium text-gray-800 mb-1">{review.title}</h3>
                  )}

                  {/* Body */}
                  <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                    {review.review_body || '（本文なし）'}
                  </p>

                  {/* Product info */}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 truncate max-w-[400px]" title={review.product_name}>
                      {review.product_name}
                    </span>
                    {review.matched_product_code ? (
                      <span className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[11px] font-medium">
                        {review.matched_product_code}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-[11px] font-medium">
                        未マッチ
                      </span>
                    )}
                    {review.review_url && (
                      <a
                        href={review.review_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600 hover:underline"
                      >
                        楽天で見る
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <span className="text-xs text-gray-500">
                全{total.toLocaleString()}件中 {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)}件
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <span className="text-sm text-gray-600">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SummaryCard({ label, value, icon, valueColor }: {
  label: string
  value: string
  icon?: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-semibold flex items-center gap-1.5 ${valueColor || 'text-gray-800'}`}>
        {value}
        {icon}
      </div>
    </div>
  )
}
