"use client"

import { useRouter } from "next/navigation"
import { useSession } from "@/context/session-context"
import { switchMerchant, switchToPlatformOverview } from "@/app/(portal)/actions"
import { logoutAction } from "@/app/(portal)/auth-actions"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function PortalSidebar() {
  const session = useSession()
  const router = useRouter()
  const pathname = usePathname()

  if (!session) return null

  const { activeRole, isPlatformAdmin, availableMerchants, user } = session

  // Determine nav items based on role
  const navItems = isPlatformAdmin && activeRole === "platform_admin"
    ? [
        { href: "/dashboard", label: "Dashboard", icon: "📊" },
        { href: "/merchants", label: "Merchants", icon: "🏢" },
        { href: "/payments", label: "Payments", icon: "💳" },
        { href: "/statements", label: "Statements", icon: "📄" },
      ]
    : [
        { href: "/dashboard", label: "Dashboard", icon: "📊" },
        { href: "/payments", label: "Payments", icon: "💳" },
        { href: "/payment-methods", label: "Payment Methods", icon: "🔑" },
        { href: "/refunds", label: "Refunds", icon: "↩️" },
        { href: "/statements", label: "Statements", icon: "📄" },
        { href: "/settings", label: "Settings", icon: "⚙️" },
      ]

  async function handleMerchantChange(merchantId: string) {
    const result = await switchMerchant({ merchantId })
    if (result.success) {
      router.refresh()
    }
  }

  async function handlePlatformOverview() {
    const result = await switchToPlatformOverview()
    if (result.success) {
      router.refresh()
    }
  }

  async function handleLogout() {
    await logoutAction()
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      {/* Header with merchant switcher */}
      <div className="border-b p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">PayFac Portal</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {activeRole === "platform_admin" ? "Admin" : "Merchant"}
            </span>
          </div>

          {/* Merchant Switcher */}
          {availableMerchants.length > 1 && (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={
                activeRole === "platform_admin" && !session.activeMerchantId
                  ? "__platform__"
                  : session.activeMerchantId ?? ""
              }
              onChange={(e) => {
                const val = e.target.value
                if (val === "__platform__") {
                  handlePlatformOverview()
                } else if (val) {
                  handleMerchantChange(val)
                }
              }}
            >
              {isPlatformAdmin && (
                <option value="__platform__">Platform Overview</option>
              )}
              {availableMerchants.map((m) => (
                <option key={m.merchantId} value={m.merchantId}>
                  {m.merchantName}
                </option>
              ))}
            </select>
          )}

          {availableMerchants.length === 1 && (
            <p className="text-xs text-muted-foreground truncate">
              {availableMerchants[0].merchantName}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t p-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm">
            <p className="font-medium truncate">{user.name || user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex h-8 w-full items-center justify-center rounded-md border border-input bg-background text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
