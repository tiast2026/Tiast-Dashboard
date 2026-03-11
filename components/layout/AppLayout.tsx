'use client'

import AuthGuard from './AuthGuard'
import Sidebar from './Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 ml-60">{children}</main>
      </div>
    </AuthGuard>
  )
}
