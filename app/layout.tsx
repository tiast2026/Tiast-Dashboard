import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/layout/Providers'

export const metadata: Metadata = {
  title: 'TIAST Dashboard',
  description: 'TIAST社内データダッシュボード',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
