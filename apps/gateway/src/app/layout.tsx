import type { Metadata } from "next"
// Global styles from @repo/ui
// Imported via relative path for Turbopack compatibility


export const metadata: Metadata = {
  title: "Worldpay API Tester",
  description: "PayFac Payment Gateway - Worldpay Access API integration",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
