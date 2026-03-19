'use client'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import ChartTooltip from './ChartTooltip'

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>
  centerLabel?: string
}

const formatTooltip = (value: number) => `¥${Math.round(value).toLocaleString()}`

export default function DonutChart({ data, centerLabel }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            dataKey="value"
            label={false}
            stroke="#fff"
            strokeWidth={2}
            animationDuration={800}
            animationEasing="ease-out"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatValue={formatTooltip} />} />
          {centerLabel && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-xs font-semibold"
              fill="#8A7D72"
            >
              {centerLabel}
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2 mt-3 px-1">
        {data.map((d, i) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
          const amount = `¥${Math.round(d.value).toLocaleString()}`
          return (
            <div key={i} className="flex items-center gap-2.5 text-xs group">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/[0.06]"
                style={{ backgroundColor: d.color }}
              />
              <span className="font-medium text-[#3D352F] min-w-[80px]">{d.name}</span>
              <div className="flex-1 border-b border-dotted border-black/[0.08] mx-1" />
              <span className="text-[#5A524B] tabular-nums font-medium">{pct}%</span>
              <span className="text-[#8A7D72] tabular-nums ml-1">{amount}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
