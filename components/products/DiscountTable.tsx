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
        <div className="border border-black/[0.06] rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-b from-[#FAFAF8] to-[#F6F4F1] border-b border-black/[0.08]">
                <TableHead className="text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider">値引率</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider text-right">販売価格</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider text-right">利益</TableHead>
                <TableHead className="text-[11px] font-semibold text-[#8A7D72] uppercase tracking-wider text-right">利益率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-b border-black/[0.05] bg-[#F8F6F3]">
                <TableCell className="text-[13px] font-semibold text-[#3D352F]">定価</TableCell>
                <TableCell className="text-[13px] text-right tabular-nums font-semibold text-[#3D352F]">{formatCurrency(selling_price)}</TableCell>
                <TableCell className="text-[13px] text-right tabular-nums font-semibold text-[#3D352F]">{formatCurrency(selling_price - cost_price)}</TableCell>
                <TableCell className="text-[13px] text-right tabular-nums font-semibold text-[#3D352F]">
                  {formatPercent((selling_price - cost_price) / selling_price)}
                </TableCell>
              </TableRow>
              {DISCOUNT_RATES.map((rate, i) => {
                const discountedPrice = Math.round(selling_price * (1 - rate))
                const profit = discountedPrice - cost_price
                const margin = discountedPrice > 0 ? profit / discountedPrice : 0
                const isNegative = profit < 0

                return (
                  <TableRow
                    key={rate}
                    className={`border-b border-black/[0.04] ${i % 2 === 0 ? 'bg-[#FDFCFB]' : ''} ${isNegative ? 'bg-rose-50/50' : ''}`}
                  >
                    <TableCell className="text-[13px] font-medium text-[#5A524B]">{Math.round(rate * 100)}% OFF</TableCell>
                    <TableCell className="text-[13px] text-right tabular-nums text-[#3D352F]">{formatCurrency(discountedPrice)}</TableCell>
                    <TableCell className={`text-[13px] text-right tabular-nums ${isNegative ? 'text-rose-500 font-semibold' : 'text-[#3D352F]'}`}>
                      {formatCurrency(profit)}
                    </TableCell>
                    <TableCell className={`text-[13px] text-right tabular-nums ${isNegative ? 'text-rose-500 font-semibold' : 'text-[#3D352F]'}`}>
                      {formatPercent(margin)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
