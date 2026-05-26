"use client"

export function PaymentFilters({
  isPlatformView,
  merchants,
  currentMerchant,
  currentStatus,
}: {
  isPlatformView: boolean
  merchants: Array<Record<string, unknown>>
  currentMerchant?: string
  currentStatus?: string
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {isPlatformView && (
        <select
          name="merchant"
          defaultValue={currentMerchant ?? ""}
          onChange={(e) => {
            const url = new URL(window.location.href)
            if (e.target.value) url.searchParams.set("merchant", e.target.value)
            else url.searchParams.delete("merchant")
            url.searchParams.delete("page")
            window.location.href = url.toString()
          }}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Merchants</option>
          {merchants.map((m: Record<string, unknown>) => (
            <option key={m.id as string} value={m.id as string}>
              {m.name as string}
            </option>
          ))}
        </select>
      )}
      <select
        name="status"
        defaultValue={currentStatus ?? ""}
        onChange={(e) => {
          const url = new URL(window.location.href)
          if (e.target.value) url.searchParams.set("status", e.target.value)
          else url.searchParams.delete("status")
          url.searchParams.delete("page")
          window.location.href = url.toString()
        }}
        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">All Statuses</option>
        <option value="succeeded">Succeeded</option>
        <option value="payment_failed">Failed</option>
        <option value="requires_capture">Requires Capture</option>
        <option value="processing">Processing</option>
      </select>
    </div>
  )
}
