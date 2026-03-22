'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import FilterBar from '@/components/filters/FilterBar'
import GroupTabs from '@/components/layout/GroupTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatNumber, formatPercent, getCurrentMonth } from '@/lib/format'
import { getCached, setCache, isFresh } from '@/lib/client-cache'
import { ShoppingCart, ArrowRight, BarChart3 } from 'lucide-react'
import ProductImage from '@/components/ui/product-image'

interface Pair { product_a: string; product_a_name: string; product_b: string; product_b_name: string; pair_count: number; support: number; confidence_a_to_b: number; confidence_b_to_a: number }
interface BasketSize { items_in_order: number; order_count: number; avg_revenue: number }
interface ProductInfo { brand?: string; category?: string; season?: string; selling_price?: number; image_url?: string; product_name?: string }

function BasketContent() {
  const searchParams = useSearchParams()
  const urlBrand = searchParams.get('brand')
  const [month, setMonth] = useState(getCurrentMonth())
  const brand = urlBrand || '全て'
  const brandParam = brand === '全て' ? '' : brand
  const cacheKey = `basket-v1:${month}:${brandParam}`

  const cached = getCached<{ pairs: Pair[]; basketSize: BasketSize[] }>(cacheKey)
  const [pairs, setPairs] = useState<Pair[]>(cached?.pairs ?? [])
  const [basketSize, setBasketSize] = useState<BasketSize[]>(cached?.basketSize ?? [])
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const fetchData = useCallback(async () => {
    if (isFresh(cacheKey)) return
    if (!getCached(cacheKey)) setLoading(true)
    try {
      const bParam = brandParam ? `&brand=${brandParam}` : ''
      const res = await fetch(`/api/basket-analysis?month=${month}${bParam}`)
      const data = res.ok ? await res.json() : null
      if (mountedRef.current && data) {
        setPairs(Array.isArray(data.pairs) ? data.pairs : [])
        setBasketSize(Array.isArray(data.basketSize) ? data.basketSize : [])
        setCache(cacheKey, data)
      }
    } catch { /* ignore */ } finally { if (mountedRef.current) setLoading(false) }
  }, [month, brandParam, cacheKey])

  useEffect(() => { fetchData() }, [fetchData])

  const [selectedProduct, setSelectedProduct] = useState<{ code: string; name: string } | null>(null)
  const [productDetail, setProductDetail] = useState<ProductInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const showProductDetail = async (code: string, name: string) => {
    setSelectedProduct({ code, name })
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(code)}`)
      const data = res.ok ? await res.json() : null
      setProductDetail(data)
    } catch { setProductDetail(null) } finally { setDetailLoading(false) }
  }

  const maxPairCount = Math.max(...pairs.map(p => Number(p.pair_count) || 0), 1)
  const totalOrders = basketSize.reduce((s, b) => s + (Number(b.order_count) || 0), 0)
  const maxBasketOrders = Math.max(...basketSize.map(b => Number(b.order_count) || 0), 1)

  const ProductLink = ({ code, name }: { code: string; name: string }) => (
    <button
      onClick={() => showProductDetail(code, name)}
      className="text-left font-medium text-[#3D352F] hover:text-[#C4A882] hover:underline cursor-pointer truncate transition-colors"
      title={name || code}
    >
      {name || code}
    </button>
  )

  return (
    <>
      <Header title="バスケット分析" subtitle="併売パターン・セット購入の発見" />
      <div className="p-8 space-y-6">
        <FilterBar month={month} onMonthChange={setMonth} brand={brand} onBrandChange={() => {}} hideBrand={!!urlBrand} />
        <GroupTabs />

        {loading ? (
          <div className="grid grid-cols-2 gap-6"><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-64 rounded-lg" /></div>
        ) : (
          <>
            {/* KPI Summary */}
            {(() => {
              const avgBasketSize = totalOrders > 0
                ? basketSize.reduce((s, b) => s + (Number(b.items_in_order) || 0) * (Number(b.order_count) || 0), 0) / totalOrders
                : 0
              const multiItem = basketSize.filter(b => Number(b.items_in_order) >= 2)
              const multiOrders = multiItem.reduce((s, b) => s + (Number(b.order_count) || 0), 0)
              const multiRate = totalOrders > 0 ? multiOrders / totalOrders : 0
              return (
                <div className="grid grid-cols-4 gap-4">
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">合計注文数</div>
                      <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(totalOrders)}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">平均バスケットサイズ</div>
                      <div className="text-3xl font-bold text-indigo-600 tabular-nums mt-2">{avgBasketSize.toFixed(1)}点</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">複数購入率</div>
                      <div className="text-3xl font-bold text-emerald-600 tabular-nums mt-2">{formatPercent(multiRate)}</div>
                      <div className="text-[11px] text-gray-400 mt-1">{formatNumber(multiOrders)}件</div>
                    </CardContent>
                  </Card>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-5">
                      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">併売ペア数</div>
                      <div className="text-3xl font-bold text-[#3D352F] tabular-nums mt-2">{formatNumber(pairs.length)}</div>
                      <div className="text-[11px] text-gray-400 mt-1">検出された組合せ</div>
                    </CardContent>
                  </Card>
                </div>
              )
            })()}

            <div className="grid grid-cols-2 gap-6">
              {/* Basket size */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" />注文あたり商品数の分布
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {basketSize.map(b => {
                      const count = Number(b.order_count) || 0
                      const label = Number(b.items_in_order) >= 5 ? '5点以上' : `${b.items_in_order}点`
                      return (
                        <div key={b.items_in_order} className="flex items-center gap-3">
                          <span className="text-[12px] font-medium text-[#3D352F] w-12">{label}</span>
                          <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                            <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-lg transition-all" style={{ width: `${(count / maxBasketOrders) * 100}%` }} />
                            <span className="absolute inset-0 flex items-center px-3 text-[10px] font-bold text-white mix-blend-difference">
                              {formatNumber(count)}件 ({totalOrders > 0 ? formatPercent(count / totalOrders) : '-'})
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 w-20 text-right">平均 {formatCurrency(Number(b.avg_revenue) || 0)}</span>
                        </div>
                      )
                    })}
                  </div>
                  {basketSize.length > 0 && (() => {
                    const multiItem = basketSize.filter(b => Number(b.items_in_order) >= 2)
                    const multiOrders = multiItem.reduce((s, b) => s + (Number(b.order_count) || 0), 0)
                    return (
                      <div className="mt-4 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100/60 text-[11px] text-indigo-800">
                        2点以上同時購入: <span className="font-bold">{formatNumber(multiOrders)}件</span>
                        {totalOrders > 0 && <span> ({formatPercent(multiOrders / totalOrders)})</span>}
                        {' '}— セット提案でアップセルの余地あり
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* Top pairs summary */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F] flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-emerald-500" />よく一緒に購入される組合せ TOP5
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pairs.slice(0, 5).map((p, i) => (
                    <div key={i} className="p-3 rounded-xl border border-gray-100/60 bg-gradient-to-r from-gray-50/50 to-white">
                      <div className="flex items-center gap-2 text-[12px]">
                        <div className="flex-1 min-w-0"><ProductLink code={p.product_a} name={p.product_a_name || p.product_a} /></div>
                        <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0 text-right"><ProductLink code={p.product_b} name={p.product_b_name || p.product_b} /></div>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                        <span>同時購入 <span className="font-bold text-[#3D352F]">{Number(p.pair_count) || 0}回</span></span>
                        <span>確信度 <span className="font-bold text-emerald-600">{formatPercent(Number(p.confidence_a_to_b) || 0)}</span></span>
                      </div>
                    </div>
                  ))}
                  {pairs.length === 0 && <div className="text-center text-gray-400 text-sm py-8">併売データがありません</div>}
                </CardContent>
              </Card>
            </div>

            {/* Full pairs table */}
            {pairs.length > 5 && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-[#3D352F]">全併売ペア一覧</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto border border-black/[0.06] rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                          <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-[#8A7D72] w-8">#</th>
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">商品A</th>
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">商品B</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">同時購入数</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">支持度</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">A→B確信度</th>
                          <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72]">B→A確信度</th>
                          <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#8A7D72] w-28">強度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairs.map((p, i) => (
                          <tr key={i} className={`border-b border-black/[0.04] ${i % 2 === 1 ? 'bg-[#FDFCFB]' : ''}`}>
                            <td className="px-2 py-2 text-center text-[11px] text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 text-[11px] max-w-[200px]"><ProductLink code={p.product_a} name={p.product_a_name || p.product_a} /></td>
                            <td className="px-3 py-2 text-[11px] max-w-[200px]"><ProductLink code={p.product_b} name={p.product_b_name || p.product_b} /></td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-[#3D352F]">{Number(p.pair_count) || 0}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] text-[#5A524B]">{formatPercent(Number(p.support) || 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] text-emerald-600 font-medium">{formatPercent(Number(p.confidence_a_to_b) || 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] text-emerald-600 font-medium">{formatPercent(Number(p.confidence_b_to_a) || 0)}</td>
                            <td className="px-3 py-2">
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${((Number(p.pair_count) || 0) / maxPairCount) * 100}%` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Product Detail Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setProductDetail(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-bold text-[#3D352F]">商品詳細</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : selectedProduct && (
            <div className="space-y-4">
              {productDetail && productDetail.image_url && (
                <div className="flex justify-center">
                  <ProductImage src={productDetail.image_url} alt={selectedProduct.name} className="w-32 h-32 rounded-lg object-cover" />
                </div>
              )}
              <div>
                <div className="text-[14px] font-bold text-[#3D352F] leading-relaxed">{selectedProduct.name}</div>
                <div className="text-[11px] text-gray-400 mt-1">{selectedProduct.code}</div>
              </div>
              {productDetail && (
                <div className="grid grid-cols-2 gap-3">
                  {productDetail.brand && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-500">ブランド</div>
                      <div className="text-[13px] font-medium text-[#3D352F]">{productDetail.brand}</div>
                    </div>
                  )}
                  {productDetail.category && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-500">カテゴリ</div>
                      <div className="text-[13px] font-medium text-[#3D352F]">{productDetail.category}</div>
                    </div>
                  )}
                  {productDetail.selling_price != null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-500">販売価格</div>
                      <div className="text-[13px] font-bold text-[#3D352F]">{formatCurrency(Number(productDetail.selling_price) || 0)}</div>
                    </div>
                  )}
                  {productDetail.season && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-[10px] text-gray-500">シーズン</div>
                      <div className="text-[13px] font-medium text-[#3D352F]">{productDetail.season}</div>
                    </div>
                  )}
                </div>
              )}
              {!productDetail && (
                <div className="text-center text-gray-400 text-sm py-4">商品マスタに登録されていません</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function BasketAnalysisPage() {
  return <Suspense><BasketContent /></Suspense>
}
