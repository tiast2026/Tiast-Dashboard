'use client'

import { Suspense } from 'react'
import Sidebar from './Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F8F6F3] overflow-hidden">
      <Suspense>
        <Sidebar />
      </Suspense>
      <main className="flex-1 ml-60 min-w-0 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  )
}
