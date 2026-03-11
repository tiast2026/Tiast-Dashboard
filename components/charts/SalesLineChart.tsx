'use client'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface SalesLineChartProps {
  data: Record<string, unknown>[]
  keys: string[]
  colors: Record<string, string>
}

const formatYAxis = (value: number) => `¥${Math.round(value / 10000)}万`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatTooltip = (value: any) => `¥${Math.round(Number(value)).toLocaleString()}`
const formatMonth = (month: string) => {
  const m = month.split('-')[1]
  return `${parseInt(m)}月`
}

export default function SalesLineChart({ data, keys, colors }: SalesLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} width={70} />
        <Tooltip formatter={formatTooltip} labelFormatter={(l) => String(l)} />
        <Legend />
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[key] || '#999'}
            strokeWidth={2}
            dot={false}
            name={key}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
