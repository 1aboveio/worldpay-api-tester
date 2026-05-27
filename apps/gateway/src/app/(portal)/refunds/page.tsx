import { getSession } from "@/lib/auth-server"
import { listRefunds } from "@/dal/portal"
import { redirect } from "next/navigation"

export default async function RefundsPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const merchantId = session.activeMerchantId
  if (!merchantId) redirect("/dashboard")

  const refunds = await listRefunds(merchantId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Refunds</h1>
        <p className="text-sm text-muted-foreground">Your refund history</p>
      </div>

      {refunds.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <p className="text-muted-foreground">No refunds processed yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Currency</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Payment</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r: Record<string, unknown>) => (
                <tr key={r.id as string} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {(r.id as string).slice(0, 12)}...
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {(r.amount as number / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {r.currency as string}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === "succeeded" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "pending" ? "bg-amber-100 text-amber-700" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {r.status as string}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {(r.paymentIntentId as string).slice(0, 12)}...
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(r.createdAt as string).toLocaleDateString()}
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
