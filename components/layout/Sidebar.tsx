'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3, Tag, Users, Database, TrendingUp, ChevronDown,
} from 'lucide-react'

interface BrandSection {
  brand: string
  label: string
  color: string
  items: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[]
}

const brandSections: BrandSection[] = [
  {
    brand: 'NOAHL',
    label: 'NOAHL',
    color: '#C4A882',
    items: [
      { label: '売上分析', href: '/dashboard', icon: TrendingUp },
      { label: '商品分析', href: '/products', icon: Tag },
      { label: '顧客分析', href: '/customers', icon: Users },
    ],
  },
  {
    brand: 'BLACKQUEEN',
    label: 'BLACKQUEEN',
    color: '#9CA3AF',
    items: [
      { label: '売上分析', href: '/dashboard', icon: TrendingUp },
      { label: '商品分析', href: '/products', icon: Tag },
      { label: '顧客分析', href: '/customers', icon: Users },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentBrand = searchParams.get('brand')

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const s of brandSections) {
      init[s.brand] = s.brand === currentBrand
    }
    return init
  })

  const toggle = (brand: string) => {
    setExpanded(prev => ({ ...prev, [brand]: !prev[brand] }))
  }

  const isActive = (href: string, brand?: string) => {
    if (brand) {
      return pathname === href && currentBrand === brand
    }
    return pathname === href && !currentBrand
  }

  return (
    <aside className="w-60 h-screen flex flex-col fixed left-0 top-0 z-40 bg-gradient-to-b from-[#2C2420] to-[#1E1A17]">
      {/* Logo area */}
      <div className="p-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C4A882] to-[#A8896A] flex items-center justify-center">
            <span className="text-white text-sm font-bold">T</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">TIAST</h1>
            <p className="text-[10px] text-[#8A7D72] tracking-widest uppercase">Dashboard</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/10" />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {/* 全体ダッシュボード */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 ${
            isActive('/dashboard')
              ? 'bg-white/12 text-white font-medium shadow-sm'
              : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
          }`}
        >
          <BarChart3 className="w-[18px] h-[18px]" />
          <span>全体ダッシュボード</span>
          {isActive('/dashboard') && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#C4A882]" />
          )}
        </Link>

        {/* Brand sections */}
        {brandSections.map((section) => {
          const isExpanded = expanded[section.brand]
          const isBrandActive = currentBrand === section.brand

          return (
            <div key={section.brand} className="mt-2">
              {/* Brand header */}
              <button
                onClick={() => toggle(section.brand)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 ${
                  isBrandActive
                    ? 'text-white'
                    : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: section.color }}
                />
                <span className="font-medium">{section.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Sub-items */}
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {section.items.map((item) => {
                  const active = isActive(item.href, section.brand)
                  const Icon = item.icon
                  return (
                    <Link
                      key={`${section.brand}-${item.href}`}
                      href={`${item.href}?brand=${section.brand}`}
                      className={`flex items-center gap-3 pl-8 pr-3 py-2 rounded-lg text-[12px] transition-all duration-200 ${
                        active
                          ? 'bg-white/12 text-white font-medium'
                          : 'text-[#8A7D72] hover:bg-white/6 hover:text-[#D4C8BC]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                      {active && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: section.color }} />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Separator */}
        <div className="my-3 mx-2 h-px bg-white/8" />

        {/* 商品マスタ */}
        <Link
          href="/master"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 ${
            isActive('/master')
              ? 'bg-white/12 text-white font-medium shadow-sm'
              : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
          }`}
        >
          <Database className="w-[18px] h-[18px]" />
          <span>商品マスタ</span>
          {isActive('/master') && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#C4A882]" />
          )}
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/8">
        <div className="flex items-center gap-2 px-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C4A882] to-[#8FAE8B] flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">TI</span>
          </div>
          <div>
            <p className="text-[11px] text-[#A99D93]">TIAST Inc.</p>
            <p className="text-[9px] text-[#5A524B]">v1.0 Phase 1</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
