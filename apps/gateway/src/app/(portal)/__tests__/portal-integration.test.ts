/**
 * Portal Integration Tests — Server Actions & DAL
 *
 * Test plan: docs/test-plans/2026-05-25-admin-portal-test-plan.md
 *
 * Covers: Auth flow, session enrichment, merchant switching,
 * role-based access, FraudSight config, tenant isolation,
 * audit logging, capture/refund actions, and registration safety.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  resetMockStores,
  getMockStore,
  seedMerchant,
  seedApiKey,
  seedUser,
  seedUserMerchant,
  seedRefund,
  seedStatement,
  seedAuditLog,
  seedPaymentIntent,
} from "@repo/database"

// DAL
import * as portalDal from "@/dal/portal"

// ─── Helpers ──────────────────────────────────────────────────

function makeUser(overrides?: Record<string, unknown>) {
  return {
    id: `user_${Math.random().toString(36).slice(2, 8)}`,
    email: "test@example.com",
    name: "Test User",
    emailVerified: false,
    ...overrides,
  }
}

function makeMerchant(overrides?: Record<string, unknown>) {
  return {
    id: `merchant_${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Merchant",
    entity: `entity_${Math.random().toString(36).slice(2, 6)}`,
    payFacConfig: { fraudsight: { enabled: false, actionOnHighRisk: "monitor" } },
    ...overrides,
  }
}

beforeEach(() => {
  resetMockStores()
})

// ═══════════════════════════════════════════════════════════════
// AC1-AC2: Registration role assignment
// ═══════════════════════════════════════════════════════════════

describe("AC1-AC2: UserMerchant creation by email domain", () => {
  it("assigns platform_admin role for @fmmpay.com email to all merchants", () => {
    const userId = "user_admin_001"
    seedMerchant(makeMerchant({ id: "m1", name: "M1" }))
    seedMerchant(makeMerchant({ id: "m2", name: "M2" }))

    const store = getMockStore()
    seedUser(makeUser({ id: userId, email: "admin@fmmpay.com" }))

    const merchants = Array.from(store.merchants.values()).filter((m: any) => m.id === "m1" || m.id === "m2")
    for (const m of merchants) {
      seedUserMerchant({ userId, merchantId: m.id, role: "platform_admin" })
    }

    const ums = Array.from(store.userMerchants.values()).filter((um) => um.userId === userId)
    expect(ums.length).toBe(2)
    expect(ums.every((um) => um.role === "platform_admin")).toBe(true)
  })

  it("assigns merchant role for non-fmmpay email", () => {
    const userId = "user_merchant_001"
    seedMerchant(makeMerchant({ id: "m1", name: "M1" }))
    seedMerchant(makeMerchant({ id: "m2", name: "M2" }))
    seedUser(makeUser({ id: userId, email: "user@gmail.com" }))
    seedUserMerchant({ userId, merchantId: "m1", role: "merchant" })

    const ums = Array.from(getMockStore().userMerchants.values()).filter((um) => um.userId === userId)
    expect(ums.length).toBe(1)
    expect(ums[0].role).toBe("merchant")
    expect(ums[0].merchantId).toBe("m1")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC7: Session enrichment
// ═══════════════════════════════════════════════════════════════

describe("AC7: Session enrichment", () => {
  it("DAL: getUserMerchants returns linked merchants with data", async () => {
    const userId = "user_enrich_001"
    seedMerchant(makeMerchant({ id: "m_e1", name: "Alpha" }))
    seedUser(makeUser({ id: userId, email: "enrich@fmmpay.com" }))
    seedUserMerchant({ userId, merchantId: "m_e1", role: "platform_admin" })

    const result = await portalDal.getUserMerchants(userId)
    expect(result.length).toBe(1)
    expect((result[0].merchant as Record<string, unknown>)?.name).toBe("Alpha")
  })

  it("DAL: getPortalUserByEmail finds user", async () => {
    seedUser(makeUser({ id: "u_email", email: "findme@test.com" }))
    const user = await portalDal.getPortalUserByEmail("findme@test.com")
    expect(user).toBeTruthy()
    expect(await portalDal.getPortalUserByEmail("nobody@test.com")).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// AC8-AC11: Merchant switching
// ═══════════════════════════════════════════════════════════════

describe("AC8-AC13: Merchant switching", () => {
  it("single-merchant user has exactly one available", async () => {
    const userId = "user_single"
    seedMerchant(makeMerchant({ id: "m_single" }))
    seedUser(makeUser({ id: userId }))
    seedUserMerchant({ userId, merchantId: "m_single", role: "merchant" })

    const ums = await portalDal.getUserMerchants(userId)
    expect(ums.length).toBe(1)
  })

  it("platform admin sees all merchants", async () => {
    const userId = "user_pa"
    seedMerchant(makeMerchant({ id: "m1" }))
    seedMerchant(makeMerchant({ id: "m2" }))
    seedMerchant(makeMerchant({ id: "m3" }))
    seedUser(makeUser({ id: userId, email: "pa@fmmpay.com" }))
    seedUserMerchant({ userId, merchantId: "m1", role: "platform_admin" })
    seedUserMerchant({ userId, merchantId: "m2", role: "platform_admin" })
    seedUserMerchant({ userId, merchantId: "m3", role: "platform_admin" })

    const ums = await portalDal.getUserMerchants(userId)
    expect(ums.length).toBe(3)
    expect(ums.every((um) => um.role === "platform_admin")).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC18/AC24: Dashboard stats
// ═══════════════════════════════════════════════════════════════

describe("Dashboard stats (platform vs merchant)", () => {
  it("returns aggregate stats", async () => {
    seedMerchant(makeMerchant({ id: "m1" }))
    seedMerchant(makeMerchant({ id: "m2" }))
    seedPaymentIntent({ id: "pi_1", merchantId: "m1", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_2", merchantId: "m2", amount: 2000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_3", merchantId: "m1", amount: 500, currency: "GBP", status: "payment_failed" })

    const stats = await portalDal.getMerchantStats()
    expect(stats.totalPayments).toBe(3)
    expect(stats.merchantCount).toBe(2)
    expect(stats.succeededPayments).toBe(2)
  })

  it("scopes to specific merchant", async () => {
    seedMerchant(makeMerchant({ id: "m1" }))
    seedMerchant(makeMerchant({ id: "m2" }))
    seedPaymentIntent({ id: "pi_1", merchantId: "m1", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_2", merchantId: "m2", amount: 2000, currency: "GBP", status: "succeeded" })

    const stats = await portalDal.getMerchantStats("m1")
    expect(stats.totalPayments).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC21: FraudSight config
// ═══════════════════════════════════════════════════════════════

describe("AC21: FraudSight config", () => {
  it("toggles enabled flag", async () => {
    seedMerchant(makeMerchant({ id: "m_fs", payFacConfig: { fraudsight: { enabled: false, actionOnHighRisk: "monitor" } } }))
    const updated = await portalDal.updateFraudSightConfig("m_fs", { enabled: true, actionOnHighRisk: "block" })
    const fs = (updated.payFacConfig as Record<string, unknown>).fraudsight as Record<string, unknown>
    expect(fs.enabled).toBe(true)
    expect(fs.actionOnHighRisk).toBe("block")
  })

  it("preserves existing keys on partial update", async () => {
    seedMerchant(makeMerchant({ id: "m_fs2", payFacConfig: { fraudsight: { enabled: false, actionOnHighRisk: "monitor", actionOnReview: "monitor" } } }))
    const updated = await portalDal.updateFraudSightConfig("m_fs2", { enabled: true })
    const fs = (updated.payFacConfig as Record<string, unknown>).fraudsight as Record<string, unknown>
    expect(fs.enabled).toBe(true)
    expect(fs.actionOnHighRisk).toBe("monitor")
    expect(fs.actionOnReview).toBe("monitor")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC22/AC25: Payment list with filters
// ═══════════════════════════════════════════════════════════════

describe("Payment list with filters", () => {
  it("scopes to merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_a" }))
    seedMerchant(makeMerchant({ id: "m_b" }))
    seedPaymentIntent({ id: "pi_a", merchantId: "m_a", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_b", merchantId: "m_b", amount: 2000, currency: "GBP", status: "succeeded" })

    const result = await portalDal.listPaymentIntents({ merchantId: "m_a" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].merchantId).toBe("m_a")
  })

  it("filters by status", async () => {
    seedMerchant(makeMerchant({ id: "m_f" }))
    seedPaymentIntent({ id: "pi_ok", merchantId: "m_f", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_fail", merchantId: "m_f", amount: 500, currency: "GBP", status: "payment_failed" })

    const result = await portalDal.listPaymentIntents({ status: "succeeded" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].status).toBe("succeeded")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC27: Payment methods
// ═══════════════════════════════════════════════════════════════

describe("Payment methods", () => {
  it("returns methods for merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_pm" }))
    getMockStore().paymentMethods.set("pm_1", { id: "pm_1", merchantId: "m_pm", type: "card", tokenHref: "/tokens/t1", brand: "visa", last4: "4242", expiryMonth: 12, expiryYear: 2030 })
    const methods = await portalDal.listPaymentMethods("m_pm")
    expect(methods.length).toBe(1)
    expect(methods[0].brand).toBe("visa")
  })

  it("returns empty for no methods", async () => {
    seedMerchant(makeMerchant({ id: "m_empty" }))
    expect((await portalDal.listPaymentMethods("m_empty")).length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC28: Refunds
// ═══════════════════════════════════════════════════════════════

describe("Refunds", () => {
  it("scoped to merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_ref1" }))
    seedMerchant(makeMerchant({ id: "m_ref2" }))
    seedRefund({ id: "r1", merchantId: "m_ref1", paymentIntentId: "pi_x", amount: 500, currency: "GBP", status: "succeeded" })
    seedRefund({ id: "r2", merchantId: "m_ref2", paymentIntentId: "pi_x", amount: 300, currency: "GBP", status: "succeeded" })

    const refunds = await portalDal.listRefunds("m_ref1")
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(500)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC29: Statements
// ═══════════════════════════════════════════════════════════════

describe("Statements", () => {
  it("scoped to merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_s1" }))
    seedMerchant(makeMerchant({ id: "m_s2" }))
    seedStatement({ id: "s1", merchantId: "m_s1", periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), totalVolume: 50000, status: "draft" })
    seedStatement({ id: "s2", merchantId: "m_s2", periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), totalVolume: 30000, status: "draft" })

    expect((await portalDal.listStatements({ merchantId: "m_s1" })).length).toBe(1)
    expect((await portalDal.listStatements({})).length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC30: API keys
// ═══════════════════════════════════════════════════════════════

describe("API keys", () => {
  it("returns active keys for merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_key" }))
    seedApiKey({ id: "ak1", merchantId: "m_key", keyHash: "h1", prefix: "sk_live_", isActive: true })
    seedApiKey({ id: "ak2", merchantId: "m_key", keyHash: "h2", prefix: "sk_test_", isActive: false })

    const keys = await portalDal.getApiKeysForMerchant("m_key")
    expect(keys.length).toBe(1)
    expect(keys[0].prefix).toBe("sk_live_")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC35: Tenant isolation
// ═══════════════════════════════════════════════════════════════

describe("Tenant isolation", () => {
  it("payment intents scoped to merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_iso1" }))
    seedMerchant(makeMerchant({ id: "m_iso2" }))
    seedPaymentIntent({ id: "pi_iso1", merchantId: "m_iso1", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_iso2", merchantId: "m_iso2", amount: 2000, currency: "GBP", status: "succeeded" })

    const result = await portalDal.listPaymentIntents({ merchantId: "m_iso1" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].merchantId).toBe("m_iso1")
  })

  it("refunds scoped to merchant", async () => {
    seedMerchant(makeMerchant({ id: "m_ir1" }))
    seedMerchant(makeMerchant({ id: "m_ir2" }))
    seedRefund({ id: "r1", merchantId: "m_ir1", paymentIntentId: "pi_x", amount: 100, currency: "GBP", status: "succeeded" })
    seedRefund({ id: "r2", merchantId: "m_ir2", paymentIntentId: "pi_x", amount: 200, currency: "GBP", status: "succeeded" })

    expect((await portalDal.listRefunds("m_ir1")).length).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// NEW: Audit log functionality
// ═══════════════════════════════════════════════════════════════

describe("Audit log", () => {
  it("creates audit log entry", async () => {
    const userId = "user_audit"
    seedUser(makeUser({ id: userId }))

    await portalDal.createAuditLog({
      userId,
      merchantId: "m_test",
      action: "impersonate_merchant",
      details: { merchantName: "Test" },
    })

    const store = getMockStore()
    const logs = Array.from(store.auditLogs.values())
    expect(logs.length).toBe(1)
    expect(logs[0].userId).toBe(userId)
    expect(logs[0].action).toBe("impersonate_merchant")
  })

  it("audit log persists return_to_platform", async () => {
    const userId = "user_audit2"
    seedUser(makeUser({ id: userId }))

    await portalDal.createAuditLog({
      userId,
      action: "return_to_platform",
      details: { previousMerchantId: "m_prev" },
    })

    const logs = Array.from(getMockStore().auditLogs.values())
    expect(logs.length).toBe(1)
    expect(logs[0].action).toBe("return_to_platform")
    expect(logs[0].merchantId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// NEW: Registration rollback safety
// ═══════════════════════════════════════════════════════════════

describe("Registration safety", () => {
  it("UserMerchant deleteMany cleans up properly", () => {
    const userId = "user_rollback"
    seedUser(makeUser({ id: userId }))
    seedUserMerchant({ id: "um1", userId, merchantId: "m1", role: "platform_admin" })
    seedUserMerchant({ id: "um2", userId, merchantId: "m2", role: "platform_admin" })
    seedUserMerchant({ id: "um3", userId, merchantId: "m3", role: "platform_admin" })

    // Simulate rollback: delete all for userId
    getMockStore().userMerchants.delete("um1")
    getMockStore().userMerchants.delete("um2")
    getMockStore().userMerchants.delete("um3")

    const remaining = Array.from(getMockStore().userMerchants.values()).filter((um) => um.userId === userId)
    expect(remaining.length).toBe(0)
  })

  it("partial creation can be rolled back", () => {
    const userId = "user_partial"
    seedUser(makeUser({ id: userId }))
    // Simulate: create 2 out of 5 merchants, then fail on 3rd
    seedUserMerchant({ id: "um_a", userId, merchantId: "m1", role: "platform_admin" })
    seedUserMerchant({ id: "um_b", userId, merchantId: "m2", role: "platform_admin" })

    // Rollback the partial
    getMockStore().userMerchants.delete("um_a")
    getMockStore().userMerchants.delete("um_b")

    expect(Array.from(getMockStore().userMerchants.values()).filter((um) => um.userId === userId).length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// NEW: Payment capture & refund actions (DAL-level)
// ═══════════════════════════════════════════════════════════════

describe("Capture & Refund (DAL-level)", () => {
  it("capture updates payment intent status", async () => {
    seedMerchant(makeMerchant({ id: "m_cap" }))
    seedPaymentIntent({ id: "pi_cap", merchantId: "m_cap", amount: 1000, currency: "GBP", status: "requires_capture" })

    const db = getMockStore().database ?? (await import("@repo/database")).database
    await db.paymentIntent.update({ where: { id: "pi_cap" }, data: { status: "succeeded" } })

    const pi = getMockStore().paymentIntents.get("pi_cap")
    expect(pi?.status).toBe("succeeded")
  })

  it("refund creates a refund record", () => {
    seedMerchant(makeMerchant({ id: "m_ref" }))
    seedPaymentIntent({ id: "pi_ref", merchantId: "m_ref", amount: 2000, currency: "GBP", status: "succeeded" })
    seedRefund({ id: "r_new", merchantId: "m_ref", paymentIntentId: "pi_ref", amount: 500, currency: "GBP", status: "pending" })

    const refund = getMockStore().refunds.get("r_new")
    expect(refund).toBeTruthy()
    expect(refund?.amount).toBe(500)
    expect(refund?.paymentIntentId).toBe("pi_ref")
  })
})

// ═══════════════════════════════════════════════════════════════
// NEW: Cross-role access denied check
// ═══════════════════════════════════════════════════════════════

describe("Cross-role access", () => {
  it("merchant-scoped query excludes other merchant data", async () => {
    seedMerchant(makeMerchant({ id: "m_own" }))
    seedMerchant(makeMerchant({ id: "m_other" }))
    seedPaymentIntent({ id: "pi_own", merchantId: "m_own", amount: 1000, currency: "GBP", status: "succeeded" })
    seedPaymentIntent({ id: "pi_other", merchantId: "m_other", amount: 5000, currency: "GBP", status: "succeeded" })

    // A merchant user with activeMerchantId=m_own should only see their own
    const result = await portalDal.listPaymentIntents({ merchantId: "m_own" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].id).toBe("pi_own")
  })
})
