"use client"

import { useActionState, useEffect, useRef } from "react"
import { regenerateApiKeyAction } from "@/app/(portal)/fraudsight-actions"
import { toast } from "sonner"

export function ApiKeyManager({
  merchantId,
  keyId,
}: {
  merchantId: string
  keyId: string
}) {
  const [state, formAction, isPending] = useActionState(regenerateApiKeyAction, null)
  const prevSuccess = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    if (state?.success && prevSuccess.current === false) {
      toast.success("API key regenerated — copy it now as it won't be shown again")
    } else if (state && !state.success) {
      toast.error(state.error?.message ?? "Failed to regenerate key")
    }
    prevSuccess.current = state?.success
  }, [state])

  return (
    <form action={formAction}>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="keyId" value={keyId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Regenerating..." : "Regenerate"}
      </button>
    </form>
  )
}
