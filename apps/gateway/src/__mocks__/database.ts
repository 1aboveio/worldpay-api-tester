// Mock @repo/database for test environment
// This replaces the real database module during tests.

// In-memory store that behaves like Prisma
const store: {
  paymentIntents: Map<string, Record<string, unknown>>
  paymentMethods: Map<string, Record<string, unknown>>
  merchants: Map<string, Record<string, unknown>>
  apiKeys: Map<string, Record<string, unknown>>
  users: Map<string, Record<string, unknown>>
  userMerchants: Map<string, Record<string, unknown>>
  refunds: Map<string, Record<string, unknown>>
  statements: Map<string, Record<string, unknown>>
} = {
  paymentIntents: new Map(),
  paymentMethods: new Map(),
  merchants: new Map(),
  apiKeys: new Map(),
  users: new Map(),
  userMerchants: new Map(),
  refunds: new Map(),
  statements: new Map(),
}

export function resetMockStores() {
  store.paymentIntents.clear()
  store.paymentMethods.clear()
  store.merchants.clear()
  store.apiKeys.clear()
  store.users.clear()
  store.userMerchants.clear()
  store.refunds.clear()
  store.statements.clear()
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

function makeId(): string {
  return `mock_${Math.random().toString(36).slice(2, 10)}`
}

// Helper to seed test data
export function seedMerchant(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.merchants.set(id, { ...data, id, createdAt: new Date(), updatedAt: new Date() })
  return id
}

export function seedApiKey(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.apiKeys.set(id, { ...data, id, merchantId: data.merchantId, createdAt: new Date(), updatedAt: new Date() })
  return id
}

export function seedUser(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.users.set(id, { ...data, id, createdAt: new Date(), updatedAt: new Date() })
  return id
}

export function seedUserMerchant(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.userMerchants.set(id, { ...data, id, createdAt: new Date() })
  return id
}

export function seedRefund(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.refunds.set(id, { ...data, id, createdAt: new Date(), updatedAt: new Date() })
  return id
}

export function seedStatement(data: Record<string, unknown>): string {
  const id = (data.id as string) || makeId()
  store.statements.set(id, { ...data, id, createdAt: new Date(), updatedAt: new Date() })
  return id
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
    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; skip?: number; take?: number }) => {
      let results = Array.from(store.paymentIntents.values()).map(withDates)
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(p => p.merchantId === w.merchantId)
        if (w.status !== undefined) results = results.filter(p => p.status === w.status)
      }
      if (opts?.orderBy) {
        results.sort((a, b) => {
          const aVal = (a as Record<string, unknown>).createdAt as Date
          const bVal = (b as Record<string, unknown>).createdAt as Date
          return bVal.getTime() - aVal.getTime()
        })
      }
      const total = results.length
      if (opts?.skip) results = results.slice(opts.skip as number)
      if (opts?.take) results = results.slice(0, opts.take as number)
      return results
    },
    count: async (opts?: { where?: Record<string, unknown> }) => {
      let results = Array.from(store.paymentIntents.values())
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(p => p.merchantId === w.merchantId)
        if (w.status !== undefined) results = results.filter(p => p.status === w.status)
      }
      return results.length
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
    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      let results = Array.from(store.paymentMethods.values())
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(p => p.merchantId === w.merchantId)
      }
      if (opts?.orderBy?.createdAt === "desc") {
        results.sort((a, b) => {
          return ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0)
        })
      }
      return results
    },
    count: async (opts?: { where?: Record<string, unknown> }) => {
      let results = Array.from(store.paymentMethods.values())
      if (opts?.where?.merchantId !== undefined) results = results.filter(p => p.merchantId === opts!.where!.merchantId)
      return results.length
    },
  },
  merchant: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.merchants.get(where.id) ?? null
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const m of store.merchants.values()) {
        if (Object.entries(where).every(([k, v]) => m[k] === v)) return m
      }
      return null
    },
    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; include?: Record<string, boolean> }) => {
      let results = Array.from(store.merchants.values())
      if (opts?.where) {
        const w = opts.where
        if (w.id !== undefined && typeof w.id === "object" && "in" in w.id) {
          const ids = (w.id as { in: string[] }).in
          results = results.filter(m => ids.includes(m.id as string))
        }
      }
      if (opts?.orderBy?.name === "asc") results.sort((a, b) => String(a.name).localeCompare(String(b.name)))
      return results.map(m => {
        const result = { ...m }
        if (opts?.include?.apiKeys) {
          const keys = Array.from(store.apiKeys.values()).filter(k => k.merchantId === m.id)
          result.apiKeys = keys
        }
        return result
      })
    },
    count: async () => store.merchants.size,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = store.merchants.get(where.id) ?? {}
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.merchants.set(where.id, updated)
      return updated
    },
  },
  apiKey: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.apiKeys.get(where.id) ?? null
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const k of store.apiKeys.values()) {
        if (Object.entries(where).every(([key, v]) => k[key] === v)) return k
      }
      return null
    },
    findMany: async (opts?: { where?: Record<string, unknown> }) => {
      let results = Array.from(store.apiKeys.values())
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(k => k.merchantId === w.merchantId)
        if (w.isActive !== undefined) results = results.filter(k => k.isActive === w.isActive)
      }
      return results
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) || makeId()
      const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() }
      store.apiKeys.set(id, record)
      return record
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = store.apiKeys.get(where.id) ?? {}
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.apiKeys.set(where.id, updated)
      return updated
    },
  },
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
      for (const u of store.users.values()) {
        if (where.id && u.id === where.id) return u
        if (where.email && u.email === where.email) return u
      }
      return null
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) || makeId()
      const record = withDates({ ...data, id, emailVerified: data.emailVerified ?? false })
      store.users.set(id, record)
      return record
    },
  },
  userMerchant: {
    findMany: async (opts?: { where?: Record<string, unknown>; include?: Record<string, boolean | Record<string, unknown>> }) => {
      let results = Array.from(store.userMerchants.values())
      if (opts?.where) {
        const w = opts.where
        if (w.userId !== undefined) results = results.filter(um => um.userId === w.userId)
        if (w.merchantId !== undefined) results = results.filter(um => um.merchantId === w.merchantId)
        if (w.role !== undefined) results = results.filter(um => um.role === w.role)
      }
      return results.map(um => {
        const result = { ...um }
        if (opts?.include?.merchant) {
          result.merchant = store.merchants.get(um.merchantId as string) ?? null
        }
        return result
      })
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const um of store.userMerchants.values()) {
        if (Object.entries(where).every(([k, v]) => um[k] === v)) return um
      }
      return null
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = (data.id as string) || makeId()
      const record = { ...data, id, createdAt: new Date() }
      store.userMerchants.set(id, record)
      return record
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const toDelete: string[] = []
      for (const [id, um] of store.userMerchants) {
        if (Object.entries(where).every(([k, v]) => um[k] === v)) toDelete.push(id)
      }
      for (const id of toDelete) store.userMerchants.delete(id)
      return { count: toDelete.length }
    },
  },
  refund: {
    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; include?: Record<string, boolean> }) => {
      let results = Array.from(store.refunds.values())
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(r => r.merchantId === w.merchantId)
        if (w.paymentIntentId !== undefined) results = results.filter(r => r.paymentIntentId === w.paymentIntentId)
      }
      if (opts?.orderBy?.createdAt === "desc") {
        results.sort((a, b) => ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0))
      }
      return results.map(r => {
        const result = { ...r }
        if (opts?.include?.paymentIntent) {
          result.paymentIntent = store.paymentIntents.get(r.paymentIntentId as string) ?? null
        }
        return result
      })
    },
    count: async (opts?: { where?: Record<string, unknown> }) => {
      let results = Array.from(store.refunds.values())
      if (opts?.where?.merchantId !== undefined) results = results.filter(r => r.merchantId === opts!.where!.merchantId)
      return results.length
    },
  },
  statement: {
    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      let results = Array.from(store.statements.values())
      if (opts?.where) {
        const w = opts.where
        if (w.merchantId !== undefined) results = results.filter(s => s.merchantId === w.merchantId)
      }
      if (opts?.orderBy?.createdAt === "desc") {
        results.sort((a, b) => ((b.createdAt as Date)?.getTime() ?? 0) - ((a.createdAt as Date)?.getTime() ?? 0))
      }
      return results
    },
    count: async (opts?: { where?: Record<string, unknown> }) => {
      let results = Array.from(store.statements.values())
      if (opts?.where?.merchantId !== undefined) results = results.filter(s => s.merchantId === opts!.where!.merchantId)
      return results.length
    },
  },
}
