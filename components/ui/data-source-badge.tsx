'use client'

type DataSource = 'rakuten' | 'official'

interface DataSourceBadgeProps {
  sources: { key: DataSource; label: string; hasData: boolean }[]
}

const SOURCE_STYLES: Record<DataSource, { active: string; inactive: string; dot: string; dotInactive: string }> = {
  rakuten: {
    active: 'bg-red-50 border-red-200 text-red-700',
    inactive: 'bg-gray-50 border-gray-200 text-gray-400',
    dot: 'bg-red-500',
    dotInactive: 'bg-gray-300',
  },
  official: {
    active: 'bg-blue-50 border-blue-200 text-blue-700',
    inactive: 'bg-gray-50 border-gray-200 text-gray-400',
    dot: 'bg-blue-500',
    dotInactive: 'bg-gray-300',
  },
}

export default function DataSourceBadge({ sources }: DataSourceBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      {sources.map((src) => {
        const style = SOURCE_STYLES[src.key]
        const isActive = src.hasData
        return (
          <span
            key={src.key}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${
              isActive ? style.active : style.inactive
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? style.dot : style.dotInactive}`} />
            {src.label}
            {!isActive && '（データなし）'}
          </span>
        )
      })}
    </div>
  )
}
