"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { startCheckoutAction, type StartCheckoutResult } from "./actions"

const inputBase =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function StartCheckoutForm() {
  const [state, formAction, isPending] = useActionState<StartCheckoutResult | null, FormData>(
    startCheckoutAction,
    null,
  )
  const prevSuccess = useRef<boolean | undefined>(undefined)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state && !state.success) {
      toast.error(state.error?.message ?? "Could not start checkout")
    } else if (state?.success && prevSuccess.current === false) {
      toast.success("Checkout link created")
    }
    prevSuccess.current = state?.success
  }, [state])

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Could not copy link")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Amount (minor units, e.g. cents)</Label>
          <Input id="amount" name="amount" type="number" min={1} defaultValue={4200} required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="currency">Currency</Label>
          <select id="currency" name="currency" defaultValue="USD" className={inputBase}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="capture_method">Capture</Label>
          <select id="capture_method" name="capture_method" defaultValue="automatic" className={inputBase}>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual (authorize only)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description (optional)</Label>
          <Input id="description" name="description" type="text" maxLength={500} placeholder="Order #1234" />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Start checkout"}
          </Button>
        </div>
      </form>

      {state?.success && state.data && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">Shareable checkout link</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">{state.data.url}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copyLink(state.data!.url)}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button type="button" size="sm" render={<a href={state.data.url} target="_blank" rel="noreferrer" />}>
              Open ↗
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
