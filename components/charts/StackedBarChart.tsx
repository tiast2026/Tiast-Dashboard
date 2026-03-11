'use client'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface StackedBarChartProps {
  data: Record<string, unknown>[]
  keys: string[]
  colors: Record<string, string>
  lineKey?: string
  lineColor?: string
}

const formatMonth = (month: string) => {
  if (!month) return ''
  const m = month.split('-')[1]
  return `${parseInt(m)}月`
}

export default function StackedBarChart({ data, keys, colors, lineKey, lineColor }: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
        {lineKey && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />}
        <Tooltip />
        <Legend />
        {keys.map((key) => (
          <Bar key={key} yAxisId="left" dataKey={key} stackId="stack" fill={colors[key] || '#999'} name={key} />
        ))}
        {lineKey && (
          <Line yAxisId="right" type="monotone" dataKey={lineKey} stroke={lineColor || '#F97316'} strokeWidth={2} dot={false} name={lineKey} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
