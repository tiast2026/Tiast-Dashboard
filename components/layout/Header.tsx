export default function Header({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-black/[0.06] flex items-center justify-between px-8 sticky top-0 z-30">
      <div>
        <h2 className="text-[17px] font-semibold text-[#2C2420] tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-[#8A7D72] mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  )
}
