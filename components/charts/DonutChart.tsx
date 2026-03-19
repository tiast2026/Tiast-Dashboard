'use client'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>
  centerLabel?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formatTooltip = (value: any) => `¥${Math.round(Number(value)).toLocaleString()}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload, data }: { payload?: any[]; data: DonutChartProps['data'] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!payload) return null
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {payload.map((entry, i) => {
        const item = data.find((d) => d.name === entry.value)
        const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
        const amount = item ? `¥${Math.round(item.value).toLocaleString()}` : ''
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="font-medium text-gray-700 min-w-[80px]">{entry.value}</span>
            <span className="text-gray-500 tabular-nums">{pct}%</span>
            <span className="text-gray-400 tabular-nums ml-auto">{amount}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function DonutChart({ data, centerLabel }: DonutChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            dataKey="value"
            label={false}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={formatTooltip} />
          {centerLabel && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xs font-semibold fill-gray-500">
              {centerLabel}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
      <CustomLegend
        payload={data.map((d) => ({ value: d.name, color: d.color }))}
        data={data}
      />
    </div>
  )
}
