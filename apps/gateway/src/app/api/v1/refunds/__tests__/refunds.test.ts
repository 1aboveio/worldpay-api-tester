/**
 * Refunds API Tests
 *
 * Test plan: docs/test-plans/2026-05-25-refunds-test-plan.md
 *
 * These tests exercise observable behavior through the public API:
 * - POST /api/v1/refunds (full + partial)
 * - GET /api/v1/refunds/{id}
 *
 * Mock policy: wpCall and resolveMerchant are mocked
 * (external system boundaries). DAL is the real in-memory mock.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { POST } from "@/app/api/v1/refunds/route"
import { GET } from "@/app/api/v1/refunds/[id]/route"
import { __setDeps, __resetDeps } from "@/app/api/v1/refunds/route"
import { __setDeps as __setGetDeps, __resetDeps as __resetGetDeps } from "@/app/api/v1/refunds/[id]/route"
import { resetMockStores, getMockStore } from "@repo/database"
import type { WpCallFn, ResolveMerchantFn } from "@/lib/worldpay-types"
import { NextRequest } from "next/server"

// ─── Test Helpers ────────────────────────────────────────────────

const TEST_API_KEY = "sk_test_key123"

function makeMerchant(): Awaited<ReturnType<ResolveMerchantFn>> {
  return {
    merchantId: "m_test001",
    entity: "test_entity",
    payFacConfig: {
      schemeId: "SCHEME123",
      subMerchant: {
        reference: "sub_001",
        name: "Test Merchant Ltd",
        address: {
          line1: "1 Test Street",
          city: "London",
          postalCode: "EC1A 1BB",
          country: "GB",
        },
      },
    },
  }
}

function makeRefundHateoasLinks() {
  return {
    "cardPayments:settle": { href: "/payments/settlements/linkdata_001" },
    "cardPayments:refund": { href: "/payments/settlements/refunds/full/linkdata_001" },
    "cardPayments:partialRefund": { href: "/payments/settlements/refunds/partial/linkdata_001" },
  }
}

function makeWorldpayRefundResponse(refundId?: string) {
  return {
    outcome: "refunded",
    refund: { id: refundId ?? "wp_ref_abc" },
    _links: {},
  }
}

/** Seed a succeeded PaymentIntent with HATEOAS links in the mock store */
function seedSucceededPi(overrides?: {
  id?: string
  amount?: number
  currency?: string
  merchantId?: string
  linkData?: Record<string, unknown> | null
}) {
  const piId = overrides?.id ?? "pi_test_refund001"
  getMockStore().paymentIntents.set(piId, {
    id: piId,
    merchantId: overrides?.merchantId ?? "m_test001",
    amount: overrides?.amount ?? 250,
    currency: overrides?.currency ?? "GBP",
    status: "succeeded",
    captureMethod: "automatic",
    paymentMethodId: "pm_test001",
    schemeReference: null,
    setupFutureUsage: null,
    worldpayPaymentId: "wp_pay_001",
    description: null,
    statementDescriptor: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    customerEmail: null,
    customerIpAddress: null,
    shipping: null,
    idempotencyKey: null,
    linkData: overrides?.linkData ?? makeRefundHateoasLinks(),
    threeDSStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })
}

/** Seed a PI with non-succeeded status */
function seedNonSucceededPi() {
  getMockStore().paymentIntents.set("pi_non_succeeded", {
    id: "pi_non_succeeded",
    merchantId: "m_test001",
    amount: 250,
    currency: "GBP",
    status: "processing",
    captureMethod: "automatic",
    paymentMethodId: "pm_test001",
    schemeReference: null,
    setupFutureUsage: null,
    worldpayPaymentId: "wp_pay_002",
    description: null,
    statementDescriptor: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    customerEmail: null,
    customerIpAddress: null,
    shipping: null,
    idempotencyKey: null,
    linkData: makeRefundHateoasLinks(),
    threeDSStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })
}

