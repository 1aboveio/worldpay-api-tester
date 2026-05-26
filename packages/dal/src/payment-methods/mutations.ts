import "server-only";
import { database } from "@repo/database";
import type { Prisma } from "@repo/database";

export interface CreatePaymentMethodInput {
  id: string;
  merchantId: string;
  idempotencyKey: string;
  worldpayTokenHref: string; // AES-256 encrypted
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  funding: string;
  country?: string;
}

export async function createPaymentMethod(
  input: CreatePaymentMethodInput,
): Promise<Prisma.PaymentMethodGetPayload<{}>> {
  return database.paymentMethod.create({
    data: {
      id: input.id,
      merchantId: input.merchantId,
      worldpayTokenHref: input.worldpayTokenHref,
      idempotencyKey: input.idempotencyKey,
      brand: input.brand,
      last4: input.last4,
      expiryMonth: input.expiryMonth,
      expiryYear: input.expiryYear,
      funding: input.funding,
      country: input.country,
      status: "active",
    },
  });
}

export async function getPaymentMethodByIdempotencyKey(
  merchantId: string,
  idempotencyKey: string,
) {
  if (!idempotencyKey) return null
  return database.paymentMethod.findFirst({
    where: { merchantId, idempotencyKey },
  })
}
