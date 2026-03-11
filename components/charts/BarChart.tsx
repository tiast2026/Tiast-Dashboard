'use client'
import { ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

interface BarChartProps {
  data: Array<{ name: string; value: number }>
  color?: string
  formatValue?: (v: number) => string
}

export default function BarChart({ data, color = '#6B7280', formatValue }: BarChartProps) {
  const fmt = formatValue || ((v: number) => `¥${Math.round(v).toLocaleString()}`)
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 40, 200)}>
      <RechartsBarChart data={data} layout="vertical" margin={{ top: 5, right: 80, bottom: 5, left: 10 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={100} />
        <Tooltip formatter={(v) => fmt(Number(v))} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v) => fmt(Number(v)), fontSize: 11 }}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
