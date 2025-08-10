import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PRD Generator Agent',
  description: 'AI-powered Product Requirements Document generator',
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
