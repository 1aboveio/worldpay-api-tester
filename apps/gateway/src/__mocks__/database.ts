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
// Seed a second merchant for cross-merchant tests
const MERCHANT2 = { ...DEFAULT_MERCHANT, id: "merchant_2", name: "Merchant 2" }
const MERCHANT2_API_KEY_HASH = createHash("sha256").update("sk_test_merchant2").digest("hex")
store.merchants.set("merchant_2", MERCHANT2)
store.apiKeys.set(MERCHANT2_API_KEY_HASH, { id: "apikey_2", keyHash: MERCHANT2_API_KEY_HASH, merchantId: "merchant_2", createdAt: new Date() })

export function resetMockStores() {
  store.paymentIntents.clear()
  store.paymentMethods.clear()
  // Re-seed merchant and API key
  store.merchants.set("merchant_test", { ...DEFAULT_MERCHANT })
  store.apiKeys.set(DEFAULT_API_KEY_HASH, { ...DEFAULT_API_KEY })
  store.merchants.set("merchant_2", { ...MERCHANT2 })
  store.apiKeys.set(MERCHANT2_API_KEY_HASH, { id: "apikey_2", keyHash: MERCHANT2_API_KEY_HASH, merchantId: "merchant_2", createdAt: new Date() })
  // Clear other stores
  ;(store as any).users?.clear()
  ;(store as any).userMerchants?.clear()
  ;(store as any).auditLogs = []
}

