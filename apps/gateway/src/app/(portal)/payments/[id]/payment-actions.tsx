"use client"

import { useActionState, useEffect, useRef } from "react"
import { capturePaymentAction, refundPaymentAction } from "@/app/(portal)/fraudsight-actions"
import { toast } from "sonner"

export function PaymentActions({
  paymentIntentId,
  status,
  amount,
}: {
  paymentIntentId: string
  status: string
  amount: number
}) {
  const [captureState, captureAction, isCapturing] = useActionState(capturePaymentAction, null)
  const [refundState, refundAction, isRefunding] = useActionState(refundPaymentAction, null)

  const prevCapture = useRef<boolean | undefined>(undefined)
  const prevRefund = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    if (captureState?.success && prevCapture.current === false) {
      toast.success("Payment captured")
    } else if (captureState && !captureState.success) {
      toast.error(captureState.error?.message ?? "Capture failed")
    }
    prevCapture.current = captureState?.success
  }, [captureState])

  useEffect(() => {
    if (refundState?.success && prevRefund.current === false) {
      toast.success("Refund initiated")
    } else if (refundState && !refundState.success) {
      toast.error(refundState.error?.message ?? "Refund failed")
    }
    prevRefund.current = refundState?.success
  }, [refundState])

  const showCapture = status === "requires_capture"
  const showRefund = status === "succeeded"

  if (!showCapture && !showRefund) return null

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Actions</h2>
      <div className="flex flex-wrap gap-3">
        {showCapture && (
          <form action={captureAction}>
            <input type="hidden" name="paymentIntentId" value={paymentIntentId} />
            <button
              type="submit"
              disabled={isCapturing}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isCapturing ? "Capturing..." : `Capture ${(amount / 100).toFixed(2)}`}
            </button>
          </form>
        )}
        {showRefund && (
          <form action={refundAction} className="flex items-end gap-2">
            <input type="hidden" name="paymentIntentId" value={paymentIntentId} />
            <div className="flex flex-col gap-1">
              <label htmlFor="refundAmount" className="text-xs text-muted-foreground">
                Amount (max {(amount / 100).toFixed(2)})
              </label>
              <input
                id="refundAmount"
                name="amount"
                type="number"
                defaultValue={amount / 100}
                step="0.01"
                min="0.01"
                max={amount / 100}
                className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={isRefunding}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isRefunding ? "Refunding..." : "Refund"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
