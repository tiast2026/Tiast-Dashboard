'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Tag, Package, Users, Megaphone, TrendingUp, Wallet, Database,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, Tag, Package, Users, Megaphone, TrendingUp, Wallet, Database,
}

interface NavItem {
  label: string
  href: string
  icon: string
  phase: number
}

const navItems: (NavItem | { type: 'separator' })[] = [
  { label: 'ダッシュボード', href: '/dashboard', icon: 'BarChart3', phase: 1 },
  { label: '商品分析', href: '/products', icon: 'Tag', phase: 1 },
  { label: '在庫管理', href: '/inventory', icon: 'Package', phase: 1 },
  { label: '顧客分析', href: '/customers', icon: 'Users', phase: 1 },
  { label: 'マスタ管理', href: '/master', icon: 'Database', phase: 1 },
  { type: 'separator' },
  { label: '広告効果', href: '/ads', icon: 'Megaphone', phase: 2 },
  { label: 'アクセス分析', href: '/analytics', icon: 'TrendingUp', phase: 2 },
  { label: '予算管理', href: '/budget', icon: 'Wallet', phase: 3 },
]

export default function Sidebar() {
  const pathname = usePathname()

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
        {navItems.map((item, i) => {
          if ('type' in item) {
            return <div key={i} className="my-3 mx-2 h-px bg-white/8" />
          }
          const Icon = iconMap[item.icon]
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const isDisabled = item.phase > 1

          if (isDisabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[#5A524B] cursor-not-allowed"
              >
                {Icon && <Icon className="w-[18px] h-[18px]" />}
                <span className="text-[13px]">{item.label}</span>
                <span className="ml-auto text-[9px] bg-white/5 text-[#5A524B] px-1.5 py-0.5 rounded-md">
                  準備中
                </span>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 ${
                isActive
                  ? 'bg-white/12 text-white font-medium shadow-sm'
                  : 'text-[#A99D93] hover:bg-white/6 hover:text-[#D4C8BC]'
              }`}
            >
              {Icon && <Icon className="w-[18px] h-[18px]" />}
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#C4A882]" />
              )}
            </Link>
          )
        })}
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