async function makePost(body: unknown, apiKey = TEST_API_KEY, headers?: Record<string, string>) {
  const req = new NextRequest("http://localhost/api/v1/refunds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return POST(req)
}

async function makeGet(id: string, apiKey = TEST_API_KEY) {
  const req = new NextRequest(`http://localhost/api/v1/refunds/${id}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  return GET(req, { params: Promise.resolve({ id }) })
}

async function jsonBody(res: Response) {
  return res.json()
}

// ─── Test Setup ─────────────────────────────────────────────────

function setupPostDeps(overrides?: {
  wpCall?: WpCallFn
  resolveMerchant?: ResolveMerchantFn
}) {
  const merchant = makeMerchant()

  const wpCall: WpCallFn = overrides?.wpCall ?? vi.fn(async () => makeWorldpayRefundResponse())

  const resolveMerchant: ResolveMerchantFn = overrides?.resolveMerchant ?? vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return merchant
    throw new Error("Invalid API key")
  })

  __setDeps({ wpCall, resolveMerchant })

  return { wpCall, resolveMerchant, merchant }
}

function setupGetDeps(overrides?: {
  resolveMerchant?: ResolveMerchantFn
}) {
  const merchant = makeMerchant()

  const resolveMerchant: ResolveMerchantFn = overrides?.resolveMerchant ?? vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return merchant
    throw new Error("Invalid API key")
  })

  __setGetDeps({ resolveMerchant })

  return { resolveMerchant, merchant }
}

beforeEach(() => {
  resetMockStores()
  __resetDeps()
  __resetGetDeps()
})

// ─── Refunds Tests ──────────────────────────────────────────────

describe("POST /api/v1/refunds", () => {
  // ── AC1: Full refund on succeeded PI → succeeded ──
  describe("AC1: Full refund → succeeded", () => {
    it("returns 200 with refund id and status:succeeded for full refund", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi()

      const res = await makePost({ payment_intent: "pi_test_refund001", reason: "requested_by_customer" })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toMatch(/^rf_/)
      expect(body.status).toBe("succeeded")

      // Verify wpCall was called with the refund HATEOAS URL
      const wpCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls
      expect(wpCalls.length).toBe(1)
      // Full refund uses cardPayments:refund link
      const [path] = wpCalls[0] as [string, string, unknown]
      expect(path).toContain("refunds/full")

      // Verify refund stored in DB
      const refund = getMockStore().refunds?.get(body.id)
      expect(refund).toBeTruthy()
      expect(refund?.status).toBe("succeeded")
      expect(refund?.paymentIntentId).toBe("pi_test_refund001")
      expect(refund?.amount).toBe(250)
      expect(refund?.currency).toBe("GBP")
    })

    it("uses exact amount from PI when no amount provided (full refund)", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({ amount: 500 })

      const res = await makePost({ payment_intent: "pi_test_refund001" })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")

      const refund = getMockStore().refunds?.get(body.id)
      expect(refund?.amount).toBe(500)
    })

    it("full refund when amount equals original PI amount", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({ amount: 300 })

      const res = await makePost({ payment_intent: "pi_test_refund001", amount: 300 })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")

      // Should use full refund HATEOAS URL
      const wpCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls
      const [path] = wpCalls[0] as [string, string, unknown]
      expect(path).toContain("refunds/full")
    })
  })

  // ── AC2: Partial refund on succeeded PI → succeeded ──
  describe("AC2: Partial refund → succeeded", () => {
    it("returns 200 for partial refund with amount less than original", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({ amount: 250 })

      const res = await makePost({ payment_intent: "pi_test_refund001", amount: 100, reason: "requested_by_customer" })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toMatch(/^rf_/)
      expect(body.status).toBe("succeeded")

      // Verify uses partialRefund HATEOAS URL
      const wpCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls
      const [path, , opts] = wpCalls[0] as [string, string, { body?: { value?: { amount: number; currency: string } } }]
      expect(path).toContain("refunds/partial")

      // Verify the Worldpay request body contains value block
      expect(opts?.body?.value?.amount).toBe(100)
      expect(opts?.body?.value?.currency).toBe("GBP")

      // Verify stored refund has correct amount
      const refund = getMockStore().refunds?.get(body.id)
      expect(refund?.amount).toBe(100)
    })
  })

  // ── AC3: GET refund returns stored data ──
  describe("AC3: GET /api/v1/refunds/{id} returns stored refund", () => {
    it("returns the stored refund by id", async () => {
      setupPostDeps()
      seedSucceededPi()

      // First create a refund
      const createRes = await makePost({ payment_intent: "pi_test_refund001", reason: "duplicate" })
      const createBody = await jsonBody(createRes)
      const refundId = createBody.id

      // Now fetch it
      setupGetDeps()
      const res = await makeGet(refundId)
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toBe(refundId)
      expect(body.payment_intent).toBe("pi_test_refund001")
      expect(body.amount).toBe(250)
      expect(body.currency).toBe("GBP")
      expect(body.status).toBe("succeeded")
    })

    it("returns 404 for non-existent refund id", async () => {
      setupGetDeps()
      const res = await makeGet("rf_nonexistent")
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })
  })

  // ── AC4: Omitting amount → full refund of remaining ──
  describe("AC4: Omitting amount → full refund of remaining capturable amount", () => {
    it("refunds full remaining amount after partial refunds", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({ amount: 250 })

      // First partial refund of 100
      const res1 = await makePost({ payment_intent: "pi_test_refund001", amount: 100 })
      const body1 = await jsonBody(res1)
      expect(res1.status).toBe(200)
      expect(body1.status).toBe("succeeded")

      // Second refund with no amount — should refund remaining 150
      const res2 = await makePost({ payment_intent: "pi_test_refund001" })
      const body2 = await jsonBody(res2)
      expect(res2.status).toBe(200)
      expect(body2.status).toBe("succeeded")

      const refund2 = getMockStore().refunds?.get(body2.id)
      expect(refund2?.amount).toBe(150)

      // Should use partialRefund URL (remaining < original)
      const wpCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls
      // First call was partial, second was also partial (remaining 150 < 250)
      for (const call of wpCalls) {
        const [path] = call as [string, string, unknown]
        expect(path).toContain("refunds/partial")
      }
    })
  })

  // ── AC5: Double full refund → 400 already_refunded ──
  describe("AC5: Double full refund → 400 already_refunded", () => {
    it("returns 400 when full refund already processed", async () => {
      setupPostDeps()
      seedSucceededPi({ amount: 250 })

      // First full refund
      const res1 = await makePost({ payment_intent: "pi_test_refund001", reason: "requested_by_customer" })
      const body1 = await jsonBody(res1)
      expect(res1.status).toBe(200)
      expect(body1.status).toBe("succeeded")

      // Second full refund
      const res2 = await makePost({ payment_intent: "pi_test_refund001", reason: "duplicate" })
      const body2 = await jsonBody(res2)

      expect(res2.status).toBe(400)
      expect(body2.error.code).toBe("already_refunded")
    })
  })

  // ── AC6: Cumulative partial refunds exceeding → 400 ──
  describe("AC6: Cumulative partial refunds exceeding original → 400 refund_exceeds_balance", () => {
    it("returns 400 when cumulative refunds would exceed original amount", async () => {
      setupPostDeps()
      seedSucceededPi({ amount: 250 })

      // First partial of 200
      const res1 = await makePost({ payment_intent: "pi_test_refund001", amount: 200 })
      expect(res1.status).toBe(200)

      // Second partial of 100 → would make cumulative 300 > 250
      const res2 = await makePost({ payment_intent: "pi_test_refund001", amount: 100 })
      const body2 = await jsonBody(res2)

      expect(res2.status).toBe(400)
      expect(body2.error.code).toBe("refund_exceeds_balance")
    })

    it("returns 400 when single partial refund exceeds original amount", async () => {
      setupPostDeps()
      seedSucceededPi({ amount: 100 })

      const res = await makePost({ payment_intent: "pi_test_refund001", amount: 150 })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("refund_exceeds_balance")
    })

    it("allows cumulative refunds exactly matching original amount", async () => {
      setupPostDeps()
      seedSucceededPi({ amount: 250 })

      // Partial 1: 100
      const res1 = await makePost({ payment_intent: "pi_test_refund001", amount: 100 })
      expect(res1.status).toBe(200)

      // Partial 2: 150 → total 250 = original
      const res2 = await makePost({ payment_intent: "pi_test_refund001", amount: 150 })
      const body2 = await jsonBody(res2)
      expect(res2.status).toBe(200)
      expect(body2.status).toBe("succeeded")
    })
  })

  // ── AC7: Refund non-succeeded PI → 400 status_invalid ──
  describe("AC7: Refund non-succeeded PI → 400 status_invalid", () => {
    it("returns 400 when PI status is not succeeded", async () => {
      setupPostDeps()
      seedNonSucceededPi()

      const res = await makePost({ payment_intent: "pi_non_succeeded", reason: "requested_by_customer" })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("status_invalid")
    })
  })

  // ── AC8: Refund uses stored HATEOAS URL ──
  describe("AC8: Refund uses HATEOAS URL from stored PaymentIntent linkData", () => {
    it("calls the refund HATEOAS URL from payment intent linkData", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({
        linkData: {
          "cardPayments:refund": { href: "/payments/settlements/refunds/custom/linkdata_custom" },
          "cardPayments:partialRefund": { href: "/payments/settlements/refunds/partial/custom" },
        },
      })

      await makePost({ payment_intent: "pi_test_refund001", reason: "fraudulent" })

      const [path] = (wpCall as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, unknown]
      expect(path).toBe("/payments/settlements/refunds/custom/linkdata_custom")
    })

    it("calls the partialRefund HATEOAS URL for partial refunds", async () => {
      const { wpCall } = setupPostDeps()
      seedSucceededPi({
        linkData: {
          "cardPayments:refund": { href: "/payments/settlements/refunds/full/custom" },
          "cardPayments:partialRefund": { href: "/payments/settlements/refunds/partial/custom" },
        },
      })

      await makePost({ payment_intent: "pi_test_refund001", amount: 50 })

      const [path] = (wpCall as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, unknown]
      expect(path).toBe("/payments/settlements/refunds/partial/custom")
    })
  })

  // ── AC9: Payment intent not found → 404 ──
  describe("AC9: Payment intent not found → 404", () => {
    it("returns 404 when payment intent does not exist", async () => {
      setupPostDeps()

      const res = await makePost({ payment_intent: "pi_nonexistent", reason: "duplicate" })
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("payment_intent_not_found")
    })

    it("returns 404 when PI belongs to different merchant", async () => {
      setupPostDeps()
      seedSucceededPi({ merchantId: "m_other" })

      const res = await makePost({ payment_intent: "pi_test_refund001", reason: "duplicate" })
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("payment_intent_not_found")
    })
  })

  // ── AC10: Idempotency-Key prevents duplicate refunds ──
  describe("AC10: Idempotency-Key prevents duplicate refunds", () => {
    it("returns same refund for duplicate idempotency key", async () => {
      setupPostDeps()
      seedSucceededPi({ amount: 250 })

      const idempotencyKey = "idem_refund_001"

      const res1 = await makePost(
        { payment_intent: "pi_test_refund001", reason: "requested_by_customer" },
        TEST_API_KEY,
        { "Idempotency-Key": idempotencyKey },
      )
      const body1 = await jsonBody(res1)
      expect(res1.status).toBe(200)
      expect(body1.status).toBe("succeeded")

      const res2 = await makePost(
        { payment_intent: "pi_test_refund001", reason: "duplicate" },
        TEST_API_KEY,
        { "Idempotency-Key": idempotencyKey },
      )
      const body2 = await jsonBody(res2)

      expect(res2.status).toBe(200)
      expect(body2.id).toBe(body1.id)
      expect(body2.status).toBe("succeeded")

      // Verify only one refund stored
      const refundCount = getMockStore().refunds?.size ?? 0
      expect(refundCount).toBe(1)
    })
  })

  // ── Validation ──
  describe("Validation", () => {
    it("returns 400 for missing payment_intent", async () => {
      setupPostDeps()
      const res = await makePost({ reason: "duplicate" })
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for invalid reason enum value", async () => {
      setupPostDeps()
      seedSucceededPi()
      const res = await makePost({ payment_intent: "pi_test_refund001", reason: "invalid_reason" })
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 401 for invalid API key", async () => {
      setupPostDeps()
      const res = await makePost({ payment_intent: "pi_test_refund001" }, "bad_key")
      const body = await jsonBody(res)
      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })

  // ── Error: Worldpay refund failure ──
  describe("Worldpay refund failure", () => {
    it("returns 500 when Worldpay refund call fails", async () => {
      setupPostDeps({
        wpCall: vi.fn(async () => {
          throw new Error("Worldpay down")
        }),
      })
      seedSucceededPi()

      const res = await makePost({ payment_intent: "pi_test_refund001", reason: "requested_by_customer" })
      const body = await jsonBody(res)

      expect(res.status).toBe(500)
      expect(body.error.code).toBe("refund_failed")
    })
  })
})

describe("GET /api/v1/refunds/{id}", () => {
  it("returns 401 for invalid API key", async () => {
    setupPostDeps()
    seedSucceededPi()
    const createRes = await makePost({ payment_intent: "pi_test_refund001", reason: "duplicate" })
    const createBody = await jsonBody(createRes)

    const res = await makeGet(createBody.id, "bad_key")
    const body = await jsonBody(res)
    expect(res.status).toBe(401)
    expect(body.error.code).toBe("authentication_error")
  })

  it("returns 404 for refund belonging to different merchant", async () => {
    // Create a refund under m_test001
    setupPostDeps()
    seedSucceededPi()
    const createRes = await makePost({ payment_intent: "pi_test_refund001", reason: "duplicate" })
    const createBody = await jsonBody(createRes)

    // Try to GET with a different merchant
    setupGetDeps({
      resolveMerchant: vi.fn(async () => ({
        merchantId: "m_other",
        entity: "other_entity",
        payFacConfig: {
          schemeId: "OTHER",
          subMerchant: { reference: "other", name: "Other", address: {} },
        },
      })),
    })

    const res = await makeGet(createBody.id)
    const body = await jsonBody(res)

    expect(res.status).toBe(404)
    expect(body.error.code).toBe("not_found")
  })
})
