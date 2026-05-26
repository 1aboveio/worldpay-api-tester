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
