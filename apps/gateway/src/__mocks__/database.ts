// Mock @repo/database for test environment
// This replaces the real database module during tests.

// In-memory store that behaves like Prisma
const store: {
  paymentIntents: Map<string, Record<string, unknown>>
  paymentMethods: Map<string, Record<string, unknown>>
  merchants: Map<string, Record<string, unknown>>
  apiKeys: Map<string, Record<string, unknown>>
} = {
  paymentIntents: new Map(),
  paymentMethods: new Map(),
  merchants: new Map(),
  apiKeys: new Map(),
}

// Seed a default test merchant and API key
const DEFAULT_MERCHANT = {
  id: "merchant_test",
  name: "Test Merchant",
  worldpayEntity: "test_entity",
  payfacSchemeId: "12345",
  subMerchantRef: JSON.stringify({ reference: "sub001", name: "Test Sub", address: { street: "123 Test St", postalCode: "12345", city: "Test", countryCode: "GB" } }),
  subMerchantName: "Test Sub",
  subMerchantAddress: JSON.stringify({ street: "123 Test St", postalCode: "12345", city: "Test", countryCode: "GB" }),
  fraudsightConfig: JSON.stringify({ enabled: true, action_on_high_risk: "block", action_on_review: "proceed" }),
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
}

import { createHash } from "node:crypto"
const DEFAULT_API_KEY_HASH = createHash("sha256").update("sk_test_valid").digest("hex")

const DEFAULT_API_KEY = {
  id: "apikey_test",
  keyHash: DEFAULT_API_KEY_HASH,
  merchantId: "merchant_test",
  createdAt: new Date(),
}

store.merchants.set("merchant_test", DEFAULT_MERCHANT)
store.apiKeys.set(DEFAULT_API_KEY_HASH, DEFAULT_API_KEY)

export function resetMockStores() {
  store.paymentIntents.clear()
  store.paymentMethods.clear()
  // Re-seed merchant and API key
  store.merchants.set("merchant_test", { ...DEFAULT_MERCHANT })
  store.apiKeys.set(DEFAULT_API_KEY_HASH, { ...DEFAULT_API_KEY })
}

export function getMockStore() {
  return store
}

export const PaymentIntentStatus = {
  created: "created",
  processing: "processing",
  tokenizing: "tokenizing",
  tokenized: "tokenized",
  risk_assessing: "risk_assessing",
  risk_assessed: "risk_assessed",
  authorizing: "authorizing",
  requires_capture: "requires_capture",
  succeeded: "succeeded",
  canceled: "canceled",
  payment_failed: "payment_failed",
} as const

function withDates(data: Record<string, unknown>): Record<string, unknown> {
  return {
    ...data,
    createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
    updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(),
  }
}

export const database = {
  paymentIntent: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = withDates(data)
      store.paymentIntents.set(data.id as string, record)
      return record
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      const pi = store.paymentIntents.get(where.id)
      if (!pi) return null
      return { ...withDates(pi), paymentMethod: null }
    },
    findFirst: async ({ where }: { where: { id: string; merchantId: string } }) => {
      const pi = store.paymentIntents.get(where.id)
      if (!pi || pi.merchantId !== where.merchantId) return null
      const pmId = pi.paymentMethodId as string | undefined
      const pm = pmId ? store.paymentMethods.get(pmId) ?? null : null
      return { ...withDates(pi), paymentMethod: pm }
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = store.paymentIntents.get(where.id) ?? {}
      const updated = withDates({ ...existing, ...data })
      store.paymentIntents.set(where.id, updated)
      return updated
    },
  },
  paymentMethod: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      store.paymentMethods.set(data.id as string, data)
      return data
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.paymentMethods.get(where.id) ?? null
    },
  },
  merchant: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.merchants.get(where.id) ?? null
    },
  },
  apiKey: {
    findUnique: async ({ where, include }: { where: { keyHash: string }; include?: { merchant: boolean } }) => {
      const apiKey = store.apiKeys.get(where.keyHash)
      if (!apiKey) return null
      if (include?.merchant) {
        return { ...apiKey, merchant: store.merchants.get(apiKey.merchantId as string) ?? null }
      }
      return apiKey
    },
  },
}
