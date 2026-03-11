'use client'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>
  centerLabel?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatTooltip = (value: any) => `¥${Math.round(Number(value)).toLocaleString()}`

export default function DonutChart({ data, centerLabel }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={110}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
          labelLine={{ strokeWidth: 1 }}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip formatter={formatTooltip} />
        {centerLabel && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-semibold fill-gray-700">
            {centerLabel}
          </text>
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}