export function seedMerchant(data: Record<string, unknown>): string {
  const id = (data.id as string) || `merchant_${Date.now()}`
  store.merchants.set(id, {
    id,
    name: data.name || "Test Merchant",
    worldpayEntity: data.worldpayEntity || "test_entity",
    payfacSchemeId: data.payfacSchemeId || "12345",
    subMerchantRef: data.subMerchantRef || null,
    subMerchantName: data.subMerchantName || null,
    subMerchantAddress: data.subMerchantAddress || null,
    fraudsightConfig: data.fraudsightConfig || null,
    status: data.status || "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

export function seedApiKey(data: Record<string, unknown>): string {
  const id = (data.id as string) || `apikey_${Date.now()}`
  const keyHash = (data.keyHash as string) || createHash("sha256").update("sk_test_valid").digest("hex")
  store.apiKeys.set(keyHash, {
    id,
    keyHash,
    merchantId: data.merchantId as string,
    createdAt: new Date(),
  })
  return id
}

export function seedUser(data: Record<string, unknown>): string {
  const id = (data.id as string) || `user_${Date.now()}`
  if (!store.users) (store as any).users = new Map()
  ;(store as any).users.set(id, { id, email: data.email, name: data.name || "", emailVerified: false, createdAt: new Date(), updatedAt: new Date() })
  return id
}

export function seedUserMerchant(_data: Record<string, unknown>): string {
  return `um_${Date.now()}`
}

export function seedRefund(_data: Record<string, unknown>): string {
  return `rf_${Date.now()}`
}

export function seedStatement(_data: Record<string, unknown>): string {
  return `stmt_${Date.now()}`
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
      const pmId = pi.paymentMethodId as string | undefined
      const pm = pmId ? store.paymentMethods.get(pmId) ?? null : null
      return { ...withDates(pi), paymentMethod: pm }
    },
    findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      const pis = Array.from(store.paymentIntents.values())
      for (const pi of pis) {
        let match = true
        for (const [k, v] of Object.entries(where)) {
          if (pi[k] !== v) { match = false; break }
        }
        if (match) {
          const pmId = pi.paymentMethodId as string | undefined
          const pm = pmId ? store.paymentMethods.get(pmId) ?? null : null
          return { ...withDates(pi), paymentMethod: pm }
        }
      }
      return null
    },
    findMany: async ({ where, orderBy, take, skip, include }: { where?: Record<string, unknown>; orderBy?: Record<string, string>; take?: number; skip?: number; include?: Record<string, boolean> }) => {
      let pis = Array.from(store.paymentIntents.values())
      if (where) {
        pis = pis.filter(pi => {
          for (const [k, v] of Object.entries(where)) {
            if (pi[k] !== v) return false
          }
          return true
        })
      }
      if (orderBy?.createdAt) {
        pis.sort((a, b) => {
          const aDate = (a as any).createdAt?.getTime?.() ?? 0
          const bDate = (b as any).createdAt?.getTime?.() ?? 0
          return orderBy.createdAt === "desc" ? bDate - aDate : aDate - bDate
        })
      }
      if (skip) pis = pis.slice(skip as number)
      if (take) pis = pis.slice(0, take as number)
      return pis.map(pi => {
        const pmId = pi.paymentMethodId as string | undefined
        const pm = (include?.paymentMethod && pmId) ? store.paymentMethods.get(pmId) ?? null : null
        return { ...withDates(pi), paymentMethod: pm }
      })
    },
    count: async ({ where }: { where?: Record<string, unknown> }) => {
      if (!where) return store.paymentIntents.size
      let count = 0
      for (const pi of store.paymentIntents.values()) {
        let match = true
        for (const [k, v] of Object.entries(where)) {
          if (pi[k] !== v) { match = false; break }
        }
        if (match) count++
      }
      return count
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
      const record = { status: "active", ...data, createdAt: new Date(), updatedAt: new Date() }
      store.paymentMethods.set(data.id as string, record)
      return record
    },
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.paymentMethods.get(where.id) ?? null
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const pm of store.paymentMethods.values()) {
        let match = true
        for (const [k, v] of Object.entries(where)) {
          if ((pm as any)[k] !== v) { match = false; break }
        }
        if (match) return pm
      }
      return null
    },
    findMany: async ({ where }: { where?: Record<string, unknown> }) => {
      const pms = Array.from(store.paymentMethods.values())
      if (!where) return pms
      return pms.filter(pm => {
        for (const [k, v] of Object.entries(where)) {
          if ((pm as any)[k] !== v) return false
        }
        return true
      })
    },
  },
  refund: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (!(store as any).refunds) (store as any).refunds = new Map()
      ;(store as any).refunds.set(data.id, { ...data, createdAt: new Date() })
      return data
    },
    findMany: async ({ where }: { where?: Record<string, unknown> }) => {
      if (!(store as any).refunds) return []
      const refunds = Array.from((store as any).refunds.values())
      if (!where) return refunds
      return refunds.filter((r: any) => {
        for (const [k, v] of Object.entries(where)) {
          if (r[k] !== v) return false
        }
        return true
      })
    },
    count: async ({ where }: { where?: Record<string, unknown> }) => {
      if (!(store as any).refunds) return 0
      const refunds = Array.from((store as any).refunds.values())
      if (!where) return refunds.length
      return refunds.filter((r: any) => {
        for (const [k, v] of Object.entries(where)) {
          if (r[k] !== v) return false
        }
        return true
      }).length
    },
  },
  statement: {
    findMany: async ({ where, take, skip }: { where?: Record<string, unknown>; take?: number; skip?: number }) => {
      if (!(store as any).statements) return []
      let stmts = [...(store as any).statements]
      if (where) {
        stmts = stmts.filter((s: any) => {
          for (const [k, v] of Object.entries(where)) {
            if (s[k] !== v) return false
          }
          return true
        })
      }
      if (skip) stmts = stmts.slice(skip as number)
      if (take) stmts = stmts.slice(0, take as number)
      return stmts
    },
    count: async ({ where }: { where?: Record<string, unknown> }) => {
      if (!(store as any).statements) return 0
      if (!where) return (store as any).statements.length
      return (store as any).statements.filter((s: any) => {
        for (const [k, v] of Object.entries(where)) {
          if (s[k] !== v) return false
        }
        return true
      }).length
    },
  },
  merchant: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      return store.merchants.get(where.id) ?? null
    },
    findMany: async () => {
      return Array.from(store.merchants.values())
    },
    count: async () => {
      return store.merchants.size
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const existing = store.merchants.get(where.id)
      if (!existing) throw new Error("Merchant not found")
      const updated = { ...existing, ...data, updatedAt: new Date() }
      store.merchants.set(where.id, updated)
      return updated
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
    findMany: async ({ where }: { where?: { merchantId: string } }) => {
      return Array.from(store.apiKeys.values()).filter(k => !where || k.merchantId === where.merchantId)
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      store.apiKeys.set(data.keyHash as string, data)
      return data
    },
    delete: async ({ where }: { where: { id: string } }) => {
      for (const [k, v] of store.apiKeys) {
        if ((v as any).id === where.id) { store.apiKeys.delete(k); return v }
      }
      return null
    },
  },
  user: {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      if (!(store as any).users) (store as any).users = new Map()
      for (const [, v] of (store as any).users) {
        if (where.email && (v as any).email === where.email) return v
        if (where.id && (v as any).id === where.id) return v
      }
      return null
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (!(store as any).users) (store as any).users = new Map()
      ;(store as any).users.set(data.id, { ...data, createdAt: new Date(), updatedAt: new Date() })
      return data
    },
  },
  userMerchant: {
    findMany: async ({ where }: { where?: { userId?: string; merchantId?: string } }) => {
      if (!(store as any).userMerchants) (store as any).userMerchants = new Map()
      return Array.from((store as any).userMerchants.values()).filter((um: any) => {
        if (where?.userId && um.userId !== where.userId) return false
        if (where?.merchantId && um.merchantId !== where.merchantId) return false
        return true
      })
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (!(store as any).userMerchants) (store as any).userMerchants = new Map()
      const id = `um_${Date.now()}_${Math.random()}`
      ;(store as any).userMerchants.set(id, { ...data, id, createdAt: new Date() })
      return data
    },
    deleteMany: async ({ where }: { where?: { userId?: string } }) => {
      if (!(store as any).userMerchants) return { count: 0 }
      let count = 0
      for (const [k, v] of (store as any).userMerchants) {
        if (where?.userId && v.userId === where.userId) { (store as any).userMerchants.delete(k); count++ }
      }
      return { count }
    },
  },
  auditLog: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (!(store as any).auditLogs) (store as any).auditLogs = []
      ;(store as any).auditLogs.push({ ...data, createdAt: new Date() })
      return data
    },
    findMany: async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      if (!(store as any).auditLogs) return []
      let logs = [...(store as any).auditLogs]
      if (where?.userId) logs = logs.filter((l: any) => l.userId === where.userId)
      if (where?.merchantId) logs = logs.filter((l: any) => l.merchantId === where.merchantId)
      return logs
    },
  },
}
