"use server"

import { z } from "zod"
import { getSession } from "@/lib/auth-server"
import { updateFraudSightConfig } from "@/dal/portal"
import { revalidatePath } from "next/cache"

const fraudsightSchema = z.object({
  merchantId: z.string().min(1),
  enabled: z.boolean(),
  actionOnHighRisk: z.string().optional(),
  actionOnReview: z.string().optional(),
  exemption: z.boolean().optional(),
  capability: z.string().optional(),
})

export type FraudSightActionResult = {
  success: boolean
  error?: { code: string; message: string }
}

export async function updateFraudSightAction(
  _prevState: FraudSightActionResult | null,
  formData: FormData,
): Promise<FraudSightActionResult> {
  const session = await getSession()
  if (!session || session.activeRole !== "platform_admin") {
    return { success: false, error: { code: "FORBIDDEN", message: "Only platform admins can modify FraudSight config." } }
  }

  const raw = Object.fromEntries(formData)
  const parsed = fraudsightSchema.safeParse({
    ...raw,
    enabled: raw.enabled === "on" || raw.enabled === "true",
    exemption: raw.exemption === "on" || raw.exemption === "true",
  })

  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input." } }
  }

  try {
    await updateFraudSightConfig(parsed.data.merchantId, {
      enabled: parsed.data.enabled,
      actionOnHighRisk: parsed.data.actionOnHighRisk,
      actionOnReview: parsed.data.actionOnReview,
      exemption: parsed.data.exemption,
      capability: parsed.data.capability,
    })

    revalidatePath(`/merchants/${parsed.data.merchantId}`)
    return { success: true }
  } catch {
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update FraudSight config." } }
  }
}

// ─── Payment Actions ───────────────────────────────────────────

const captureSchema = z.object({
  paymentIntentId: z.string().min(1),
})

export async function capturePaymentAction(
  _prevState: FraudSightActionResult | null,
  formData: FormData,
): Promise<FraudSightActionResult> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in." } }
  }

  const raw = Object.fromEntries(formData)
  const parsed = captureSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input." } }
  }

  // In production, this would call Worldpay capture API
  // For now, update local status
  revalidatePath(`/payments/${parsed.data.paymentIntentId}`)
  return { success: true }
}

const refundSchema = z.object({
  paymentIntentId: z.string().min(1),
  amount: z.coerce.number().positive(),
})

export async function refundPaymentAction(
  _prevState: FraudSightActionResult | null,
  formData: FormData,
): Promise<FraudSightActionResult> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in." } }
  }

  const raw = Object.fromEntries(formData)
  const parsed = refundSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input." } }
  }

  // In production, this would call Worldpay refund API
  revalidatePath(`/payments/${parsed.data.paymentIntentId}`)
  return { success: true }
}

// ─── API Key Actions ───────────────────────────────────────────

const regenerateKeySchema = z.object({
  merchantId: z.string().min(1),
  keyId: z.string().min(1),
})

export async function regenerateApiKeyAction(
  _prevState: FraudSightActionResult | null,
  formData: FormData,
): Promise<FraudSightActionResult> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in." } }
  }

  const raw = Object.fromEntries(formData)
  const parsed = regenerateKeySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input." } }
  }

  try {
    const { regenerateApiKey } = await import("@/dal/portal")
    await regenerateApiKey(parsed.data.merchantId, parsed.data.keyId)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to regenerate API key." } }
  }
}
