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
import ChartTooltip from './ChartTooltip'

interface DailySalesChartProps {
  data: Array<{ day: number; current: number; prev_month: number; prev_year: number }>
  currentLabel: string
  prevMonthLabel: string
  prevYearLabel: string
}

const formatYAxis = (value: number) => `¥${Math.round(value / 10000)}万`
const formatTooltip = (value: number) => `¥${Math.round(value).toLocaleString()}`

export default function DailySalesChart({
  data,
  currentLabel,
  prevMonthLabel,
  prevYearLabel,
}: DailySalesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={(d) => `${d}日`}
          tick={{ fontSize: 11, fill: '#8A7D72' }}
          interval={1}
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
          content={<ChartTooltip formatValue={formatTooltip} formatLabel={(l) => `${l}日`} />}
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar
          dataKey="current"
          name={currentLabel}
          fill="#4A90D9"
          radius={[4, 4, 0, 0]}
          barSize={16}
          animationDuration={600}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="prev_month"
          name={prevMonthLabel}
          stroke="#F59E0B"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
          strokeDasharray="6 3"
        />
        <Line
          type="monotone"
          dataKey="prev_year"
          name={prevYearLabel}
          stroke="#9CA3AF"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
          strokeDasharray="4 2"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
