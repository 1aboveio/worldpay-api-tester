import "server-only"
import { database } from "@repo/database"

export type CreateCheckoutSessionInput = {
  id: string
  merchantId: string
  amount: number
  currency: string
  captureMethod: string
  description?: string | null
  expiresAt: Date
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput) {
  return database.checkoutSession.create({ data: input })
}

/**
 * Atomically claim an open session for processing. Returns true only if this
 * call won the race (status was "open"); a second concurrent payment gets false.
 * This is the single-use / double-pay guard for the public pay endpoint.
 */
export async function markCheckoutSessionProcessing(id: string): Promise<boolean> {
  const result = await database.checkoutSession.updateMany({
    where: { id, status: "open" },
    data: { status: "processing" },
  })
  return result.count === 1
}

export async function completeCheckoutSession(id: string, paymentIntentId: string) {
  return database.checkoutSession.update({
    where: { id },
    data: { status: "completed", paymentIntentId },
  })
}

/** Release a claimed session back to "open" so the shopper can retry (e.g. decline). */
export async function reopenCheckoutSession(id: string) {
  return database.checkoutSession.update({
    where: { id },
    data: { status: "open" },
  })
}
