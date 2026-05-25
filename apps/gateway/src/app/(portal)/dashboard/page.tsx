import { getSession } from "@/lib/auth-server"
import { getMerchantStats } from "@/dal/portal"

export default async function PortalDashboardPage() {
  const session = await getSession()
  if (!session) return null

  const isPlatformView = session.activeRole === "platform_admin"
  const merchantId = isPlatformView ? null : session.activeMerchantId
  const stats = await getMerchantStats(merchantId)

  const cards = isPlatformView
    ? [
        { label: "Total Merchants", value: stats.merchantCount },
        { label: "Payments Today", value: stats.paymentsToday },
        { label: "Total Payments", value: stats.totalPayments },
        { label: "Success Rate", value: `${stats.successRate}%` },
      ]
    : [
        { label: "Payments Today", value: stats.paymentsToday },
        { label: "Total Payments", value: stats.totalPayments },
        { label: "Success Rate", value: `${stats.successRate}%` },
        { label: "Total Refunds", value: stats.totalRefunds },
      ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {isPlatformView ? "Platform overview" : "Your merchant overview"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border bg-card p-4 shadow-sm"
          >
            <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
