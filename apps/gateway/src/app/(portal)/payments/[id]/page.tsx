import { getSession } from "@/lib/auth-server"
import { getPaymentIntentForPortal } from "@/dal/portal"
import { redirect, notFound } from "next/navigation"
import { PaymentActions } from "./payment-actions"

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/portal/login")

  const { id } = await params
  const pi = await getPaymentIntentForPortal(id)

  if (!pi) notFound()

  // Tenant isolation: merchant users can only see their own
  const isPlatformView = session.activeRole === "platform_admin"
  if (!isPlatformView && pi.merchantId !== session.activeMerchantId) {
    redirect("/portal/payments")
  }

  const pm = pi.paymentMethod as Record<string, unknown> | null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Detail</h1>
        <p className="font-mono text-sm text-muted-foreground">{pi.id as string}</p>
      </div>

      {/* Payment Info */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Payment Info</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="text-lg font-semibold">
              {(pi.amount as number / 100).toFixed(2)} {pi.currency as string}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              pi.status === "succeeded" ? "bg-emerald-100 text-emerald-700" :
              pi.status === "payment_failed" ? "bg-red-100 text-red-700" :
              pi.status === "requires_capture" ? "bg-amber-100 text-amber-700" :
              "bg-muted text-muted-foreground"
            }`}>
              {(pi.status as string).replace(/_/g, " ")}
            </span>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Capture Method</p>
            <p className="text-sm">{pi.captureMethod as string}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="text-sm">{new Date(pi.createdAt as string).toLocaleString()}</p>
          </div>
          {pi.description && (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm">{pi.description as string}</p>
            </div>
          )}
        </div>
      </div>

      {/* Card Details */}
      {pm && (
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Card Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Brand</p>
              <p className="text-sm font-medium capitalize">{pm.brand as string}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last 4</p>
              <p className="font-mono text-sm">•••• {pm.last4 as string}</p>
            </div>
            {pm.expiryMonth && pm.expiryYear && (
              <div>
                <p className="text-sm text-muted-foreground">Expiry</p>
                <p className="text-sm">{String(pm.expiryMonth).padStart(2, "0")}/{pm.expiryYear}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <PaymentActions
        paymentIntentId={pi.id as string}
        status={pi.status as string}
        amount={pi.amount as number}
      />

      {/* Failure Info */}
      {pi.status === "payment_failed" && pi.failureCode && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="mb-2 text-lg font-semibold text-red-800">Payment Failed</h2>
          <p className="text-sm text-red-700">
            Code: {pi.failureCode as string}
          </p>
          {pi.failureMessage && (
            <p className="text-sm text-red-700">{pi.failureMessage as string}</p>
          )}
        </div>
      )}
    </div>
  )
}
