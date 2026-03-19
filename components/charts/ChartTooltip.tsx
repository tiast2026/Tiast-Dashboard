'use client'

interface CustomTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ name?: string; value?: number; color?: string; [key: string]: any }>
  label?: string | number
  formatValue?: (value: number) => string
  formatLabel?: (label: string) => string
}

export default function ChartTooltip({ active, payload, label, formatValue, formatLabel }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const fmt = formatValue || ((v: number) => `¥${Math.round(v).toLocaleString()}`)
  const displayLabel = formatLabel ? formatLabel(String(label)) : String(label)

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-black/[0.08] rounded-lg shadow-lg px-3 py-2.5 min-w-[160px]">
      <p className="text-[11px] font-medium text-[#8A7D72] mb-1.5 pb-1.5 border-b border-black/[0.06]">
        {displayLabel}
      </p>
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[11px] text-[#5A524B]">{entry.name}</span>
            </div>
            <span className="text-[11px] font-semibold text-[#3D352F] tabular-nums">
              {fmt(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
