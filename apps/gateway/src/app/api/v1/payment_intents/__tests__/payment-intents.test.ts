/**
 * CIT Core Payment Intent Tests
 *
 * Test plan: docs/test-plans/2026-05-25-cit-core-test-plan.md
 *
 * These tests exercise observable behavior through the public API:
 * - POST /api/v1/payment_intents (create + confirm)
 * - GET /api/v1/payment_intents/{id}
 *
 * Mock policy: wpCall, createToken, and resolveMerchant are mocked
 * (external system boundaries). DAL is the real in-memory mock that
 * behaves like Prisma — we test state changes through it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { POST } from "@/app/api/v1/payment_intents/route"
import { GET } from "@/app/api/v1/payment_intents/[id]/route"
import { __setDeps, __resetDeps } from "@/app/api/v1/payment_intents/route"
import { __setDeps as __setGetDeps, __resetDeps as __resetGetDeps } from "@/app/api/v1/payment_intents/[id]/route"
import { resetMockStores, getMockStore } from "@repo/database"
import type { WpCallFn, CreateTokenFn, ResolveMerchantFn } from "@/lib/worldpay-types"
import { NextRequest } from "next/server"

// ─── Test Helpers ────────────────────────────────────────────────

const TEST_API_KEY = "sk_test_key123"
const MIT_TOKEN_ID = "pm_mit_token001"

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

function makeTokenResult() {
  return {
    tokenHref: "/tokens/tok_abc123",
    brand: "visa",
    last4: "1111",
    expiryMonth: 5,
    expiryYear: 2035,
  }
}

function makeFraudSightPass() {
  return {
    outcome: "lowRisk",
    actionOnHighRisk: "monitor",
    riskProfile: { href: "https://try.access.worldpay.com/riskProfile/rp_xyz" },
  }
}

function makeFraudSightBlock() {
  return {
    outcome: "highRisk",
    actionOnHighRisk: "block",
    riskProfile: { href: "https://try.access.worldpay.com/riskProfile/rp_blocked" },
  }
}

function makeCitAuthorizeResponse(manual?: boolean) {
  return {
    outcome: manual ? "authorized" : "sentForSettlement",
    payment: { id: "wp_pay_001" },
    scheme: { reference: "MCCOLXT1C0104  " },
    _links: {
      "cardPayments:settle": { href: "/payments/settlements/linkdata_001" },
      "cardPayments:refund": { href: "/payments/settlements/refunds/full/linkdata_001" },
    },
  }
}

function makeCitRefuseResponse() {
  return {
    outcome: "refused",
    refusal: { code: "5", description: "REFUSED" },
    _links: {},
  }
}

function makeMitAuthorizeResponse() {
  return {
    outcome: "sentForSettlement",
    payment: { id: "wp_mit_001" },
    _links: {
      "cardPayments:settle": { href: "/payments/settlements/mit_link_001" },
      "cardPayments:refund": { href: "/payments/settlements/refunds/full/mit_link_001" },
    },
  }
}

function cardRequest(overrides?: Record<string, unknown>) {
  return {
    amount: 250,
    currency: "gbp",
    payment_method: {
      type: "card",
      card: {
        number: "4444333322221111",
        expiry_month: 5,
        expiry_year: 2035,
        cvc: "123",
        cardholder_name: "John Doe",
        billing_address: {
          line1: "221B Baker Street",
          city: "London",
          postal_code: "NW1 6XE",
          country: "GB",
        },
      },
    },
    confirm: true,
    capture_method: "automatic",
    ...overrides,
  }
}

function cardTokenRequest(overrides?: Record<string, unknown>) {
  return {
    amount: 100,
    currency: "usd",
    payment_method: {
      type: "card_token",
      token: "pm_abc123def456",
    },
    confirm: true,
    capture_method: "automatic",
    ...overrides,
  }
}

/**
 * Request that triggers MIT: card_token with NO three_d_secure field.
 * Uses MIT_TOKEN_ID by default.
 */
