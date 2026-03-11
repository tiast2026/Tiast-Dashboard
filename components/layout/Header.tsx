'use client'

import { useSession } from 'next-auth/react'

export default function Header({ title }: { title: string }) {
  const { data: session } = useSession()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{session?.user?.email}</span>
      </div>
    </header>
  )
}
