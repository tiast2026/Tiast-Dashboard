'use client'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import ChartTooltip from './ChartTooltip'

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

const formatYAxisValue = (value: number) => {
  if (value >= 10000000) return `${(value / 10000000).toFixed(0)}千万`
  if (value >= 10000) return `${(value / 10000).toFixed(0)}万`
  return String(value)
}

const formatTooltipValue = (value: number) => `¥${Math.round(value).toLocaleString()}`

export default function StackedBarChart({ data, keys, colors, lineKey, lineColor }: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: 12, fill: '#8A7D72' }}
          axisLine={{ stroke: '#D4CEC7' }}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12, fill: '#8A7D72' }}
          tickFormatter={formatYAxisValue}
          axisLine={false}
          tickLine={false}
        />
        {lineKey && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#8A7D72' }}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            axisLine={false}
            tickLine={false}
          />
        )}
        <Tooltip
          content={<ChartTooltip formatValue={formatTooltipValue} formatLabel={formatMonth} />}
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        {keys.map((key, i) => (
          <Bar
            key={key}
            yAxisId="left"
            dataKey={key}
            stackId="stack"
            fill={colors[key] || '#999'}
            name={key}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : undefined}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
        {lineKey && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey={lineKey}
            stroke={lineColor || '#F97316'}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
            name={lineKey}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
