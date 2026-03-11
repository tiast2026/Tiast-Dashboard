'use client'
import { Card, CardContent } from '@/components/ui/card'

interface KPICardProps {
  title: string
  value: string
  change?: { text: string; isPositive: boolean } | null
  yoyText?: string
  icon?: React.ReactNode
}

export default function KPICard({ title, value, change, yoyText, icon }: KPICardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">{title}</span>
          {icon && <span className="text-gray-400">{icon}</span>}
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="flex items-center gap-3 mt-1">
          {change && (
            <span className={`text-sm font-medium ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {change.text}
            </span>
          )}
          {yoyText && (
            <span className="text-xs text-gray-400">前年比 {yoyText}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
