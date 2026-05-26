import { getSession } from "@/lib/auth-server"
import { listStatements } from "@/dal/portal"
import { redirect } from "next/navigation"

type SearchParams = Promise<{ start?: string; end?: string }>

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await getSession()
  if (!session) redirect("/portal/login")

  const params = await searchParams
  const isPlatformView = session.activeRole === "platform_admin"

  const dateRange = params.start && params.end
    ? { start: new Date(params.start), end: new Date(params.end) }
    : undefined

  const statements = await listStatements({
    merchantId: isPlatformView ? null : session.activeMerchantId,
    dateRange,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Statements</h1>
        <p className="text-sm text-muted-foreground">
          {isPlatformView ? "All merchant statements" : "Your statements"}
        </p>
      </div>

      {/* Date Range Filter */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="start" className="text-xs font-medium">From</label>
          <input
            id="start"
            name="start"
            type="date"
            defaultValue={params.start ?? ""}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="end" className="text-xs font-medium">To</label>
          <input
            id="end"
            name="end"
            type="date"
            defaultValue={params.end ?? ""}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filter
        </button>
      </form>

      {statements.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12">
          <p className="text-muted-foreground">No statements found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">Period</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Volume</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Fees</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Transactions</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s: Record<string, unknown>) => (
                <tr key={s.id as string} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm">
                    {new Date(s.periodStart as string).toLocaleDateString()} —{" "}
                    {new Date(s.periodEnd as string).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {(s.totalVolume as number / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {(s.totalFees as number / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm">{s.transactionCount as number}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === "final" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                    }`}>
                      {s.status as string}
                    </span>
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
