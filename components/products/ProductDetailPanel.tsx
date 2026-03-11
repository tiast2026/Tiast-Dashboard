'use client'

import { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/format'
import SeasonForecast from './SeasonForecast'
import DiscountTable from './DiscountTable'
import LifecycleBadge from './LifecycleBadge'

interface InventoryItem {
  goods_id: string
  goods_name: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  sales_1day: number
  sales_7days: number
  sales_30days: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  is_overstock: boolean
  is_stockout: boolean
  reorder_judgment: string
  recommended_discount: string | null
  selling_price: number
  cost_price: number
}

interface MdItem {
  goods_id: string
  goods_name: string
  lifecycle_stance: string
  turnover_rate_annual: number
  turnover_days: number
  last_io_date: string | null
  days_since_last_io: number
  stagnation_alert: string | null
  lifecycle_action: string | null
  inventory_status: string
}

interface ProductDetail {
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  price_tier: string
  selling_price: number
  cost_price: number
  sku_count: number
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null
  total_quantity: number
  order_count: number
  sales_amount: number
  gross_profit: number
  gross_profit_rate: number
  inventory: InventoryItem[]
  md_analysis: MdItem[]
}

interface ProductDetailPanelProps {
  productCode: string | null
  onClose: () => void
}

export default function ProductDetailPanel({ productCode, onClose }: ProductDetailPanelProps) {
  const [data, setData] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productCode) {
      setData(null)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch(`/api/products/${encodeURIComponent(productCode)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [productCode])

  return (
    <Sheet open={!!productCode} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{data?.product_name || '商品詳細'}</SheetTitle>
          <SheetDescription>{data?.product_code || ''}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data ? (
          <div className="p-4 space-y-6">
            {/* Section A: Basic Info */}
            <div className="flex gap-4">
              {data.image_url ? (
                <img
                  src={data.image_url}
                  alt={data.product_name}
                  className="w-24 h-24 object-cover rounded-lg border"
                />
              ) : (
                <div className="w-24 h-24 bg-gray-100 rounded-lg border flex items-center justify-center text-gray-400 text-xs">
                  No Image
                </div>
              )}
              <div className="flex-1 space-y-1">
                <h3 className="font-semibold text-lg">{data.product_name}</h3>
                <div className="flex gap-2 flex-wrap text-xs text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{data.brand}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{data.category}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded">{data.season}</span>
                  {data.price_tier && (
                    <span className="bg-gray-100 px-2 py-0.5 rounded">{data.price_tier}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  SKU数: {data.sku_count} / 販売期間: {formatDate(data.sales_start_date)} ~ {formatDate(data.sales_end_date)}
                </div>
              </div>
            </div>

            {/* Section B: Sales Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="px-3 py-2">
                  <p className="text-xs text-gray-500">売上金額</p>
                  <p className="text-base font-semibold">{formatCurrency(data.sales_amount)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3 py-2">
                  <p className="text-xs text-gray-500">販売数量</p>
                  <p className="text-base font-semibold">{formatNumber(data.total_quantity)}点</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3 py-2">
                  <p className="text-xs text-gray-500">受注件数</p>
                  <p className="text-base font-semibold">{formatNumber(data.order_count)}件</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3 py-2">
                  <p className="text-xs text-gray-500">粗利率</p>
                  <p className="text-base font-semibold">{formatPercent(data.gross_profit_rate)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Section C: Inventory Breakdown */}
            {data.inventory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SKU別在庫</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-600">SKU</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">総在庫</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">フリー</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">ZOZO</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">自社</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">日販</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">在庫日数</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.inventory.map((item) => (
                          <TableRow key={item.goods_id}>
                            <TableCell className="text-xs">
                              <div className="max-w-[160px] truncate" title={item.goods_name}>
                                {item.goods_name}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(item.total_stock)}</TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(item.free_stock)}</TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(item.zozo_stock)}</TableCell>
                            <TableCell className="text-xs text-right">{formatNumber(item.own_stock)}</TableCell>
                            <TableCell className="text-xs text-right">{item.daily_sales.toFixed(1)}</TableCell>
                            <TableCell className="text-xs text-right">
                              {item.stock_days > 0 ? `${Math.round(item.stock_days)}日` : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Section D: Season Forecast */}
            {data.inventory.length > 0 && <SeasonForecast inventory={data.inventory} />}

            {/* Section E: Discount Table */}
            <DiscountTable selling_price={data.selling_price} cost_price={data.cost_price} />

            {/* Section F: MD Analysis */}
            {data.md_analysis.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">MD分析</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-semibold text-gray-600">SKU</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">ライフサイクル</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">回転率(年)</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600 text-right">回転日数</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">滞留アラート</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-600">アクション</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.md_analysis.map((item) => (
                          <TableRow key={item.goods_id}>
                            <TableCell className="text-xs">
                              <div className="max-w-[140px] truncate" title={item.goods_name}>
                                {item.goods_name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <LifecycleBadge stage={item.lifecycle_stance} />
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.turnover_rate_annual.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {Math.round(item.turnover_days)}日
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.stagnation_alert ? (
                                <span className="text-red-600 font-medium">{item.stagnation_alert}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{item.lifecycle_action || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">商品が見つかりません</div>
        )}
      </SheetContent>
    </Sheet>
  )
}
