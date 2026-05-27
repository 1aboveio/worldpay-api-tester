import { getSession } from "@/lib/auth-server"
import { listPaymentMethods } from "@/dal/portal"
import { redirect } from "next/navigation"

export default async function PaymentMethodsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const merchantId = session.activeMerchantId
  if (!merchantId) redirect("/dashboard")

  const methods = await listPaymentMethods(merchantId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <p className="text-sm text-muted-foreground">Stored cards and tokens</p>
      </div>

      {methods.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <p className="mb-2 text-muted-foreground">No stored payment methods.</p>
          <p className="text-sm text-muted-foreground">
            Payment methods are created when customers make payments.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">Brand</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Last 4</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Expiry</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((pm: Record<string, unknown>) => (
                <tr key={pm.id as string} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-medium capitalize">
                    {pm.brand as string}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    •••• {pm.last4 as string}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {pm.expiryMonth ? `${String(pm.expiryMonth).padStart(2, "0")}/${pm.expiryYear}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {pm.type as string}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(pm.createdAt as string).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
