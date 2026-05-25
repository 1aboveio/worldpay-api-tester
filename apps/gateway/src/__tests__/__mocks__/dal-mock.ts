/**
 * Mock DAL for integration tests.
 *
 * Provides an in-memory store for PaymentMethods.
 * Used as a vitest alias to avoid resolving the real @repo/dal → @repo/database dependencies.
 */

interface PaymentMethodRecord {
  id: string;
  merchantId: string;
  idempotencyKey: string;
  worldpayTokenHref: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  funding: string;
  country: string | null;
  status: string;
  createdAt: Date;
}

const store = new Map<string, PaymentMethodRecord>();
const idempotencyIndex = new Map<string, string>(); // key: "merchantId:idempotencyKey" → pm.id

export async function createPaymentMethod(input: {
  id: string;
  merchantId: string;
  idempotencyKey: string;
  worldpayTokenHref: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  funding: string;
  country?: string;
}) {
  // Idempotency: check if same merchant + same idempotency key exists
  const ikKey = `${input.merchantId}:${input.idempotencyKey}`;
  const existingId = idempotencyIndex.get(ikKey);
  if (existingId) {
    return store.get(existingId)!;
  }

  const record: PaymentMethodRecord = {
    ...input,
    country: input.country ?? null,
    status: "active",
    createdAt: new Date("2026-05-25T08:00:00Z"),
  };
  store.set(input.id, record);
  idempotencyIndex.set(ikKey, input.id);
  return record;
}

export async function getPaymentMethodById(id: string) {
  return store.get(id) ?? null;
}

export async function getPaymentMethodByIdempotencyKey(
  merchantId: string,
  idempotencyKey: string,
) {
  const ikKey = `${merchantId}:${idempotencyKey}`;
  const existingId = idempotencyIndex.get(ikKey);
  return existingId ? (store.get(existingId) ?? null) : null;
}

export async function getTokenHref(id: string): Promise<string | null> {
  return store.get(id)?.worldpayTokenHref ?? null;
}

// Expose store for test cleanup
export function __resetStore() {
  store.clear();
  idempotencyIndex.clear();
}
