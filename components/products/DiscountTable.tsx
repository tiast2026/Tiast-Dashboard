'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatPercent } from '@/lib/format'

interface DiscountTableProps {
  selling_price: number
  cost_price: number
}

const DISCOUNT_RATES = [0.1, 0.2, 0.3, 0.4, 0.5]

export default function DiscountTable({ selling_price, cost_price }: DiscountTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">値引きシミュレーション</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="text-xs font-semibold text-gray-600">値引率</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-right">販売価格</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-right">利益</TableHead>
              <TableHead className="text-xs font-semibold text-gray-600 text-right">利益率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-sm font-medium">定価</TableCell>
              <TableCell className="text-sm text-right">{formatCurrency(selling_price)}</TableCell>
              <TableCell className="text-sm text-right">{formatCurrency(selling_price - cost_price)}</TableCell>
              <TableCell className="text-sm text-right">
                {formatPercent((selling_price - cost_price) / selling_price)}
              </TableCell>
            </TableRow>
            {DISCOUNT_RATES.map((rate) => {
              const discountedPrice = Math.round(selling_price * (1 - rate))
              const profit = discountedPrice - cost_price
              const margin = discountedPrice > 0 ? profit / discountedPrice : 0
              const isNegative = profit < 0

              return (
                <TableRow key={rate}>
                  <TableCell className="text-sm font-medium">{Math.round(rate * 100)}% OFF</TableCell>
                  <TableCell className="text-sm text-right">{formatCurrency(discountedPrice)}</TableCell>
                  <TableCell className={`text-sm text-right ${isNegative ? 'text-red-600 font-semibold' : ''}`}>
                    {formatCurrency(profit)}
                  </TableCell>
                  <TableCell className={`text-sm text-right ${isNegative ? 'text-red-600 font-semibold' : ''}`}>
                    {formatPercent(margin)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
