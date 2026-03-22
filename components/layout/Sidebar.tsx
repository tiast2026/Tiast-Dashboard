'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3, Tag, Users, Database, TrendingUp, ChevronDown, Trophy, Upload, Megaphone,
} from 'lucide-react'
import { TAB_GROUPS } from './GroupTabs'

// Map group key → sidebar display
const GROUP_DISPLAY: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  sales: { label: '売上分析', icon: TrendingUp },
  products: { label: '商品分析', icon: Tag },
  customers: { label: '顧客分析', icon: Users },
  marketing: { label: 'マーケティング', icon: Megaphone },
}

interface BrandConfig {
  brand: string
  label: string
  color: string
}

const brands: BrandConfig[] = [
  { brand: 'NOAHL', label: 'NOAHL', color: '#C4A882' },
  { brand: 'BLACKQUEEN', label: 'BLACKQUEEN', color: '#9CA3AF' },
]

// Which paths belong to each group (for active detection)
const groupPaths = TAB_GROUPS.map(g => ({
  key: g.key,
  href: g.tabs[0].href, // first tab is the entry point
  paths: g.tabs.map(t => t.href),
}))

export default function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentBrand = searchParams.get('brand')

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const b of brands) init[b.brand] = true
    return init
  })

  const toggle = (brand: string) => {
    setExpanded(prev => ({ ...prev, [brand]: !prev[brand] }))
  }

  const isGroupActive = (paths: string[], brand: string) => {
    return paths.includes(pathname) && currentBrand === brand
  }

  const isActive = (href: string, brand?: string) => {
    if (brand) return pathname === href && currentBrand === brand
    return pathname === href && !currentBrand
  }

  return (
    <aside className="w-56 h-screen flex flex-col fixed left-0 top-0 z-40 bg-gradient-to-b from-[#2C2420] to-[#1E1A17]">
      {/* Logo */}
      <div className="p-5 pb-4">
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

      <div className="mx-4 h-px bg-white/10" />

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto scrollbar-thin">
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
        {brands.map((config) => {
          const isOpen = expanded[config.brand]
          const isBrandActive = currentBrand === config.brand

          return (
            <div key={config.brand} className="mt-3">
              <button
                onClick={() => toggle(config.brand)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 ${
                  isBrandActive
                    ? 'text-white'
                    : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
                }`}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: config.color }}
                />
                <span className="font-medium">{config.label}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ${
                  isOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                {groupPaths.map((gp) => {
                  const display = GROUP_DISPLAY[gp.key]
                  if (!display) return null
                  const active = isGroupActive(gp.paths, config.brand)
                  const Icon = display.icon
                  return (
                    <Link
                      key={gp.key}
                      href={`${gp.href}?brand=${config.brand}`}
                      className={`flex items-center gap-3 pl-8 pr-3 py-2 rounded-lg text-[12px] transition-all duration-200 ${
                        active
                          ? 'bg-white/12 text-white font-medium'
                          : 'text-[#8A7D72] hover:bg-white/6 hover:text-[#D4C8BC]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{display.label}</span>
                      {active && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
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

        {/* 楽天ランキング */}
        <Link
          href="/ranking"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 ${
            isActive('/ranking')
              ? 'bg-white/12 text-white font-medium shadow-sm'
              : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
          }`}
        >
          <Trophy className="w-[18px] h-[18px]" style={{ color: '#BF0000' }} />
          <span>楽天ランキング</span>
          {isActive('/ranking') && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#BF0000]" />
          )}
        </Link>

        {/* 楽天データ */}
        <Link
          href="/rakuten-data"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 ${
            isActive('/rakuten-data')
              ? 'bg-white/12 text-white font-medium shadow-sm'
              : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
          }`}
        >
          <Upload className="w-[18px] h-[18px]" style={{ color: '#BF0000' }} />
          <span>楽天データ</span>
          {isActive('/rakuten-data') && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#BF0000]" />
          )}
        </Link>

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
      <div className="px-4 py-1.5 border-t border-white/8">
        <div className="flex items-center gap-2 px-2">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#C4A882] to-[#8FAE8B] flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">TI</span>
          </div>
          <div className="leading-tight">
            <p className="text-[10px] text-[#A99D93]">TIAST Inc.</p>
            <p className="text-[8px] text-[#5A524B]">v2.0</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
