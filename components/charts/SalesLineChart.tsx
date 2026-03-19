'use client'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface SalesLineChartProps {
  data: Record<string, unknown>[]
  keys: string[]
  colors: Record<string, string>
}

const formatYAxis = (value: number) => `¥${Math.round(value / 10000)}万`
const formatTooltip = (value: number) => `¥${Math.round(value).toLocaleString()}`
const formatMonth = (month: string) => {
  const m = month.split('-')[1]
  return `${parseInt(m)}月`
}

export default function SalesLineChart({ data, keys, colors }: SalesLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: 12, fill: '#8A7D72' }}
          axisLine={{ stroke: '#D4CEC7' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatYAxis}
          tick={{ fontSize: 12, fill: '#8A7D72' }}
          width={70}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<ChartTooltip formatValue={formatTooltip} formatLabel={formatMonth} />}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        {keys.map((key) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={colors[key] || '#999'}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
            name={key}
            animationDuration={800}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
