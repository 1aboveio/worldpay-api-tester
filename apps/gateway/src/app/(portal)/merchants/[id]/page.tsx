import { getSession } from "@/lib/auth-server"
import { getMerchantById } from "@/dal/portal"
import { redirect, notFound } from "next/navigation"
import { FraudSightConfigForm } from "./fraudsight-form"

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/portal/login")
  if (session.activeRole !== "platform_admin") redirect("/portal/dashboard")

  const { id } = await params
  const merchant = await getMerchantById(id)
  if (!merchant) notFound()

  const payFacConfig = (merchant.payFacConfig as Record<string, unknown>) ?? {}
  const fraudsight = (payFacConfig.fraudsight as Record<string, unknown>) ?? {}
  const apiKeys = (merchant.apiKeys as Array<Record<string, unknown>>) ?? []
  const activeKey = apiKeys.find((k) => k.isActive)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{merchant.name as string}</h1>
        <p className="text-sm text-muted-foreground">
          Entity: {merchant.entity as string}
        </p>
      </div>

      {/* Info Card */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Merchant Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">ID</p>
            <p className="font-mono text-sm">{merchant.id as string}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Entity</p>
            <p className="font-mono text-sm">{merchant.entity as string}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">API Key</p>
            <p className="font-mono text-xs">
              {activeKey
                ? `${activeKey.prefix as string}••••••••••••••••`
                : "No active key"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="text-sm">
              {new Date(merchant.createdAt as string).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* FraudSight Config Card */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">FraudSight Configuration</h2>
        <FraudSightConfigForm
          merchantId={id}
          fraudsight={{
            enabled: (fraudsight.enabled as boolean) ?? false,
            actionOnHighRisk: (fraudsight.actionOnHighRisk as string) ?? "monitor",
            actionOnReview: (fraudsight.actionOnReview as string) ?? "monitor",
            exemption: (fraudsight.exemption as boolean) ?? false,
            capability: (fraudsight.capability as string) ?? "risk_assessment",
          }}
        />
      </div>
    </div>
  )
}
