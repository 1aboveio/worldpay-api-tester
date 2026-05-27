"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"

// Worldpay Access Checkout SDK is loaded from a remote script; it attaches a
// `Worldpay` global. We only touch the small surface we use.
declare global {
  interface Window {
    Worldpay?: {
      checkout: {
        init: (
          config: unknown,
          callback: (error: unknown, checkout: WorldpayCheckout | null) => void,
        ) => void
      }
    }
  }
}

type WorldpayCheckout = {
  generateSessions: (
    callback: (error: unknown, sessions: { card?: string; cvv?: string }) => void,
  ) => void
}

type Phase = "idle" | "submitting" | "succeeded" | "authorized" | "failed"

const fieldShell =
  "h-11 w-full rounded-md border border-input bg-background px-3 [&_iframe]:h-full [&_iframe]:w-full"

export function CheckoutClient({
  csId,
  checkoutId,
  sdkSrc,
  merchantName,
  amountLabel,
  description,
}: {
  csId: string
  checkoutId: string
  sdkSrc: string
  merchantName: string
  amountLabel: string
  description: string | null
}) {
  const [scriptReady, setScriptReady] = useState(false)
  const [fieldsReady, setFieldsReady] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const checkoutRef = useRef<WorldpayCheckout | null>(null)

  // Initialize the hosted fields once the SDK script has loaded and the target
  // DOM nodes exist (after mount). Guard against double-init.
  useEffect(() => {
    if (!scriptReady || checkoutRef.current || !checkoutId) return
    const wp = window.Worldpay
    if (!wp) return

    wp.checkout.init(
      {
        id: checkoutId,
        form: "#card-form",
        fields: {
          pan: { selector: "#card-pan", placeholder: "Card number" },
          expiry: { selector: "#card-expiry", placeholder: "MM/YY" },
          cvv: { selector: "#card-cvv", placeholder: "CVC" },
        },
      },
      (error, checkout) => {
        if (error || !checkout) {
          setMessage("Could not load the secure card fields. Please refresh and try again.")
          return
        }
        checkoutRef.current = checkout
        setFieldsReady(true)
      },
    )
  }, [scriptReady, checkoutId])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const checkout = checkoutRef.current
      if (!checkout || phase === "submitting") return

      setPhase("submitting")
      setMessage(null)

      checkout.generateSessions(async (error, sessions) => {
        if (error || !sessions?.card) {
          setPhase("failed")
          setMessage("Please check your card details and try again.")
          return
        }
        try {
          const res = await fetch(`/api/checkout/${csId}/pay`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ session_href: sessions.card }),
          })
          const data = (await res.json().catch(() => ({}))) as {
            status?: string
            failure_message?: string
            error?: { message?: string }
          }

          if (data.status === "succeeded") {
            setPhase("succeeded")
            setMessage(null)
          } else if (data.status === "requires_capture") {
            setPhase("authorized")
            setMessage(null)
          } else {
            setPhase("failed")
            setMessage(
              data.failure_message ??
                data.error?.message ??
                "Your payment could not be completed. Please try again.",
            )
          }
        } catch {
          setPhase("failed")
          setMessage("Something went wrong. Please try again.")
        }
      })
    },
    [csId, phase],
  )

  const done = phase === "succeeded" || phase === "authorized"

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Script src={sdkSrc} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />

      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-sm ring-1 ring-foreground/10">
        {/* Order summary */}
        <div className="mb-6 border-b pb-4">
          <p className="text-sm text-muted-foreground">{merchantName}</p>
          <p className="mt-1 text-3xl font-bold">{amountLabel}</p>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        {done ? (
          <div className="py-6 text-center">
            <div className="text-4xl">✅</div>
            <h1 className="mt-3 text-lg font-semibold">
              {phase === "succeeded" ? "Payment successful" : "Payment authorized"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {phase === "succeeded"
                ? "Thank you — your payment is complete."
                : "Your card was authorized and will be captured shortly."}
            </p>
          </div>
        ) : (
          <form id="card-form" onSubmit={onSubmit} className="flex flex-col gap-3">
            {!checkoutId && (
              <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
                Hosted checkout is not configured (missing WORLDPAY_CHECKOUT_ID).
              </p>
            )}

            <label className="text-sm font-medium" htmlFor="card-pan">
              Card number
            </label>
            <div id="card-pan" className={fieldShell} />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="card-expiry">
                  Expiry
                </label>
                <div id="card-expiry" className={fieldShell} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="card-cvv">
                  CVC
                </label>
                <div id="card-cvv" className={fieldShell} />
              </div>
            </div>

            {message && <p className="text-sm text-destructive">{message}</p>}

            <button
              type="submit"
              disabled={!fieldsReady || phase === "submitting"}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {phase === "submitting"
                ? "Processing…"
                : fieldsReady
                  ? `Pay ${amountLabel}`
                  : "Loading secure fields…"}
            </button>

            <p className="mt-1 text-center text-xs text-muted-foreground">
              Secured by Worldpay · card details never touch this site
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
