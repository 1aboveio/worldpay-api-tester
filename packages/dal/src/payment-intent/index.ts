import prisma from "../client.js";
import type { ThreeDSInjection } from "@payfac/worldpay-client";

export interface PaymentIntentRecord {
  id: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  captureMethod: string;
  tokenHref: string | null;
  threeDSStatus: string | null;
  threeDSVersion: string | null;
  threeDSEci: string | null;
  threeDSAuthValue: string | null;
  threeDSTransactionId: string | null;
  riskProfileHref: string | null;
  worldpayPaymentId: string | null;
  schemeReference: string | null;
  issuerAuthCode: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  cardFunding: string | null;
  cardCountry: string | null;
  merchantReturnUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function findPaymentIntent(
  id: string
): Promise<PaymentIntentRecord | null> {
  return prisma.paymentIntent.findUnique({ where: { id } }) as Promise<PaymentIntentRecord | null>;
}

export async function findPaymentIntentWithMerchant(id: string) {
  return prisma.paymentIntent.findUnique({
    where: { id },
    include: { merchant: true },
  });
}

export async function updatePaymentIntentStatus(
  id: string,
  status: string,
  extra?: Record<string, unknown>
) {
  return prisma.paymentIntent.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function storePaymentResult(
  id: string,
  data: {
    status: string;
    worldpayPaymentId?: string;
    schemeReference?: string;
    issuerAuthCode?: string;
    threeDSStatus?: string;
    threeDSVersion?: string;
    threeDSEci?: string;
    threeDSAuthValue?: string;
    threeDSTransactionId?: string;
    failureCode?: string;
    failureMessage?: string;
  }
) {
  return prisma.paymentIntent.update({
    where: { id },
    data: {
      status: data.status,
      worldpayPaymentId: data.worldpayPaymentId ?? null,
      schemeReference: data.schemeReference ?? null,
      issuerAuthCode: data.issuerAuthCode ?? null,
      threeDSStatus: data.threeDSStatus ?? null,
      threeDSVersion: data.threeDSVersion ?? null,
      threeDSEci: data.threeDSEci ?? null,
      threeDSAuthValue: data.threeDSAuthValue ?? null,
      threeDSTransactionId: data.threeDSTransactionId ?? null,
      failureCode: data.failureCode ?? null,
      failureMessage: data.failureMessage ?? null,
    },
  });
}

export async function storeThreeDSResult(
  id: string,
  result: ThreeDSInjection & { status: string }
) {
  return prisma.paymentIntent.update({
    where: { id },
    data: {
      threeDSStatus: result.status,
      threeDSVersion: result.version,
      threeDSEci: result.eci,
      threeDSAuthValue: result.authenticationValue,
      threeDSTransactionId: result.transactionId,
    },
  });
}
