'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/format'
import ChartTooltip from './ChartTooltip'

interface SeasonChartProps {
  data: Array<{ season: string; in_season_amount: number; exceeded_amount: number }>
}

export function SeasonBarChart({ data }: SeasonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#E8E4DF" />
        <XAxis
          type="number"
          tickFormatter={(v) => formatCurrency(v)}
          tick={{ fontSize: 11, fill: '#8A7D72' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="season"
          width={50}
          tick={{ fontSize: 12, fill: '#5A524B' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip formatValue={(v) => formatCurrency(v)} />}
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="in_season_amount"
          name="シーズン内"
          stackId="a"
          fill="#4A90D9"
          radius={[0, 0, 0, 0]}
          animationDuration={600}
        />
        <Bar
          dataKey="exceeded_amount"
          name="シーズン超過"
          stackId="a"
          fill="#E57373"
          radius={[0, 4, 4, 0]}
          animationDuration={600}
        />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" vertical={false} />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 12, fill: '#5A524B' }}
          axisLine={{ stroke: '#D4CEC7' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatCurrency(v)}
          tick={{ fontSize: 11, fill: '#8A7D72' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip formatValue={(v) => formatCurrency(v)} />}
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        {brands.map((b, i) => (
          <Bar
            key={b}
            dataKey={b}
            name={b}
            stackId="a"
            fill={brandColors[b] || '#6B7280'}
            radius={i === brands.length - 1 ? [4, 4, 0, 0] : undefined}
            animationDuration={600}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
