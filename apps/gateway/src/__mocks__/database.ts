// Mock @repo/database for test environment
// This replaces the real database module during tests.

// In-memory store that behaves like Prisma
const store: {
  paymentIntents: Map<string, Record<string, unknown>>
  paymentMethods: Map<string, Record<string, unknown>>
  refunds: Map<string, Record<string, unknown>>
} = {
  paymentIntents: new Map(),
  paymentMethods: new Map(),
  refunds: new Map(),
}

export function resetMockStores() {
  store.paymentIntents.clear()
  store.paymentMethods.clear()
  store.refunds.clear()
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

/** Simple matcher for Prisma where clauses used in tests */
function matchesWhere(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    const recordVal = record[key]
    if (value === null) {
      if (recordVal !== null) return false
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const op = value as Record<string, unknown>
      if ("not" in op) {
        const notVal = op.not
        if (notVal === null) {
          if (recordVal === null) return false
        } else if (recordVal === notVal) return false
      } else {
        if (recordVal !== value) return false
      }
    } else {
      if (recordVal !== value) return false
    }
  }
  return true
}

export const database = {
  paymentIntent: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = withDates(data)
      store.paymentIntents.set(data.id as string, record)
      return record
    },
    findUnique: async ({ where, include }: { where: { id: string }; include?: { paymentMethod?: boolean } }) => {
      const pi = store.paymentIntents.get(where.id)
      if (!pi) return null
      const result = { ...withDates(pi) } as Record<string, unknown>
      if (include?.paymentMethod) {
        const pmId = pi.paymentMethodId as string | undefined
        result.paymentMethod = pmId ? store.paymentMethods.get(pmId) ?? null : null
      }
      return result
    },
    findFirst: async (args: {
      where: Record<string, unknown>
      include?: { paymentMethod?: boolean }
      orderBy?: Record<string, string>
    }) => {
      let matches: Array<{ record: Record<string, unknown>; createdAt: string }> = []

      for (const [, pi] of store.paymentIntents) {
        if (matchesWhere(pi, args.where)) {
          matches.push({
            record: pi,
            createdAt: (pi.createdAt as Date)?.toISOString() ?? "",
          })
        }
      }

      if (args.orderBy) {
        for (const [field, dir] of Object.entries(args.orderBy)) {
          matches.sort((a, b) => {
            const aVal = a.record[field] ?? ""
            const bVal = b.record[field] ?? ""
            if (dir === "desc") return String(bVal).localeCompare(String(aVal))
            return String(aVal).localeCompare(String(bVal))
          })
        }
      }

      const pi = matches[0]?.record
      if (!pi) return null

      const result = { ...withDates(pi) } as Record<string, unknown>
      if (args.include?.paymentMethod) {
        const pmId = pi.paymentMethodId as string | undefined
        result.paymentMethod = pmId ? store.paymentMethods.get(pmId) ?? null : null
      }
      return result
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = store.paymentIntents.get(where.id) ?? {}
      const updated = withDates({ ...existing, ...data })
      store.paymentIntents.set(where.id, updated)
      return updated
    },
    /**
     * Atomically increment totalRefunded on a PaymentIntent.
     * Only succeeds if totalRefunded + amount <= original amount.
     * Returns { totalRefunded: newTotal } or null if the check fails.
     */
    atomicIncrementTotalRefunded: async ({
      id,
      amount,
    }: {
      id: string
      amount: number
    }): Promise<{ totalRefunded: number } | null> => {
      const pi = store.paymentIntents.get(id)
      if (!pi) return null
      const current = (pi.totalRefunded as number) ?? 0
      const originalAmount = pi.amount as number
      if (current + amount > originalAmount) return null
      const newTotal = current + amount
      const updated = { ...pi, totalRefunded: newTotal, updatedAt: new Date() }
      store.paymentIntents.set(id, updated)
      return { totalRefunded: newTotal }
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
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const [, pm] of store.paymentMethods) {
        if (matchesWhere(pm, where)) {
          return pm
        }
      }
      return null
    },
  },
  refund: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = withDates(data)
      store.refunds.set(data.id as string, record)
      return record
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.refunds.get(where.id) ?? null
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const [, refund] of store.refunds) {
        if (matchesWhere(refund, where)) {
          return refund
        }
      }
      return null
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      const results: Record<string, unknown>[] = []
      for (const [, refund] of store.refunds) {
        if (matchesWhere(refund, where)) {
          results.push(refund)
        }
      }
      return results
    },
  },
}
