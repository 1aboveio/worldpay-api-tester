import { getSession } from "@/lib/auth-server"
import { listMerchants } from "@/dal/portal"
import Link from "next/link"
import { redirect } from "next/navigation"

export default async function MerchantsPage() {
  const session = await getSession()
  if (!session) redirect("/portal/login")

  // Only platform admins can see all merchants
  if (session.activeRole !== "platform_admin") {
    redirect("/portal/dashboard")
  }

  const merchants = await listMerchants()

  function maskApiKey(prefix: string): string {
    return `${prefix}••••••••••••••••`
  }

  if (merchants.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold">Merchants</h1>
          <p className="text-sm text-muted-foreground">Manage all registered merchants</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <p className="text-muted-foreground">No merchants registered yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Merchants</h1>
        <p className="text-sm text-muted-foreground">Manage all registered merchants</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Entity</th>
              <th className="px-4 py-3 text-left text-sm font-medium">API Key</th>
              <th className="px-4 py-3 text-left text-sm font-medium">FraudSight</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((merchant: Record<string, unknown>) => {
              const payFacConfig = merchant.payFacConfig as Record<string, unknown> ?? {}
              const fraudsight = payFacConfig.fraudsight as Record<string, unknown> ?? {}
              const apiKeys = (merchant.apiKeys as Array<Record<string, unknown>>) ?? []
              const activeKey = apiKeys.find((k) => k.isActive)

              return (
                <tr key={merchant.id as string} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/portal/merchants/${merchant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {merchant.name as string}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {merchant.entity as string}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {activeKey ? maskApiKey(activeKey.prefix as string) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        fraudsight.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {fraudsight.enabled ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