function mitRequest(token?: string, overrides?: Record<string, unknown>) {
  return {
    amount: 100,
    currency: "usd",
    payment_method: {
      type: "card_token",
      token: token ?? MIT_TOKEN_ID,
    },
    confirm: true,
    capture_method: "automatic",
    ...overrides,
  }
}

async function makeRequest(body: unknown, apiKey = TEST_API_KEY) {
  const req = new NextRequest("http://localhost/api/v1/payment_intents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  return POST(req)
}

async function makeGetRequest(id: string, apiKey = TEST_API_KEY) {
  const req = new NextRequest(`http://localhost/api/v1/payment_intents/${id}`, {
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

/** Seed a PaymentMethod record in the mock store */
function seedPaymentMethod(
  id: string,
  overrides?: Partial<{
    merchantId: string
    tokenHref: string
    brand: string
    last4: string
  }>,
) {
  getMockStore().paymentMethods.set(id, {
    id,
    merchantId: overrides?.merchantId ?? "m_test001",
    type: "card",
    tokenHref: overrides?.tokenHref ?? "/tokens/tok_stored",
    brand: overrides?.brand ?? "visa",
    last4: overrides?.last4 ?? "0004",
    expiryMonth: 12,
    expiryYear: 2030,
  })
}

/** Seed a CIT PaymentIntent that supports MIT (setup_future_usage + schemeReference) */
function seedCitWithOffSession(
  piId: string,
  paymentMethodId: string,
  merchantId = "m_test001",
) {
  getMockStore().paymentIntents.set(piId, {
    id: piId,
    merchantId,
    amount: 1000,
    currency: "USD",
    status: "succeeded",
    captureMethod: "automatic",
    paymentMethodId,
    schemeReference: "MCCOLXT1C0104",
    setupFutureUsage: "off_session",
    worldpayPaymentId: "wp_cit_ref001",
    description: null,
    statementDescriptor: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    customerEmail: null,
    customerIpAddress: null,
    shipping: null,
    idempotencyKey: null,
    linkData: null,
    threeDSStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })
}

/** Seed a CIT PaymentIntent WITHOUT setup_future_usage (for mit_not_setup tests) */
function seedCitWithoutOffSession(
  piId: string,
  paymentMethodId: string,
  merchantId = "m_test001",
) {
  getMockStore().paymentIntents.set(piId, {
    id: piId,
    merchantId,
    amount: 1000,
    currency: "USD",
    status: "succeeded",
    captureMethod: "automatic",
    paymentMethodId,
    schemeReference: null,
    setupFutureUsage: null,
    worldpayPaymentId: "wp_cit_standard",
    description: null,
    statementDescriptor: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    customerEmail: null,
    customerIpAddress: null,
    shipping: null,
    idempotencyKey: null,
    linkData: null,
    threeDSStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  })
}

// ─── MIT helpers ─────────────────────────────────────────────────

/**
 * Full MIT setup: seed a payment method + a CIT with off_session.
 */
function seedMitSetup(tokenId = MIT_TOKEN_ID) {
  seedPaymentMethod(tokenId, {
    tokenHref: "/tokens/tok_mit_stored",
    brand: "visa",
    last4: "0004",
  })
  seedCitWithOffSession(`pi_cit_${tokenId.substring(3)}`, tokenId)
}

// ─── Test Setup ─────────────────────────────────────────────────

function setupDeps(
  overrides: {
    wpCall?: WpCallFn
    createToken?: CreateTokenFn
    resolveMerchant?: ResolveMerchantFn
  } = {},
) {
  const merchant = makeMerchant()

  const wpCall: WpCallFn = overrides.wpCall ?? vi.fn(async (path: string) => {
    if (path === "/fraudsight/assessment") return makeFraudSightPass()
    if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse()
    if (path === "/cardPayments/merchantInitiatedTransactions") return makeMitAuthorizeResponse()
    throw new Error(`Unmocked wpCall path: ${path}`)
  })

  const createToken: CreateTokenFn = overrides.createToken ?? vi.fn(async () => makeTokenResult())

  const resolveMerchant: ResolveMerchantFn = overrides.resolveMerchant ?? vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return merchant
    throw new Error("Invalid API key")
  })

  __setDeps({ wpCall, createToken, resolveMerchant })
  __setGetDeps({ resolveMerchant })

  return { wpCall, createToken, resolveMerchant, merchant }
}

beforeEach(() => {
  resetMockStores()
  __resetDeps()
  __resetGetDeps()
})

// ─── CIT Tests (existing) ──────────────────────────────────────

describe("POST /api/v1/payment_intents", () => {
  // ── AC1: Card CIT happy path → succeeded ──
  describe("AC1: Card CIT happy path → succeeded", () => {
    it("returns 200 with status:succeeded for card payment with automatic capture", async () => {
      const { wpCall } = setupDeps()

      const res = await makeRequest(cardRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toMatch(/^pi_/)
      expect(body.amount).toBe(250)
      expect(body.currency).toBe("GBP")
      expect(body.capture_method).toBe("automatic")
      expect(body.payment_method_details.type).toBe("card")
      expect(body.payment_method_details.card.brand).toBe("visa")
      expect(body.payment_method_details.card.last4).toBe("1111")

      // Verify CIT authorize was called
      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      expect(citCall).toBeTruthy()

      // Verify PI stored in DB
      const pi = getMockStore().paymentIntents.get(body.id)
      expect(pi).toBeTruthy()
      expect(pi?.status).toBe("succeeded")
    })

    // ── AC4: PayFac block injected ──
    it("injects PayFac paymentFacilitator block in CIT request", async () => {
      const { wpCall } = setupDeps()

      await makeRequest(cardRequest())

      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const merchant = citBody?.merchant as Record<string, unknown>
      const payFac = merchant?.paymentFacilitator as Record<string, unknown>

      expect(payFac).toBeTruthy()
      expect(payFac.schemeId).toBe("SCHEME123")
      expect(payFac.subMerchant).toEqual({
        reference: "sub_001",
        name: "Test Merchant Ltd",
        address: {
          line1: "1 Test Street",
          city: "London",
          postalCode: "EC1A 1BB",
          country: "GB",
        },
      })
    })

    // ── AC6: RiskProfile injected ──
    it("injects riskProfile href into CIT authorize request", async () => {
      const { wpCall } = setupDeps()

      await makeRequest(cardRequest())

      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      expect(citBody.riskProfile).toBe("https://try.access.worldpay.com/riskProfile/rp_xyz")
    })

    // ── AC12: Currency normalization ──
    it("normalizes lowercase currency to uppercase in response and WP calls", async () => {
      const { wpCall } = setupDeps()

      const res = await makeRequest(cardRequest({ currency: "usd" }))
      const body = await jsonBody(res)

      expect(body.currency).toBe("USD")

      const fraudCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/fraudsight/assessment",
      )
      const fraudBody = fraudCall?.[2]?.body as Record<string, unknown>
      const instruction = fraudBody?.instruction as Record<string, unknown>
      const value = instruction?.value as Record<string, unknown>
      expect(value?.currency).toBe("USD")
    })
  })

  // ── AC2: Card token CIT → succeeded (with three_d_secure present to avoid MIT routing) ──
  describe("AC2: Card token CIT → succeeded (with three_d_secure)", () => {
    it("returns 200 with status:succeeded for card_token CIT with three_d_secure", async () => {
      setupDeps()

      // Pre-seed a PaymentMethod record for the token lookup
      getMockStore().paymentMethods.set("pm_abc123def456", {
        id: "pm_abc123def456",
        merchantId: "m_test001",
        type: "card",
        tokenHref: "/tokens/tok_stored",
        brand: "mastercard",
        last4: "4444",
        expiryMonth: 12,
        expiryYear: 2030,
      })

      // Include three_d_secure so this routes to CIT, not MIT
      const res = await makeRequest(
        cardTokenRequest({ three_d_secure: { enabled: true } }),
      )
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toMatch(/^pi_/)
      expect(body.amount).toBe(100)
      expect(body.currency).toBe("USD")
    })
  })

  // ── AC3: Manual capture → requires_capture ──
  describe("AC3: Manual capture → requires_capture", () => {
    it("returns status:requires_capture when capture_method is manual", async () => {
      const { wpCall } = setupDeps({
        wpCall: vi.fn(async (path: string) => {
          if (path === "/fraudsight/assessment") return makeFraudSightPass()
          if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse(true)
          throw new Error(`Unmocked: ${path}`)
        }),
      })

      const res = await makeRequest(cardRequest({ capture_method: "manual" }))
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("requires_capture")

      // Verify requestAutoSettlement is false
      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      const ras = instruction?.requestAutoSettlement as Record<string, unknown>
      expect(ras?.enabled).toBe(false)
    })
  })

  // ── AC5: FraudSight highRisk+block → payment_failed ──
  describe("AC5: FraudSight highRisk+block → payment_failed", () => {
    it("returns payment_failed when FraudSight blocks high risk", async () => {
      const { wpCall } = setupDeps({
        wpCall: vi.fn(async (path: string) => {
          if (path === "/fraudsight/assessment") return makeFraudSightBlock()
          return makeCitAuthorizeResponse()
        }),
      })

      const res = await makeRequest(cardRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("payment_failed")
      expect(body.failure_code).toBe("high_risk")
      expect(body.failure_message).toBe("Payment blocked by fraud screening")

      // Verify CIT authorize was NOT called (blocked at fraud stage)
      const citCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      expect(citCalls.length).toBe(0)
    })
  })

  // ── AC11: Worldpay refusal → payment_failed ──
  describe("AC11: Worldpay refusal → payment_failed", () => {
    it("returns payment_failed with refusal code when Worldpay refuses", async () => {
      setupDeps({
        wpCall: vi.fn(async (path: string) => {
          if (path === "/fraudsight/assessment") return makeFraudSightPass()
          if (path === "/cardPayments/customerInitiatedTransactions") return makeCitRefuseResponse()
          throw new Error(`Unmocked: ${path}`)
        }),
      })

      const res = await makeRequest(cardRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("payment_failed")
      expect(body.failure_code).toBe("5")
      expect(body.failure_message).toBe("REFUSED")
    })
  })

  // ── AC8: Invalid input → 400 ──
  describe("AC8: Invalid input → 400", () => {
    it("returns 400 for negative amount", async () => {
      setupDeps()
      const res = await makeRequest(cardRequest({ amount: -1 }))
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for zero amount", async () => {
      setupDeps()
      const res = await makeRequest(cardRequest({ amount: 0 }))
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for invalid currency (too long)", async () => {
      setupDeps()
      const res = await makeRequest(cardRequest({ currency: "ABCD" }))
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for empty currency", async () => {
      setupDeps()
      const res = await makeRequest(cardRequest({ currency: "" }))
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for missing amount", async () => {
      setupDeps()
      const { amount, ...noAmount } = cardRequest()
      const res = await makeRequest(noAmount)
      const body = await jsonBody(res)
      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 401 for invalid API key", async () => {
      setupDeps()
      const res = await makeRequest(cardRequest(), "bad_key")
      const body = await jsonBody(res)
      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })

  // ── AC9: setup_future_usage stores schemeReference ──
  describe("AC9: setup_future_usage stores schemeReference", () => {
    it("stores schemeReference when setup_future_usage is off_session", async () => {
      const { wpCall } = setupDeps()

      const res = await makeRequest(
        cardRequest({ setup_future_usage: "off_session" }),
      )
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")

      // Check schemeReference stored in DB
      const pi = getMockStore().paymentIntents.get(body.id)
      expect(pi?.schemeReference).toBe("MCCOLXT1C0104")

      // Check customerAgreement in CIT body
      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      const ca = instruction?.customerAgreement as Record<string, unknown>
      expect(ca).toBeTruthy()
      expect(ca.type).toBe("cardOnFile")
      expect(ca.storedCardUsage).toBe("first")
    })
  })

  // ── AC10: Description/metadata stored locally ──
  describe("AC10: Description/metadata stored locally", () => {
    it("stores description and metadata locally, not in Worldpay requests", async () => {
      const { wpCall } = setupDeps()

      const res = await makeRequest(
        cardRequest({
          description: "Order #12345",
          metadata: { order_id: "12345", source: "web" },
        }),
      )
      const body = await jsonBody(res)

      // Check DB has description + metadata
      const pi = getMockStore().paymentIntents.get(body.id)
      expect(pi?.description).toBe("Order #12345")
      expect(pi?.metadata).toEqual({ order_id: "12345", source: "web" })

      // Check CIT body does NOT contain description or metadata
      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      expect(citBody.description).toBeUndefined()
      expect(citBody.metadata).toBeUndefined()
    })
  })

  // ── AC13: Statement descriptor truncated ──
  describe("AC13: Statement descriptor → narrative.line1", () => {
    it("sends statement_descriptor as narrative.line1, truncated to 24 chars", async () => {
      const { wpCall } = setupDeps()

      await makeRequest(
        cardRequest({
          statement_descriptor: "This is a very long descriptor text",
        }),
      )

      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      const narrative = instruction?.narrative as Record<string, unknown>
      expect(narrative?.line1).toBe("This is a very long desc") // 24 chars
    })

    it("does not send narrative when no statement_descriptor", async () => {
      const { wpCall } = setupDeps()

      await makeRequest(cardRequest())

      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      expect(instruction?.narrative).toBeUndefined()
    })
  })
})

// ─── MIT Payment Tests ──────────────────────────────────────────

describe("MIT Payments — merchant-initiated off-session transactions", () => {
  // ── MIT AC1: Happy path → succeeded ──
  describe("MIT happy path → succeeded", () => {
    it("returns 200 with status:succeeded for MIT payment with valid prior CIT", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      const res = await makeRequest(mitRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toMatch(/^pi_/)
      expect(body.object).toBe("payment_intent")
      expect(body.payment_method_details.type).toBe("card")
      expect(body.payment_method_details.card.brand).toBe("visa")
      expect(body.payment_method_details.card.last4).toBe("0004")

      // Verify MIT endpoint was called (not CIT)
      const mitCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      )
      expect(mitCalls.length).toBe(1)

      const citCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      expect(citCalls.length).toBe(0)

      // Verify PI stored in DB with correct status
      const pi = getMockStore().paymentIntents.get(body.id)
      expect(pi).toBeTruthy()
      expect(pi?.status).toBe("succeeded")
      expect(pi?.paymentMethodId).toBe(MIT_TOKEN_ID)
    })
  })

  // ── MIT AC2: Skips FraudSight, DDC, 3DS ──
  describe("MIT skips FraudSight, DDC, 3DS", () => {
    it("does not call FraudSight assessment for MIT payments", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const fraudCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/fraudsight/assessment",
      )
      expect(fraudCalls.length).toBe(0)
    })

    it("does not include riskProfile in MIT request body", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      expect(mitBody.riskProfile).toBeUndefined()
    })

    it("does not include authentication block in MIT request body", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      expect(mitBody.authentication).toBeUndefined()
    })

    it("does not call DDC / 3DS endpoints at all", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      // Verify only MIT endpoint was called
      const allPaths = (wpCall as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      )
      expect(allPaths).not.toContain("/ddc")
      expect(allPaths).not.toContain("/threeDSecure")
      expect(allPaths).not.toContain("/fraudsight/assessment")
      expect(allPaths).toContain("/cardPayments/merchantInitiatedTransactions")
    })
  })

  // ── MIT AC3: MIT request structure ──
  describe("MIT request includes correct customerAgreement and paymentInstrument", () => {
    it("includes customerAgreement with type:unscheduled and storedCardUsage:subsequent", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      const instruction = mitBody?.instruction as Record<string, unknown>
      const ca = instruction?.customerAgreement as Record<string, unknown>

      expect(ca).toBeTruthy()
      expect(ca.type).toBe("unscheduled")
      expect(ca.storedCardUsage).toBe("subsequent")
    })

    it("includes schemeReference from the prior CIT", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      const instruction = mitBody?.instruction as Record<string, unknown>
      const ca = instruction?.customerAgreement as Record<string, unknown>

      expect(ca.schemeReference).toBe("MCCOLXT1C0104")
    })

    it("uses paymentInstrument type card/token with href pointing to stored token", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      const instruction = mitBody?.instruction as Record<string, unknown>
      const pi = instruction?.paymentInstrument as Record<string, unknown>

      expect(pi.type).toBe("card/token")
      expect(pi.href).toBe("/tokens/tok_mit_stored")
    })

    it("still injects PayFac info in MIT request", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      await makeRequest(mitRequest())

      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      ) as unknown[] | undefined
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      const merchant = mitBody?.merchant as Record<string, unknown>
      const payFac = merchant?.paymentFacilitator as Record<string, unknown>

      expect(payFac).toBeTruthy()
      expect(payFac.schemeId).toBe("SCHEME123")
      expect(payFac.subMerchant).toEqual({
        reference: "sub_001",
        name: "Test Merchant Ltd",
        address: {
          line1: "1 Test Street",
          city: "London",
          postalCode: "EC1A 1BB",
          country: "GB",
        },
      })
    })
  })

  // ── MIT AC4: MIT without prior CIT → 400 mit_requires_cit ──
  describe("MIT without prior CIT → 400 mit_requires_cit", () => {
    it("returns 400 mit_requires_cit when token has no CIT record", async () => {
      setupDeps()
      // Seed only the payment method, no CIT record
      seedPaymentMethod(MIT_TOKEN_ID)

      const res = await makeRequest(mitRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("mit_requires_cit")
      expect(body.error.message).toBe("No prior CIT payment found for this token")
    })
  })

  // ── MIT AC5: MIT with CIT that had no setup_future_usage → 400 mit_not_setup ──
  describe("MIT with CIT lacking setup_future_usage → 400 mit_not_setup", () => {
    it("returns 400 mit_not_setup when CIT exists but without off_session setup", async () => {
      setupDeps()
      seedPaymentMethod(MIT_TOKEN_ID)
      // Seed a CIT without setup_future_usage
      seedCitWithoutOffSession("pi_cit_plain", MIT_TOKEN_ID)

      const res = await makeRequest(mitRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("mit_not_setup")
      expect(body.error.message).toBe("Token was not set up for off-session payments")
    })
  })

  // ── MIT AC6: CIT with setup_future_usage stores schemeReference ──
  describe("CIT with setup_future_usage stores schemeReference", () => {
    it("stores schemeReference on the CIT PI record for later MIT use", async () => {
      const { wpCall } = setupDeps()

      const res = await makeRequest(
        cardRequest({ setup_future_usage: "off_session" }),
      )
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")

      const pi = getMockStore().paymentIntents.get(body.id)
      expect(pi?.schemeReference).toBe("MCCOLXT1C0104")
      expect(pi?.setupFutureUsage).toBe("off_session")

      // Verify CIT call included customerAgreement
      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      const ca = instruction?.customerAgreement as Record<string, unknown>
      expect(ca).toBeTruthy()
      expect(ca.type).toBe("cardOnFile")
      expect(ca.storedCardUsage).toBe("first")
    })
  })

  // ── MIT AC7: Multiple MIT payments against same token ──
  describe("Multiple MIT payments against same token", () => {
    it("allows multiple MIT payments using the same stored token", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      // First MIT
      const res1 = await makeRequest(mitRequest())
      const body1 = await jsonBody(res1)
      expect(res1.status).toBe(200)
      expect(body1.status).toBe("succeeded")

      // Second MIT
      const res2 = await makeRequest(mitRequest())
      const body2 = await jsonBody(res2)
      expect(res2.status).toBe(200)
      expect(body2.status).toBe("succeeded")

      // Third MIT
      const res3 = await makeRequest(mitRequest())
      const body3 = await jsonBody(res3)
      expect(res3.status).toBe(200)
      expect(body3.status).toBe("succeeded")

      // Verify 3 distinct PIs created
      expect(body1.id).not.toBe(body2.id)
      expect(body2.id).not.toBe(body3.id)

      // Verify all 3 MIT calls went through
      const mitCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      )
      expect(mitCalls.length).toBe(3)

      // Each MIT call should have the schemeReference
      for (const call of mitCalls) {
        const mitBody = (call as unknown[])[2]?.body as Record<string, unknown>
        const instruction = mitBody?.instruction as Record<string, unknown>
        const ca = instruction?.customerAgreement as Record<string, unknown>
        expect(ca.schemeReference).toBe("MCCOLXT1C0104")
      }
    })
  })

  // ── MIT AC8: Token invalid / deleted → 400 token_invalid ──
  describe("MIT with invalid or deleted token → 400 token_invalid", () => {
    it("returns 400 token_invalid when PaymentMethod record does not exist", async () => {
      setupDeps()
      // Do NOT seed the payment method — it doesn't exist

      const res = await makeRequest(mitRequest("pm_nonexistent"))
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("token_invalid")
      expect(body.error.message).toContain("not found")
    })

    it("returns 400 token_invalid when PaymentMethod belongs to different merchant", async () => {
      setupDeps()

      // Seed a payment method but with a different merchant
      seedPaymentMethod("pm_other_merchant", { merchantId: "m_other_merchant" })
      seedCitWithOffSession("pi_cit_other", "pm_other_merchant", "m_other_merchant")

      const res = await makeRequest(mitRequest("pm_other_merchant"))
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("token_invalid")
    })
  })

  // ── MIT AC9: Manual capture MIT → requires_capture ──
  describe("MIT with manual capture", () => {
    it("returns requires_capture when capture_method is manual", async () => {
      const { wpCall } = setupDeps({
        wpCall: vi.fn(async (path: string) => {
          if (path === "/cardPayments/merchantInitiatedTransactions") {
            return { outcome: "authorized", payment: { id: "wp_mit_man" }, _links: {} }
          }
          throw new Error(`Unmocked: ${path}`)
        }),
      })
      seedMitSetup()

      const res = await makeRequest(mitRequest(undefined, { capture_method: "manual" }))
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("requires_capture")

      // Verify requestAutoSettlement.enabled = false
      const mitCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      )
      const mitBody = mitCall?.[2]?.body as Record<string, unknown>
      const instruction = mitBody?.instruction as Record<string, unknown>
      const ras = instruction?.requestAutoSettlement as Record<string, unknown>
      expect(ras?.enabled).toBe(false)
    })
  })

  // ── MIT AC10: MIT refused by Worldpay → payment_failed ──
  describe("MIT refused by Worldpay", () => {
    it("returns payment_failed when Worldpay refuses the MIT", async () => {
      setupDeps({
        wpCall: vi.fn(async (path: string) => {
          if (path === "/cardPayments/merchantInitiatedTransactions") {
            return {
              outcome: "refused",
              refusal: { code: "2009", description: "CARD EXPIRED" },
            }
          }
          throw new Error(`Unmocked: ${path}`)
        }),
      })
      seedMitSetup()

      const res = await makeRequest(mitRequest())
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("payment_failed")
      expect(body.failure_code).toBe("2009")
      expect(body.failure_message).toBe("CARD EXPIRED")
    })
  })

  // ── MIT AC11: MIT does not set schemeReference on new PI ──
  describe("MIT PI record does NOT store schemeReference", () => {
    it("MIT payment does not overwrite or store schemeReference on the new PI", async () => {
      setupDeps()
      seedMitSetup()

      const res = await makeRequest(mitRequest())
      const body = await jsonBody(res)

      const pi = getMockStore().paymentIntents.get(body.id)
      // MIT PI should not have schemeReference (undefined in mock, null in real DB)
      expect(pi?.schemeReference ?? null).toBeNull()

      // Verify the CIT record still has its schemeReference
      const citPi = getMockStore().paymentIntents.get("pi_cit_mit_token001")
      expect(citPi?.schemeReference).toBe("MCCOLXT1C0104")
    })
  })

  // ── MIT AC12: MIT with three_d_secure routes to CIT, not MIT ──
  describe("MIT routing: three_d_secure prevents MIT routing", () => {
    it("routes to CIT when three_d_secure is present even with card_token", async () => {
      const { wpCall } = setupDeps()
      seedMitSetup()

      const res = await makeRequest(
        mitRequest(undefined, { three_d_secure: { enabled: true } }),
      )
      const body = await jsonBody(res)

      // Should route to CIT (with three_d_secure), so CIT endpoint called
      expect(res.status).toBe(200)

      const mitCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/merchantInitiatedTransactions",
      )
      expect(mitCalls.length).toBe(0)

      const citCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      expect(citCalls.length).toBe(1)
    })
  })
})

