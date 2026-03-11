'use client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BRAND_OPTIONS } from '@/lib/constants'

interface FilterBarProps {
  month: string
  onMonthChange: (month: string) => void
  brand: string
  onBrandChange: (brand: string) => void
  months?: string[] // available months for dropdown
  children?: React.ReactNode // additional filter elements
}

function generateMonths(count: number = 24): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function formatMonthLabel(m: string): string {
  const [year, month] = m.split('-')
  return `${year}年${parseInt(month)}月`
}

export default function FilterBar({ month, onMonthChange, brand, onBrandChange, months, children }: FilterBarProps) {
  const monthOptions = months || generateMonths()
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={month} onValueChange={onMonthChange}>
        <SelectTrigger className="w-40 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((m) => (
            <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={brand} onValueChange={onBrandChange}>
        <SelectTrigger className="w-40 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BRAND_OPTIONS.map((b) => (
            <SelectItem key={b} value={b}>{b}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {children}
    </div>
  )
}
