'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function currencyFormatter(value: any) {
  return formatCurrency(Number(value))
}

interface SeasonChartProps {
  data: Array<{ season: string; in_season_amount: number; exceeded_amount: number }>
}

export function SeasonBarChart({ data }: SeasonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={currencyFormatter} />
        <YAxis type="category" dataKey="season" width={50} />
        <Tooltip formatter={currencyFormatter} />
        <Legend />
        <Bar dataKey="in_season_amount" name="シーズン内" stackId="a" fill="#3B82F6" />
        <Bar dataKey="exceeded_amount" name="シーズン超過" stackId="a" fill="#EF4444" />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface CategoryChartProps {
  data: Record<string, unknown>[]
  brands: string[]
  brandColors: Record<string, string>
}

export function CategoryBarChart({ data, brands, brandColors }: CategoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="category" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={currencyFormatter} />
        <Tooltip formatter={currencyFormatter} />
        <Legend />
        {brands.map((b) => (
          <Bar
            key={b}
            dataKey={b}
            name={b}
            stackId="a"
            fill={brandColors[b] || '#6B7280'}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