// ── GET /api/v1/payment_intents/{id} ──
describe("GET /api/v1/payment_intents/{id}", () => {
  describe("AC7: GET returns correct PI with masked card", () => {
    it("returns the payment intent with masked card details", async () => {
      // First create a PI
      setupDeps()
      const createRes = await makeRequest(cardRequest())
      const createBody = await jsonBody(createRes)
      const piId = createBody.id

      // Now fetch it
      const res = await makeGetRequest(piId)
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toBe(piId)
      expect(body.object).toBe("payment_intent")
      expect(body.amount).toBe(250)
      expect(body.currency).toBe("GBP")
      expect(body.status).toBe("succeeded")
      expect(body.payment_method_details.type).toBe("card")
      expect(body.payment_method_details.card.brand).toBe("visa")
      expect(body.payment_method_details.card.last4).toBe("1111")
      // Full card number must not be present
      expect(body.payment_method_details.card.number).toBeUndefined()
      expect(body.payment_method_details.card.cvc).toBeUndefined()
    })

    it("returns the payment intent for MIT payments too", async () => {
      setupDeps()
      // Seed MIT setup
      seedPaymentMethod("pm_mit_get")
      seedCitWithOffSession("pi_cit_get", "pm_mit_get")

      const createRes = await makeRequest(mitRequest("pm_mit_get"))
      const createBody = await jsonBody(createRes)
      const piId = createBody.id

      const res = await makeGetRequest(piId)
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toBe(piId)
      expect(body.status).toBe("succeeded")
      expect(body.payment_method_details.type).toBe("card")
      expect(body.payment_method_details.card.brand).toBe("visa")
    })

    it("returns 404 for non-existent PI", async () => {
      setupDeps()
      const res = await makeGetRequest("pi_nonexistent")
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })

    it("returns 404 for PI belonging to different merchant", async () => {
      setupDeps()
      // Create a PI with main merchant
      const createRes = await makeRequest(cardRequest())
      const createBody = await jsonBody(createRes)
      const piId = createBody.id

      // Try to fetch with a different merchant — override resolveMerchant
      __setGetDeps({
        resolveMerchant: async () => ({
          merchantId: "m_other",
          entity: "other_entity",
          payFacConfig: {
            schemeId: "OTHER",
            subMerchant: { reference: "other", name: "Other", address: {} },
          },
        }),
      })

      const res = await makeGetRequest(piId)
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })
  })

  it("returns 401 for invalid API key", async () => {
    setupDeps()
    const createRes = await makeRequest(cardRequest())
    const createBody = await jsonBody(createRes)

    const res = await makeGetRequest(createBody.id, "bad_key")
    const body = await jsonBody(res)

    expect(res.status).toBe(401)
    expect(body.error.code).toBe("authentication_error")
  })
})
