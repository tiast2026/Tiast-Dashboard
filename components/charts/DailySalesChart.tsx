'use client'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface DailySalesChartProps {
  data: Array<{ day: number; current: number; prev_month: number; prev_year: number }>
  currentLabel: string
  prevMonthLabel: string
  prevYearLabel: string
}

const formatYAxis = (value: number) => `¥${Math.round(value / 10000)}万`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatTooltip = (value: any) => `¥${Math.round(Number(value)).toLocaleString()}`

export default function DailySalesChart({
  data,
  currentLabel,
  prevMonthLabel,
  prevYearLabel,
}: DailySalesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tickFormatter={(d) => `${d}日`}
          tick={{ fontSize: 11 }}
          interval={1}
        />
        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} width={70} />
        <Tooltip
          formatter={formatTooltip}
          labelFormatter={(day) => `${day}日`}
        />
        <Legend />
        <Bar
          dataKey="current"
          name={currentLabel}
          fill="#4A90D9"
          radius={[2, 2, 0, 0]}
          barSize={14}
        />
        <Line
          type="monotone"
          dataKey="prev_month"
          name={prevMonthLabel}
          stroke="#F59E0B"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="4 2"
        />
        <Line
          type="monotone"
          dataKey="prev_year"
          name={prevYearLabel}
          stroke="#9CA3AF"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="6 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
