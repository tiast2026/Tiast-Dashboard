'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

interface InventoryItem {
  total_stock: number
  daily_sales: number
  season_remaining_days: number
  selling_price: number
  cost_price: number
}

interface SeasonForecastProps {
  inventory: InventoryItem[]
}

function getStatus(
  remainingDays: number,
  currentDailySales: number,
  remainingStock: number,
  salesRatio: number
): { label: string; color: string } {
  if (remainingDays <= 0) {
    return { label: 'シーズン終了', color: '#6B7280' }
  }
  if (currentDailySales === 0 && remainingStock > 0) {
    return { label: '販売停滞', color: '#EF4444' }
  }
  if (salesRatio <= 1.0) {
    return { label: '順調（現ペースで売り切れる）', color: '#22C55E' }
  }
  if (salesRatio <= 1.5) {
    return { label: 'やや注意（1.5倍の速度が必要）', color: '#EAB308' }
  }
  if (salesRatio <= 2.0) {
    return { label: '要値引き（2倍の速度が必要）', color: '#F97316' }
  }
  return { label: '緊急（大量在庫残のリスク）', color: '#EF4444' }
}

export default function SeasonForecast({ inventory }: SeasonForecastProps) {
  if (!inventory || inventory.length === 0) return null

  const remainingStock = inventory.reduce((sum, item) => sum + item.total_stock, 0)
  const remainingDays = Math.max(...inventory.map((item) => item.season_remaining_days))
  const currentDailySales = inventory.reduce((sum, item) => sum + item.daily_sales, 0)
  const neededDailySales = remainingDays > 0 ? remainingStock / remainingDays : 0
  const salesRatio = currentDailySales > 0 ? neededDailySales / currentDailySales : Infinity
  const expectedRemaining = remainingStock - currentDailySales * remainingDays

  const status = getStatus(remainingDays, currentDailySales, remainingStock, salesRatio)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">シーズン消化予測</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: status.color }}
            >
              {status.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">シーズン残日数</p>
              <p className="text-lg font-semibold">{remainingDays > 0 ? `${remainingDays}日` : '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">残在庫数</p>
              <p className="text-lg font-semibold">{formatNumber(remainingStock)}点</p>
            </div>
            <div>
              <p className="text-gray-500">予測シーズン末残</p>
              <p className={`text-lg font-semibold ${expectedRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {expectedRemaining > 0 ? `+${formatNumber(Math.round(expectedRemaining))}点` : `${formatNumber(Math.round(expectedRemaining))}点`}
              </p>
            </div>
            <div>
              <p className="text-gray-500">必要日販</p>
              <p className="text-lg font-semibold">
                {remainingDays > 0 ? `${neededDailySales.toFixed(1)}点/日` : '-'}
              </p>
              {currentDailySales > 0 && (
                <p className="text-xs text-gray-400">現在: {currentDailySales.toFixed(1)}点/日</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
