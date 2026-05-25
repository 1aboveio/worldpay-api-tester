import "server-only"
import { database, type Prisma } from "@repo/database"

export type CreateRefundInput = {
  id: string
  merchantId: string
  paymentIntentId: string
  amount: number
  currency: string
  reason?: string | null
  status: string
  worldpayRefundId?: string | null
  idempotencyKey?: string | null
}

export async function createRefund(input: CreateRefundInput) {
  return database.refund.create({ data: input as Record<string, unknown> })
}

export async function getRefundByIdAndMerchant(id: string, merchantId: string) {
  return database.refund.findFirst({
    where: { id, merchantId },
  })
}

export async function getRefundsByPaymentIntent(paymentIntentId: string) {
  return database.refund.findMany({
    where: { paymentIntentId },
  })
}

export async function getRefundByIdempotencyKey(
  idempotencyKey: string,
  merchantId: string,
) {
  return database.refund.findFirst({
    where: { idempotencyKey, merchantId },
  })
}
