'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  BarChart3, Tag, Package, Users, Megaphone, TrendingUp, Wallet, LogOut,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, Tag, Package, Users, Megaphone, TrendingUp, Wallet,
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
  { type: 'separator' },
  { label: '広告効果', href: '/ads', icon: 'Megaphone', phase: 2 },
  { label: 'アクセス分析', href: '/analytics', icon: 'TrendingUp', phase: 2 },
  { label: '予算管理', href: '/budget', icon: 'Wallet', phase: 3 },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 h-screen bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 z-40">
      <div className="p-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">TIAST</h1>
        <p className="text-xs text-gray-400 mt-0.5">Dashboard</p>
      </div>
      <Separator />
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item, i) => {
          if ('type' in item) {
            return <Separator key={i} className="my-3" />
          }
          const Icon = iconMap[item.icon]
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const isDisabled = item.phase > 1

          if (isDisabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-400 cursor-not-allowed"
              >
                {Icon && <Icon className="w-5 h-5" />}
                <span className="text-sm">{item.label}</span>
                <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                  準備中
                </span>
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900 font-medium border-l-2 border-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {Icon && <Icon className="w-5 h-5" />}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-gray-200">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span>ログアウト</span>
        </button>
      </div>
    </aside>
  )
}
