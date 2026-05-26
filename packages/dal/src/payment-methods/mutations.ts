import "server-only"
import { database } from "@repo/database"

export type CreatePaymentMethodInput = {
  id: string
  merchantId: string
  type: string
  tokenHref: string
  brand?: string | null
  last4?: string | null
  expiryMonth?: number | null
  expiryYear?: number | null
  funding?: string | null
  country?: string | null
  cardholderName?: string | null
  billingAddress?: Record<string, unknown> | null
}

export async function createPaymentMethod(input: Record<string, unknown>) {
  return database.paymentMethod.create({ data: input })
}

export async function getPaymentMethodById(id: string) {
  return database.paymentMethod.findUnique({ where: { id } })
}

export async function getPaymentMethodByIdAndMerchant(id: string, merchantId: string) {
  const pm = await database.paymentMethod.findUnique({ where: { id } })
  if (!pm || (pm as any).merchantId !== merchantId) return null
  return pm
}

export async function getLatestCitWithSetupFutureUsage(paymentMethodId: string) {
  return database.paymentIntent.findFirst({
    where: {
      paymentMethodId,
      setupFutureUsage: "off_session",
      status: { in: ["succeeded", "requires_capture"] },
    },
    orderBy: { createdAt: "desc" },
  }) as any
}

export async function getPaymentMethodByIdempotencyKey(merchantId: string, idempotencyKey: string) {
  const pm = await (database.paymentMethod as any).findFirst?.({
    where: { merchantId, idempotencyKey },
  })
  return pm ?? null
}
