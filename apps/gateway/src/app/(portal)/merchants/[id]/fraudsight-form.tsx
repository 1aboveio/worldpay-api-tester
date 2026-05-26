"use client"

import { useActionState, useEffect, useRef } from "react"
import { updateFraudSightAction } from "@/app/(portal)/fraudsight-actions"
import { toast } from "sonner"

type FraudSightState = {
  enabled: boolean
  actionOnHighRisk: string
  actionOnReview: string
  exemption: boolean
  capability: string
}

export function FraudSightConfigForm({
  merchantId,
  fraudsight,
}: {
  merchantId: string
  fraudsight: FraudSightState
}) {
  const [state, formAction, isPending] = useActionState(updateFraudSightAction, null)
  const prevSuccess = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    if (state?.success && prevSuccess.current === false) {
      toast.success("FraudSight config updated")
    } else if (state && !state.success) {
      toast.error(state.error?.message ?? "Update failed")
    }
    prevSuccess.current = state?.success
  }, [state])

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="merchantId" value={merchantId} />

      {/* Enabled Switch */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">Enable FraudSight</p>
          <p className="text-sm text-muted-foreground">
            Run fraud assessments on every payment
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={fraudsight.enabled}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2" />
        </label>
      </div>

      {/* Action on High Risk */}
      <div className="flex flex-col gap-2">
        <label htmlFor="actionOnHighRisk" className="text-sm font-medium">
          Action on High Risk
        </label>
        <select
          id="actionOnHighRisk"
          name="actionOnHighRisk"
          defaultValue={fraudsight.actionOnHighRisk}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="monitor">Monitor only</option>
          <option value="block">Block payment</option>
          <option value="review">Flag for review</option>
        </select>
      </div>

      {/* Action on Review */}
      <div className="flex flex-col gap-2">
        <label htmlFor="actionOnReview" className="text-sm font-medium">
          Action on Review
        </label>
        <select
          id="actionOnReview"
          name="actionOnReview"
          defaultValue={fraudsight.actionOnReview}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="monitor">Monitor only</option>
          <option value="block">Block payment</option>
          <option value="manual_review">Manual review required</option>
        </select>
      </div>

      {/* Exemption */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">Enable Exemption</p>
          <p className="text-sm text-muted-foreground">
            Allow exemption requests for trusted customers
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            name="exemption"
            defaultChecked={fraudsight.exemption}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2" />
        </label>
      </div>

      {/* Capability */}
      <div className="flex flex-col gap-2">
        <label htmlFor="capability" className="text-sm font-medium">
          FraudSight Capability
        </label>
        <select
          id="capability"
          name="capability"
          defaultValue={fraudsight.capability}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="risk_assessment">Risk Assessment</option>
          <option value="full_screening">Full Screening</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save FraudSight Config"}
      </button>
    </form>
  )
}
