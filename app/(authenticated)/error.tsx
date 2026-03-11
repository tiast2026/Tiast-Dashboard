'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">エラーが発生しました</h2>
        <p className="text-gray-500 mb-4 text-sm">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-800"
        >
          再読み込み
        </button>
      </div>
    </div>
  )
}
