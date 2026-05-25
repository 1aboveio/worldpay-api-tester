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
    findMany: async (args: {
      where: Record<string, unknown>
      include?: Record<string, boolean>
      orderBy?: Record<string, string>
      take?: number
    }) => {
      let results = Array.from(store.paymentIntents.values())

      // Filter by merchantId
      if (args.where?.merchantId) {
        results = results.filter((pi) => pi.merchantId === args.where.merchantId)
      }

      // Filter by createdAt >= gte
      if (args.where?.createdAt && typeof args.where.createdAt === "object") {
        const createdAtFilter = args.where.createdAt as { gte?: Date }
        if (createdAtFilter.gte) {
          results = results.filter(
            (pi) => new Date(pi.createdAt as string) >= createdAtFilter.gte!,
          )
        }
      }

      // Sort by orderBy
      if (args.orderBy?.createdAt === "desc") {
        results.sort(
          (a, b) =>
            new Date(b.createdAt as string).getTime() -
            new Date(a.createdAt as string).getTime(),
        )
      }

      // Take
      if (args.take) {
        results = results.slice(0, args.take)
      }

      // Include paymentMethod
      if (args.include?.paymentMethod) {
        return results.map((pi) => {
          const pmId = pi.paymentMethodId as string | undefined
          const pm = pmId ? store.paymentMethods.get(pmId) ?? null : null
          return { ...withDates(pi), paymentMethod: pm }
        })
      }

      return results.map(withDates)
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
