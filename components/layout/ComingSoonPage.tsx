'use client'

import Header from './Header'

export default function ComingSoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <Header title={title} />
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="text-center">
          <div className="text-6xl mb-4 text-gray-300">🚧</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">{title}</h2>
          <p className="text-gray-500">Phase {phase} で実装予定です</p>
        </div>
      </div>
    </>
  )
}
