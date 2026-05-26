import type { Metadata } from "next"
import "@repo/ui/globals.css"

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
