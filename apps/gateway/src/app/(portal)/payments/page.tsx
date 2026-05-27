import { getSession } from "@/lib/auth-server"
import { listPaymentIntents, listMerchants } from "@/dal/portal"
import { PaymentFilters } from "./payment-filters"
import Link from "next/link"
import { redirect } from "next/navigation"

type SearchParams = Promise<{ merchant?: string; status?: string; page?: string }>

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  const params = await searchParams
  const isPlatformView = session.activeRole === "platform_admin"
  const merchantId = params.merchant || (isPlatformView ? undefined : session.activeMerchantId) || undefined

  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const take = 20
  const skip = (page - 1) * take

  const { items, total } = await listPaymentIntents({
    merchantId: isPlatformView ? (params.merchant || null) : session.activeMerchantId,
    status: params.status || undefined,
    skip,
    take,
  })

  const totalPages = Math.ceil(total / take)
  const merchants = isPlatformView ? await listMerchants() : []

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      succeeded: "bg-emerald-100 text-emerald-700",
      payment_failed: "bg-red-100 text-red-700",
      requires_capture: "bg-amber-100 text-amber-700",
      processing: "bg-blue-100 text-blue-700",
      created: "bg-muted text-muted-foreground",
      canceled: "bg-muted text-muted-foreground",
    }
    return colors[status] ?? "bg-muted text-muted-foreground"
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {isPlatformView ? "All payments across merchants" : "Your payment history"}
        </p>
      </div>

      {/* Filters */}
      <PaymentFilters
        isPlatformView={isPlatformView}
        merchants={merchants}
        currentMerchant={params.merchant}
        currentStatus={params.status}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <p className="text-muted-foreground">No payments found.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Amount</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Currency</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {items.map((pi: Record<string, unknown>) => (
                  <tr key={pi.id as string} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/payments/${pi.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {(pi.id as string).slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(pi.amount as number / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {pi.currency as string}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(pi.status as string)}`}>
                        {(pi.status as string).replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(pi.createdAt as string).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/payments?page=${p}${params.merchant ? `&merchant=${params.merchant}` : ""}${params.status ? `&status=${params.status}` : ""}`}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm ${
                    p === page
                      ? "bg-primary text-primary-foreground"
                      : "border hover:bg-accent"
                  }`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
