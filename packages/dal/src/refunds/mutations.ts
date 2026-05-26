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

/**
 * Atomically increment totalRefunded on a PaymentIntent.
 * Only succeeds if totalRefunded + amount <= original amount.
 * Returns the new totalRefunded if successful, or null if the check fails.
 *
 * Production: uses a single UPDATE ... WHERE ... RETURNING query.
 * Mock: in-memory check-and-set (safe in single-threaded test execution).
 */
export async function atomicIncrementTotalRefunded(
  paymentIntentId: string,
  amount: number,
): Promise<number | null> {
  const db = database as unknown as { $queryRawUnsafe?: unknown; paymentIntent?: unknown }

  // Production path — raw SQL for atomic UPDATE WHERE RETURNING
  if (typeof db.$queryRawUnsafe === "function") {
    const rows = await (
      db.$queryRawUnsafe as (
        query: string,
        ...params: unknown[]
      ) => Promise<Array<{ totalRefunded: number }>>
    )(
      `UPDATE "PaymentIntent" SET "totalRefunded" = "totalRefunded" + $1, "updatedAt" = NOW() WHERE "id" = $2 AND "totalRefunded" + $1 <= "amount" RETURNING "totalRefunded"`,
      amount,
      paymentIntentId,
    )
    return rows.length > 0 ? rows[0].totalRefunded : null
  }

  // Mock path — in-memory check-and-set
  const mockPi = db.paymentIntent as Record<string, unknown>
  const fn = mockPi.atomicIncrementTotalRefunded as (
    args: { id: string; amount: number },
  ) => Promise<{ totalRefunded: number } | null>
  const result = await fn({ id: paymentIntentId, amount })
  return result?.totalRefunded ?? null
}
