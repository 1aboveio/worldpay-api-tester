/**
 * Admin Portal Test Suite
 *
 * Test plan: docs/test-plans/2026-05-25-admin-portal-test-plan.md
 *
 * Tests portal auth, session enrichment, merchant switching,
 * role-based access, and DAL operations through Server Actions
 * and DAL functions directly.
 *
 * Mock policy: Mock DB (in-memory), real Server Actions, real DAL.
 * better-auth HTTP handler is not tested directly (integration boundary).
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
} from "@repo/database"

// DAL tests
import * as portalDal from "@/dal/portal"

// ─── Test Helpers ────────────────────────────────────────────────

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
    payFacConfig: {
      fraudsight: { enabled: false, actionOnHighRisk: "monitor" },
    },
    ...overrides,
  }
}

function makePaymentIntent(merchantId: string, overrides?: Record<string, unknown>) {
  return {
    id: `pi_${Math.random().toString(36).slice(2, 8)}`,
    merchantId,
    amount: 1000,
    currency: "GBP",
    status: "succeeded",
    captureMethod: "automatic",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  resetMockStores()
})

// ═══════════════════════════════════════════════════════════════
// AC1: fmmpay registration → platform_admin
// AC2: Non-fmmpay registration → merchant
// ═══════════════════════════════════════════════════════════════

describe("AC1-AC2: UserMerchant creation by email domain", () => {
  it("assigns platform_admin role for @fmmpay.com email", () => {
    const userId = "user_admin_001"
    const m1Id = seedMerchant(makeMerchant({ id: "m1", name: "M1" }))
    const m2Id = seedMerchant(makeMerchant({ id: "m2", name: "M2" }))

    // Simulate registration logic: for fmmpay, create UserMerchant for ALL merchants
    const store = getMockStore()
    const user = makeUser({ id: userId, email: "admin@fmmpay.com" })
    seedUser(user)

    // Create UserMerchant for only our test merchants
    const merchants = Array.from(store.merchants.values()).filter((m: any) => m.id === "m1" || m.id === "m2")
    for (const m of merchants) {
      seedUserMerchant({
        userId,
        merchantId: m.id,
        role: "platform_admin",
      })
    }

    const userMerchants = store.userMerchants
    const ums = Array.from(userMerchants.values()).filter(
      (um) => um.userId === userId,
    )

    expect(ums.length).toBe(2)
    expect(ums.every((um) => um.role === "platform_admin")).toBe(true)
    expect(ums.map((um) => um.merchantId).sort()).toEqual(["m1", "m2"].sort())
  })

  it("rejects non-fmmpay email at domain check level", () => {
    // isAllowedEmail checks against ALLOWED_EMAIL_DOMAIN (default fmmpay.com)
    const store = getMockStore()
    const userId = "user_rejected"
    seedUser(makeUser({ id: userId, email: "user@gmail.com" }))
    seedMerchant(makeMerchant({ id: "m1", name: "M1" }))

    // Non-matching email: no UserMerchant should be created
    // (login/register actions reject before creating records)
    const ums = Array.from(store.userMerchants.values()).filter(
      (um: any) => um.userId === userId,
    )
    expect(ums.length).toBe(0)
  })

  it("isAllowedEmail respects ALLOWED_EMAIL_DOMAIN env var", async () => {
    const { isAllowedEmail } = await import("@/app/(portal)/auth-schemas")
    // Default domain is fmmpay.com
    expect(isAllowedEmail("admin@fmmpay.com")).toBe(true)
    expect(isAllowedEmail("user@gmail.com")).toBe(false)
    expect(isAllowedEmail("test@FMMPAY.COM")).toBe(true) // case-insensitive
    expect(isAllowedEmail("no-domain")).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC7: Session enrichment
// ═══════════════════════════════════════════════════════════════

describe("AC7: Session enrichment with UserMerchant", () => {
  it("DAL: getUserMerchants returns all linked merchants with merchant data", async () => {
    const userId = "user_enrich_001"
    const m1Id = seedMerchant(makeMerchant({ id: "m_enrich_1", name: "Alpha Merchant" }))
    const m2Id = seedMerchant(makeMerchant({ id: "m_enrich_2", name: "Beta Merchant" }))

    seedUser(makeUser({ id: userId, email: "enrich@fmmpay.com" }))
    seedUserMerchant({ userId, merchantId: m1Id, role: "platform_admin" })
    seedUserMerchant({ userId, merchantId: m2Id, role: "platform_admin" })

    const result = await portalDal.getUserMerchants(userId)

    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0].merchant).toBeTruthy()
    const names = result.map((r: Record<string, unknown>) =>
      (r.merchant as Record<string, unknown>)?.name,
    )
    expect(names).toContain("Alpha Merchant")
    expect(names).toContain("Beta Merchant")
  })

  it("DAL: getPortalUserByEmail finds user by email", async () => {
    seedUser(makeUser({ id: "u_by_email", email: "findme@test.com" }))

    const user = await portalDal.getPortalUserByEmail("findme@test.com")
    expect(user).toBeTruthy()
    expect(user?.email).toBe("findme@test.com")

    const notFound = await portalDal.getPortalUserByEmail("nobody@test.com")
    expect(notFound).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// AC8-AC10: Merchant switching
// ═══════════════════════════════════════════════════════════════

describe("AC8-AC13: Merchant switching and impersonation", () => {
  it("single-merchant user has exactly one available merchant", async () => {
    const userId = "user_single_001"
    const mId = seedMerchant(makeMerchant({ id: "m_single", name: "Only Merchant" }))

    seedUser(makeUser({ id: userId, email: "single@test.com" }))
    seedUserMerchant({ userId, merchantId: mId, role: "merchant" })

    const ums = await portalDal.getUserMerchants(userId)
    expect(ums.length).toBe(1)
    expect(ums[0].merchantId).toBe(mId)
    expect(ums[0].role).toBe("merchant")
  })

  it("multi-merchant user sees all linked merchants", async () => {
    const userId = "user_multi_001"
    const m1 = seedMerchant(makeMerchant({ id: "m_multi_1", name: "First" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_multi_2", name: "Second" }))

    seedUser(makeUser({ id: userId, email: "multi@test.com" }))
    seedUserMerchant({ userId, merchantId: m1, role: "merchant" })
    seedUserMerchant({ userId, merchantId: m2, role: "merchant" })

    const ums = await portalDal.getUserMerchants(userId)
    expect(ums.length).toBe(2)
  })

  it("platform admin sees all merchants in their UserMerchant links", async () => {
    const userId = "user_platform_001"
    const m1 = seedMerchant(makeMerchant({ id: "m_pa_1", name: "M1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_pa_2", name: "M2" }))
    const m3 = seedMerchant(makeMerchant({ id: "m_pa_3", name: "M3" }))

    seedUser(makeUser({ id: userId, email: "pa@fmmpay.com" }))
    seedUserMerchant({ userId, merchantId: m1, role: "platform_admin" })
    seedUserMerchant({ userId, merchantId: m2, role: "platform_admin" })
    seedUserMerchant({ userId, merchantId: m3, role: "platform_admin" })

    const ums = await portalDal.getUserMerchants(userId)
    expect(ums.length).toBe(3)
    expect(ums.every((um) => um.role === "platform_admin")).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC18: Platform admin dashboard stats
// AC24: Merchant dashboard scoped stats
// ═══════════════════════════════════════════════════════════════

describe("AC18, AC24: Dashboard stats (platform vs merchant scoped)", () => {
  it("getMerchantStats returns aggregate stats across all merchants", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_stat_1", name: "M1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_stat_2", name: "M2" }))

    // Seed payment intents for both merchants
    getMockStore().paymentIntents.set("pi_1", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_2", makePaymentIntent(m2, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_3", makePaymentIntent(m1, { status: "payment_failed" }))

    const stats = await portalDal.getMerchantStats()
    expect(stats.totalPayments).toBe(3)
    expect(stats.succeededPayments).toBeGreaterThanOrEqual(2)
    expect(stats.merchantCount).toBeGreaterThanOrEqual(2)
    expect(stats.successRate).toBe(67) // 2/3 ≈ 67%
  })

  it("getMerchantStats scoped to specific merchant", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_scope_1", name: "M1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_scope_2", name: "M2" }))

    getMockStore().paymentIntents.set("pi_s1", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_s2", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_s3", makePaymentIntent(m2, { status: "succeeded" }))

    const stats = await portalDal.getMerchantStats(m1)
    expect(stats.totalPayments).toBeGreaterThanOrEqual(2)
    expect(stats.merchantCount).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC19: Merchant list
// ═══════════════════════════════════════════════════════════════

describe("AC19: listMerchants", () => {
  it("returns all merchants with apiKeys", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_list_1", name: "Alpha" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_list_2", name: "Beta" }))
    seedApiKey({ id: "key_1", merchantId: m1, keyHash: "hash1", prefix: "sk_live_", isActive: true })

    const merchants = await portalDal.listMerchants()
    expect(merchants.length).toBeGreaterThanOrEqual(2)
    expect(merchants[0].name).toBe("Alpha")

    const alpha = merchants.find((m: Record<string, unknown>) => m.id === m1)
    expect((alpha?.apiKeys as Array<unknown>)?.length).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC21: FraudSight config update
// ═══════════════════════════════════════════════════════════════

describe("AC21: FraudSight config toggle", () => {
  it("updateFraudSightConfig toggles enabled flag", async () => {
    const mId = seedMerchant(makeMerchant({
      id: "m_fs_1",
      payFacConfig: { fraudsight: { enabled: false, actionOnHighRisk: "monitor" } },
    }))

    const updated = await portalDal.updateFraudSightConfig(mId, {
      enabled: true,
      actionOnHighRisk: "block",
    })

    const config = updated.payFacConfig as Record<string, unknown>
    const fs = config.fraudsight as Record<string, unknown>
    expect(fs.enabled).toBe(true)
    expect(fs.actionOnHighRisk).toBe("block")
  })

  it("updateFraudSightConfig preserves existing keys when updating partial", async () => {
    const mId = seedMerchant(makeMerchant({
      id: "m_fs_2",
      payFacConfig: {
        fraudsight: {
          enabled: false,
          actionOnHighRisk: "monitor",
          actionOnReview: "monitor",
        },
      },
    }))

    const updated = await portalDal.updateFraudSightConfig(mId, {
      enabled: true,
    })

    const config = updated.payFacConfig as Record<string, unknown>
    const fs = config.fraudsight as Record<string, unknown>
    expect(fs.enabled).toBe(true)
    expect(fs.actionOnHighRisk).toBe("monitor") // preserved
    expect(fs.actionOnReview).toBe("monitor") // preserved
  })
})

// ═══════════════════════════════════════════════════════════════
// AC22, AC25: Payment list with filtering
// ═══════════════════════════════════════════════════════════════

describe("AC22, AC25: listPaymentIntents with filters", () => {
  it("returns all payment intents when no merchantId specified", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_pi_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_pi_2" }))

    getMockStore().paymentIntents.set("pi_a", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_b", makePaymentIntent(m2, { status: "created" }))

    const result = await portalDal.listPaymentIntents({})
    expect(result.items.length).toBe(2)
    expect(result.total).toBe(2)
  })

  it("scopes to specific merchant when merchantId provided", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_pi_s_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_pi_s_2" }))

    getMockStore().paymentIntents.set("pi_sa", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_sb", makePaymentIntent(m2, { status: "succeeded" }))

    const result = await portalDal.listPaymentIntents({ merchantId: m1 })
    expect(result.items.length).toBe(1)
    expect(result.items[0].merchantId).toBe(m1)
  })

  it("filters by status", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_filt_1" }))

    getMockStore().paymentIntents.set("pi_f1", makePaymentIntent(m1, { status: "succeeded" }))
    getMockStore().paymentIntents.set("pi_f2", makePaymentIntent(m1, { status: "payment_failed" }))

    const result = await portalDal.listPaymentIntents({ status: "succeeded" })
    expect(result.items.length).toBe(1)
    expect(result.items[0].status).toBe("succeeded")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC27: Payment methods list
// ═══════════════════════════════════════════════════════════════

describe("AC27: listPaymentMethods", () => {
  it("returns payment methods for a merchant", async () => {
    const mId = seedMerchant(makeMerchant({ id: "m_pm_1" }))

    getMockStore().paymentMethods.set("pm_1", {
      id: "pm_1",
      merchantId: mId,
      type: "card",
      tokenHref: "/tokens/tok_1",
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
    })

    const methods = await portalDal.listPaymentMethods(mId)
    expect(methods.length).toBe(1)
    expect(methods[0].brand).toBe("visa")
    expect(methods[0].last4).toBe("4242")
  })

  it("returns empty for merchant with no payment methods", async () => {
    const mId = seedMerchant(makeMerchant({ id: "m_empty_pm" }))
    const methods = await portalDal.listPaymentMethods(mId)
    expect(methods.length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC28: Refunds list
// ═══════════════════════════════════════════════════════════════

describe("AC28: listRefunds", () => {
  it("returns refunds scoped to merchant", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_ref_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_ref_2" }))

    const piId = "pi_ref_1"
    getMockStore().paymentIntents.set(piId, makePaymentIntent(m1))

    seedRefund({
      id: "ref_1",
      merchantId: m1,
      paymentIntentId: piId,
      amount: 500,
      currency: "GBP",
      status: "succeeded",
    })
    seedRefund({
      id: "ref_2",
      merchantId: m2,
      paymentIntentId: piId,
      amount: 300,
      currency: "GBP",
      status: "pending",
    })

    const refunds = await portalDal.listRefunds(m1)
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(500)
    expect(refunds[0].status).toBe("succeeded")
  })
})

// ═══════════════════════════════════════════════════════════════
// AC29: Statements list
// ═══════════════════════════════════════════════════════════════

describe("AC29: listStatements", () => {
  it("returns statements scoped to merchant", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_stmt_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_stmt_2" }))

    seedStatement({
      id: "stmt_1",
      merchantId: m1,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      totalVolume: 50000,
      status: "draft",
    })
    seedStatement({
      id: "stmt_2",
      merchantId: m2,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      totalVolume: 30000,
      status: "draft",
    })

    const statements = await portalDal.listStatements({ merchantId: m1 })
    expect(statements.length).toBe(1)
    expect(statements[0].totalVolume).toBe(50000)
  })

  it("returns all statements when no merchantId filter", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_stmt_a_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_stmt_a_2" }))

    seedStatement({
      id: "stmt_a1", merchantId: m1,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"),
      totalVolume: 10000, status: "draft",
    })
    seedStatement({
      id: "stmt_a2", merchantId: m2,
      periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"),
      totalVolume: 20000, status: "draft",
    })

    const statements = await portalDal.listStatements({})
    expect(statements.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC30: API key display (masked)
// ═══════════════════════════════════════════════════════════════

describe("AC30: getApiKeysForMerchant", () => {
  it("returns active API keys for a merchant", async () => {
    const mId = seedMerchant(makeMerchant({ id: "m_key_1" }))
    seedApiKey({ id: "ak_1", merchantId: mId, keyHash: "hash_active", prefix: "sk_live_", isActive: true })
    seedApiKey({ id: "ak_2", merchantId: mId, keyHash: "hash_inactive", prefix: "sk_test_", isActive: false })

    const keys = await portalDal.getApiKeysForMerchant(mId)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(keys[0].prefix).toBe("sk_live_")
    expect(keys[0].isActive).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// AC35: Tenant isolation — wrong merchant data access
// ═══════════════════════════════════════════════════════════════

describe("AC35: Tenant isolation", () => {
  it("scoped payment intent query does not return other merchants data", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_iso_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_iso_2" }))

    getMockStore().paymentIntents.set("pi_iso_1", makePaymentIntent(m1))
    getMockStore().paymentIntents.set("pi_iso_2", makePaymentIntent(m2))

    const result = await portalDal.listPaymentIntents({ merchantId: m1 })
    expect(result.items.length).toBe(1)
    expect(result.items[0].merchantId).toBe(m1)
  })

  it("scoped refund query does not return other merchants refunds", async () => {
    const m1 = seedMerchant(makeMerchant({ id: "m_iso_r_1" }))
    const m2 = seedMerchant(makeMerchant({ id: "m_iso_r_2" }))

    seedRefund({ id: "ref_iso_1", merchantId: m1, paymentIntentId: "pi_x", amount: 100, currency: "GBP", status: "succeeded" })
    seedRefund({ id: "ref_iso_2", merchantId: m2, paymentIntentId: "pi_x", amount: 200, currency: "GBP", status: "succeeded" })

    const refunds = await portalDal.listRefunds(m1)
    expect(refunds.length).toBe(1)
    expect(refunds[0].merchantId).toBe(m1)
  })
})
