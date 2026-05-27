import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
import { listCheckoutSessionsByMerchant } from "@repo/dal"
import { Badge } from "@/components/ui/badge"
import { StartCheckoutForm } from "./start-checkout-form"

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`
  }
}

const statusVariant: Record<string, "default" | "success" | "destructive" | "warning" | "outline"> = {
  open: "warning",
  processing: "default",
  completed: "success",
  failed: "destructive",
  expired: "outline",
}

export default async function PlaygroundPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  const merchantId = session.activeMerchantId
  if (!merchantId) redirect("/dashboard")

  const sessions = await listCheckoutSessionsByMerchant(merchantId)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Checkout Playground</h1>
        <p className="text-sm text-muted-foreground">
          Start a checkout and get a shareable link. The shopper pays on a hosted page using
          Worldpay&apos;s secure card fields.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Start a checkout</h2>
        <StartCheckoutForm />
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Recent checkouts</h2>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border py-8">
            <p className="text-muted-foreground">No checkouts yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Checkout</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((cs) => (
                  <tr key={cs.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{cs.id}</td>
                    <td className="py-2 pr-4">{formatAmount(cs.amount, cs.currency)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={statusVariant[cs.status] ?? "default"}>{cs.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(cs.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={`/checkout/${cs.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Open ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
