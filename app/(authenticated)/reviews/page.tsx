'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Star, RefreshCw, Download, Filter, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'

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
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [matchStatus, setMatchStatus] = useState('')
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
      if (typeFilter) params.set('type', typeFilter)
      if (ratingFilter) params.set('rating', ratingFilter)
      if (matchStatus) params.set('match_status', matchStatus)

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

  const handleSearch = () => {
    setPage(0)
    setSearch(searchInput)
  }

  const handleRematch = async () => {
    setRematchLoading(true)
    setRematchResult(null)
    try {
      const res = await fetch('/api/reviews/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rematch' }),
      })
      const json = await res.json()
      setRematchResult(json.message || 'completed')
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
      const json = await res.json()
      if (json.success) {
        setImportResult(`${json.inserted || 0}件インポート完了`)
        fetchReviews()
      } else {
        setImportResult(json.error || 'エラー')
      }
    } catch (e) {
      setImportResult(`エラー: ${e}`)
    } finally {
      setImportLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}`}
      />
    ))
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-[#C4A882]" />
          <h1 className="text-xl font-bold">{brand || 'TIAST'} レビュー管理</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={importLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#333] rounded-lg text-sm border border-white/10 transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {importLoading ? 'インポート中...' : 'CSVインポート'}
          </button>
          <button
            onClick={handleRematch}
            disabled={rematchLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#C4A882] hover:bg-[#b89a74] text-black rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${rematchLoading ? 'animate-spin' : ''}`} />
            {rematchLoading ? '処理中...' : '再マッチング'}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {importResult && (
        <div className="mb-4 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
          {importResult}
        </div>
      )}
      {rematchResult && (
        <div className="mb-4 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-300">
          {rematchResult}
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">総レビュー数</div>
            <div className="text-lg font-bold">{summary.total_reviews.toLocaleString()}</div>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">平均評価</div>
            <div className="text-lg font-bold flex items-center gap-1">
              {summary.avg_rating}
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            </div>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">商品レビュー</div>
            <div className="text-lg font-bold">{summary.product_reviews.toLocaleString()}</div>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">ショップレビュー</div>
            <div className="text-lg font-bold">{summary.shop_reviews.toLocaleString()}</div>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">品番マッチ済</div>
            <div className="text-lg font-bold text-green-400">{summary.matched_count.toLocaleString()}</div>
          </div>
          <div className="bg-[#2a2a2a] rounded-lg p-3 border border-white/5">
            <div className="text-xs text-[#A99D93] mb-1">未マッチ</div>
            <div className="text-lg font-bold text-orange-400">{summary.unmatched_count.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A99D93]" />
            <input
              type="text"
              placeholder="商品名・品番・レビュー内容で検索..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-3 py-2 bg-[#2a2a2a] border border-white/10 rounded-lg text-sm text-white placeholder-[#A99D93] focus:outline-none focus:border-[#C4A882]/50"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] rounded-lg text-sm border border-white/10"
          >
            検索
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#A99D93]" />
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(0) }}
            className="bg-[#2a2a2a] border border-white/10 rounded-lg text-sm px-3 py-2 text-white focus:outline-none"
          >
            <option value="">全タイプ</option>
            <option value="商品レビュー">商品レビュー</option>
            <option value="ショップレビュー">ショップレビュー</option>
          </select>

          <select
            value={ratingFilter}
            onChange={e => { setRatingFilter(e.target.value); setPage(0) }}
            className="bg-[#2a2a2a] border border-white/10 rounded-lg text-sm px-3 py-2 text-white focus:outline-none"
          >
            <option value="">全評価</option>
            <option value="5">★5</option>
            <option value="4">★4</option>
            <option value="3">★3</option>
            <option value="2">★2</option>
            <option value="1">★1</option>
          </select>

          <select
            value={matchStatus}
            onChange={e => { setMatchStatus(e.target.value); setPage(0) }}
            className="bg-[#2a2a2a] border border-white/10 rounded-lg text-sm px-3 py-2 text-white focus:outline-none"
          >
            <option value="">全ステータス</option>
            <option value="matched">マッチ済</option>
            <option value="unmatched">未マッチ</option>
          </select>
        </div>
      </div>

      {/* Review list */}
      <div className="bg-[#2a2a2a] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#A99D93]">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            読み込み中...
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#A99D93]">
            <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
            <p>レビューがありません</p>
            <p className="text-xs mt-1">CSVインポートでレビューを取り込んでください</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {reviews.map((review, i) => (
              <div key={i} className="p-4 hover:bg-white/3 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Top row: rating + type + date */}
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="flex items-center gap-0.5">
                        {renderStars(review.rating)}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        review.review_type === '商品レビュー'
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-purple-500/15 text-purple-300'
                      }`}>
                        {review.review_type}
                      </span>
                      <span className="text-xs text-[#A99D93]">{review.posted_at}</span>
                    </div>

                    {/* Title */}
                    {review.title && (
                      <h3 className="text-sm font-medium mb-1 truncate">{review.title}</h3>
                    )}

                    {/* Body */}
                    <p className="text-xs text-[#A99D93] line-clamp-2 mb-2">
                      {review.review_body || '（本文なし）'}
                    </p>

                    {/* Product info */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#A99D93] truncate max-w-[300px]" title={review.product_name}>
                        {review.product_name}
                      </span>
                      {review.matched_product_code ? (
                        <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs">
                          {review.matched_product_code}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded text-xs">
                          未マッチ
                        </span>
                      )}
                      {review.review_url && (
                        <a
                          href={review.review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#C4A882] hover:underline"
                        >
                          楽天で見る
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-[#A99D93]">
              {total.toLocaleString()}件中 {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)}件
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-[#A99D93]">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
