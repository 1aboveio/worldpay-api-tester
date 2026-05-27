"use server"

import { z } from "zod"
import { headers } from "next/headers"
import { getSession } from "@/lib/auth-server"
import { createCheckoutSession } from "@repo/dal"
import { generateCheckoutSessionId } from "@/lib/id-generator"

export type StartCheckoutResult = {
  success: boolean
  data?: { id: string; url: string }
  error?: { code: string; message: string }
}

const startCheckoutSchema = z.object({
  amount: z.coerce.number().int().min(1, "Amount must be at least 1"),
  currency: z.string().trim().length(3, "Currency must be a 3-letter code"),
  capture_method: z.enum(["automatic", "manual"]).default("automatic"),
  description: z.string().max(500).optional(),
})

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h

async function resolveBaseUrl(): Promise<string> {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "http"
  return host ? `${proto}://${host}` : ""
}

export async function startCheckoutAction(
  _prev: StartCheckoutResult | null,
  formData: FormData,
): Promise<StartCheckoutResult> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in." } }
  }

  // Must act as a specific merchant (platform overview has no active merchant).
  const merchantId = session.activeMerchantId
  if (!merchantId) {
    return {
      success: false,
      error: { code: "NO_MERCHANT", message: "Select a merchant before starting a checkout." },
    }
  }
  // Authorization: the user must have access to this merchant.
  const hasAccess = session.availableMerchants.some((m) => m.merchantId === merchantId)
  if (!hasAccess && !session.isPlatformAdmin) {
    return { success: false, error: { code: "FORBIDDEN", message: "No access to this merchant." } }
  }

  const parsed = startCheckoutSchema.safeParse({
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    capture_method: formData.get("capture_method") ?? "automatic",
    description: formData.get("description") || undefined,
  })
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input." },
    }
  }

  const id = generateCheckoutSessionId()
  await createCheckoutSession({
    id,
    merchantId,
    amount: parsed.data.amount,
    currency: parsed.data.currency.toUpperCase(),
    captureMethod: parsed.data.capture_method,
    description: parsed.data.description ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })

  const base = await resolveBaseUrl()
  return { success: true, data: { id, url: `${base}/checkout/${id}` } }
}
