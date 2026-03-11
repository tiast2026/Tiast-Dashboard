'use client'
import { Card, CardContent } from '@/components/ui/card'

const colorMap = {
  red: { bg: 'bg-red-50 border-red-200 hover:bg-red-100', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
  yellow: { bg: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  blue: { bg: 'bg-blue-50 border-blue-200 hover:bg-blue-100', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
}

interface AlertCardProps {
  title: string
  count: number
  amount: string
  color: 'red' | 'yellow' | 'blue'
  onClick?: () => void
}

export default function AlertCard({ title, count, amount, color, onClick }: AlertCardProps) {
  const colors = colorMap[color]
  return (
    <Card className={`${colors.bg} border cursor-pointer transition-colors`} onClick={onClick}>
      <CardContent className="p-5">
        <div className={`text-sm font-medium ${colors.text} mb-2`}>{title}</div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${colors.text}`}>{count}</span>
          <span className={`text-sm ${colors.text}`}>件</span>
        </div>
        <div className={`text-sm ${colors.text} mt-1`}>在庫金額: {amount}</div>
      </CardContent>
    </Card>
  )
}
