export default function Header({ title }: { title: string }) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    </header>
  )
}
