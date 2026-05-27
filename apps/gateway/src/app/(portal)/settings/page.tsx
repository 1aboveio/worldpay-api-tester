import { getSession } from "@/lib/auth-server"
import { getApiKeysForMerchant } from "@/dal/portal"
import { redirect } from "next/navigation"
import { ApiKeyManager } from "./api-key-manager"

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const merchantId = session.activeMerchantId
  if (!merchantId) redirect("/dashboard")

  const apiKeys = await getApiKeysForMerchant(merchantId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your API keys and configuration</p>
      </div>

      {/* API Keys */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">API Keys</h2>

        {apiKeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border py-8">
            <p className="text-muted-foreground">No active API keys.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {apiKeys.map((key: Record<string, unknown>) => (
              <div
                key={key.id as string}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{key.prefix as string}••••••••••••••••</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(key.createdAt as string).toLocaleDateString()}
                  </p>
                </div>
                <ApiKeyManager merchantId={merchantId} keyId={key.id as string} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Merchant Info */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Merchant Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Merchant ID</p>
            <p className="font-mono text-sm">{merchantId}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active Role</p>
            <p className="text-sm capitalize">{session.activeRole}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
