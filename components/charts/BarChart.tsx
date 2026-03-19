'use client'
import { ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface BarChartProps {
  data: Array<{ name: string; value: number }>
  color?: string
  formatValue?: (v: number) => string
}

export default function BarChart({ data, color = '#6B8F9E', formatValue }: BarChartProps) {
  const fmt = formatValue || ((v: number) => `¥${Math.round(v).toLocaleString()}`)
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 44, 200)}>
      <RechartsBarChart data={data} layout="vertical" margin={{ top: 8, right: 90, bottom: 8, left: 10 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#E8E4DF" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: '#5A524B' }}
          width={110}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip formatValue={fmt} />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          animationDuration={600}
          animationEasing="ease-out"
          label={{
            position: 'right',
            formatter: (v: unknown) => fmt(Number(v)),
            fontSize: 11,
            fill: '#5A524B',
            fontWeight: 500,
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={color} opacity={0.85 + (i % 2) * 0.15} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  )
}
