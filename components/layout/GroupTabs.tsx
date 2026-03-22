'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export interface TabDef {
  label: string
  href: string
}

export interface TabGroup {
  key: string
  tabs: TabDef[]
}

export const TAB_GROUPS: TabGroup[] = [
  {
    key: 'sales',
    tabs: [
      { label: '売上概要', href: '/dashboard' },
      { label: 'チャネル収益性', href: '/channel-profitability' },
      { label: 'ABC分析', href: '/abc-analysis' },
    ],
  },
  {
    key: 'products',
    tabs: [
      { label: '商品一覧', href: '/products' },
      { label: '価格分析', href: '/pricing' },
      { label: '在庫回転率', href: '/inventory' },
      { label: '季節性予測', href: '/seasonality' },
    ],
  },
  {
    key: 'customers',
    tabs: [
      { label: '顧客概要', href: '/customers' },
      { label: '新規vsリピート', href: '/repeat-purchase' },
      { label: 'LTV分析', href: '/ltv' },
      { label: 'バスケット分析', href: '/basket-analysis' },
    ],
  },
  {
    key: 'marketing',
    tabs: [
      { label: '曜日×時間帯', href: '/time-analysis' },
      { label: 'レビュー管理', href: '/reviews' },
    ],
  },
]

export function findGroupForPath(pathname: string): TabGroup | undefined {
  return TAB_GROUPS.find(g => g.tabs.some(t => t.href === pathname))
}

export default function GroupTabs({ group }: { group?: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const brand = searchParams.get('brand')

  const tabGroup = group
    ? TAB_GROUPS.find(g => g.key === group)
    : findGroupForPath(pathname)

  if (!tabGroup) return null

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabGroup.tabs.map(tab => {
        const isActive = pathname === tab.href
        const href = brand ? `${tab.href}?brand=${brand}` : tab.href
        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-4 py-2.5 text-[13px] font-medium transition-all duration-150 border-b-2 -mb-px ${
              isActive
                ? 'border-[#C4A882] text-[#3D352F]'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
