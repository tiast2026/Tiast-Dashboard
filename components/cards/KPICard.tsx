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
    <Card className="hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)] transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-medium text-[#8A7D72]">{title}</span>
          {icon && <span className="text-[#C4A882]/60">{icon}</span>}
        </div>
        <div className="text-[26px] font-bold text-[#2C2420] tracking-tight leading-tight">{value}</div>
        <div className="flex items-center gap-3 mt-2">
          {change && (
            <span className={`text-[13px] font-semibold ${change.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
              {change.text}
            </span>
          )}
          {yoyText && (
            <span className="text-[11px] text-[#A99D93]">前年比 {yoyText}</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
