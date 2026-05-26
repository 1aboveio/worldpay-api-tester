// Mock @repo/database for test environment
// This replaces the real database module during tests.

// In-memory store that behaves like Prisma
const store: {
  paymentIntents: Map<string, Record<string, unknown>>
  paymentMethods: Map<string, Record<string, unknown>>
} = {
  paymentIntents: new Map(),
  paymentMethods: new Map(),
}

export function resetMockStores() {
  store.paymentIntents.clear()
  store.paymentMethods.clear()
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
}
