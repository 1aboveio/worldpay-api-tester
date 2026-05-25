import "server-only"
import { database, type Prisma, PaymentIntentStatus } from "@repo/database"

export type CreatePaymentIntentInput = {
  id: string
  merchantId: string
  amount: number
  currency: string
  status: PaymentIntentStatus
  captureMethod: string
  paymentMethodId?: string | null
  worldpayPaymentId?: string | null
  schemeReference?: string | null
  linkData?: Prisma.JsonValue | null
  failureCode?: string | null
  failureMessage?: string | null
  metadata?: Prisma.JsonValue | null
  idempotencyKey?: string | null
  description?: string | null
  statementDescriptor?: string | null
  setupFutureUsage?: string | null
  customerEmail?: string | null
  customerIpAddress?: string | null
  shipping?: Prisma.JsonValue | null
}

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  return database.paymentIntent.create({ data: input })
}

export async function getPaymentIntentById(id: string) {
  return database.paymentIntent.findUnique({
    where: { id },
    include: { paymentMethod: true },
  })
}

export async function getPaymentIntentByIdAndMerchant(id: string, merchantId: string) {
  return database.paymentIntent.findFirst({
    where: { id, merchantId },
    include: { paymentMethod: true },
  })
}

export type UpdatePaymentIntentStatusInput = {
  id: string
  status: PaymentIntentStatus
  worldpayPaymentId?: string | null
  schemeReference?: string | null
  linkData?: Prisma.JsonValue | null
  failureCode?: string | null
  failureMessage?: string | null
  paymentMethodId?: string | null
}

export async function updatePaymentIntentStatus(input: UpdatePaymentIntentStatusInput) {
  const { id, ...data } = input
  return database.paymentIntent.update({
    where: { id },
    data,
  })
}

/**
 * Find the most recent CIT PaymentIntent for a given payment method token
 * that has setup_future_usage = "off_session" and a valid schemeReference.
 * Used by MIT flow to verify the token is set up for off-session payments.
 */
export async function getLatestCitWithSetupFutureUsage(
  paymentMethodId: string,
  merchantId: string,
) {
  return database.paymentIntent.findFirst({
    where: {
      paymentMethodId,
      merchantId,
      setupFutureUsage: "off_session",
      schemeReference: { not: null },
    },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Check if any PaymentIntent (CIT) exists for a given payment method.
 * Used to distinguish "no CIT at all" (mit_requires_cit) from
 * "CIT exists but not set up" (mit_not_setup).
 */
export async function getAnyPaymentIntentForPaymentMethod(
  paymentMethodId: string,
  merchantId: string,
) {
  return database.paymentIntent.findFirst({
    where: {
      paymentMethodId,
      merchantId,
    },
  })
}
