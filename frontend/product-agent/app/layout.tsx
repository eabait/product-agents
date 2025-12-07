import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Product Agents',
  description: 'Agents for Product Development',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
