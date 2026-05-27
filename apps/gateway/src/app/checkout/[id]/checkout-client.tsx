"use client"

import { useCallback, useState } from "react"

type Phase = "idle" | "submitting" | "succeeded" | "authorized" | "failed"

// Worldpay "Try" sandbox test cards. Outcome ultimately depends on your sandbox
// config; these are standard PANs for exercising the flow.
const TEST_CARDS: Array<{ label: string; number: string; expiry: string; cvc: string }> = [
  { label: "Visa", number: "4444333322221111", expiry: "12/29", cvc: "123" },
  { label: "Mastercard", number: "5500000000000004", expiry: "12/29", cvc: "123" },
]

const inputCls =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function formatPan(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 19)
  return digits.replace(/(.{4})/g, "$1 ").trim()
}

function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 4)
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function CheckoutClient({
  csId,
  merchantName,
  amountLabel,
  description,
}: {
  csId: string
  merchantName: string
  amountLabel: string
  description: string | null
}) {
  const [pan, setPan] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState<string | null>(null)

  function applyTestCard(c: (typeof TEST_CARDS)[number]) {
    setPan(formatPan(c.number))
    setExpiry(c.expiry)
    setCvc(c.cvc)
    setMessage(null)
  }

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (phase === "submitting") return

      const digits = pan.replace(/\D/g, "")
      const [mm, yy] = expiry.split("/")
      const month = Number(mm)
      // Accept 2- or 4-digit year.
      const year = yy && yy.length === 2 ? 2000 + Number(yy) : Number(yy)

      if (digits.length < 12 || !month || !year || cvc.length < 3) {
        setPhase("failed")
        setMessage("Please enter a valid card number, expiry (MM/YY) and CVC.")
        return
      }

      setPhase("submitting")
      setMessage(null)
      try {
        const res = await fetch(`/api/checkout/${csId}/pay`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            number: digits,
            expiry_month: month,
            expiry_year: year,
            cvc,
          }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          status?: string
          failure_message?: string
          error?: { message?: string }
        }

        if (data.status === "succeeded") {
          setPhase("succeeded")
        } else if (data.status === "requires_capture") {
          setPhase("authorized")
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
    },
    [csId, pan, expiry, cvc, phase],
  )

  const done = phase === "succeeded" || phase === "authorized"

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
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
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick fill:</span>
              {TEST_CARDS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => applyTestCard(c)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-accent"
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="text-sm font-medium" htmlFor="pan">
              Card number
            </label>
            <input
              id="pan"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4444 3333 2222 1111"
              className={inputCls}
              value={pan}
              onChange={(e) => setPan(formatPan(e.target.value))}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="expiry">
                  Expiry
                </label>
                <input
                  id="expiry"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  className={inputCls}
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="cvc">
                  CVC
                </label>
                <input
                  id="cvc"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  maxLength={4}
                  className={inputCls}
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            </div>

            {message && <p className="text-sm text-destructive">{message}</p>}

            <button
              type="submit"
              disabled={phase === "submitting"}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {phase === "submitting" ? "Processing…" : `Pay ${amountLabel}`}
            </button>

            <p className="mt-1 text-center text-xs text-muted-foreground">
              Sandbox checkout · use a Worldpay test card
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
