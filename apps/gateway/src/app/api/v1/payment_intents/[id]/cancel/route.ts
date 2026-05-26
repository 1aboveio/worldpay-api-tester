import { NextRequest } from "next/server"
import { handleCancelPaymentIntent } from "@/lib/payment-intent-service"
import type { PaymentIntentServiceDeps } from "@/lib/payment-intent-service"

const defaultDeps: Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant"> = {
  wpCall: async () => {
    throw new Error("wpCall not configured")
  },
  resolveMerchant: async () => {
    throw new Error("resolveMerchant not configured")
  },
}

let overrides: Partial<Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant">> | null = null

export function __setDeps(deps: Partial<Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant">>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

function getDeps(): Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant"> {
  return { ...defaultDeps, ...overrides }
}

function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const apiKey = extractApiKey(request)
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key") ?? null
  return handleCancelPaymentIntent(id, apiKey, idempotencyKey, getDeps())
}
