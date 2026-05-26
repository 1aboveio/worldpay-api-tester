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

export async function createPaymentMethod(input: CreatePaymentMethodInput) {
  return database.paymentMethod.create({ data: input as Record<string, unknown> })
}

export async function getPaymentMethodById(id: string) {
  return database.paymentMethod.findUnique({ where: { id } })
}
