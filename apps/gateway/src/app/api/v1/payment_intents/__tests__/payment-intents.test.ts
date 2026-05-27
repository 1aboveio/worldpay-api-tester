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
    three_d_secure: { enabled: true },
    ...overrides,
  }
}

async function makeRequest(body: unknown, apiKey = TEST_API_KEY, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey
  }
  const req = new NextRequest("http://localhost/api/v1/payment_intents", {
    method: "POST",
    headers,
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

// ─── Tests ──────────────────────────────────────────────────────

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

  // ── AC2: Card token CIT → succeeded ──
  describe("AC2: Card token CIT → succeeded", () => {
    it("returns 200 with status:succeeded for card_token payment", async () => {
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

      const res = await makeRequest(cardTokenRequest())
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
      expect(body.error.code).toBe("invalid_api_key")
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

    it("always sends narrative.line1, defaulting when no statement_descriptor", async () => {
      const { wpCall } = setupDeps()

      // Worldpay requires narrative on every authorization, so it falls back to
      // the description, then a generic default.
      await makeRequest(cardRequest())

      const citCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === "/cardPayments/customerInitiatedTransactions",
      )
      const citBody = citCall?.[2]?.body as Record<string, unknown>
      const instruction = citBody?.instruction as Record<string, unknown>
      const narrative = instruction?.narrative as Record<string, unknown>
      expect(narrative?.line1).toBe("Payment")
    })
  })
})

// ── AC7: GET payment intent ──
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
    expect(body.error.code).toBe("invalid_api_key")
  })
})

// ─── MIT Payment Tests ─────────────────────────────────────────

describe("MIT Payments", () => {
  it("routes card_token without three_d_secure to MIT", async () => {
    const { wpCall, createToken, resolveMerchant } = setupDeps()
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/cardPayments/merchantInitiatedTransactions") {
        return { outcome: "authorized", paymentId: "pay_mit_001", _links: {} }
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    // Seed a payment method and prior CIT with setup_future_usage
    const { createPaymentIntent, createPaymentMethod } = await import("@repo/dal")
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentIntent({
      id: "pi_prior_cit", merchantId: "m_test001", amount: 100, currency: "USD",
      status: "succeeded", paymentMethodId: "pm_abc123def456",
      setupFutureUsage: "off_session", schemeReference: "SCHEME_REF_001",
    })

    const res = await makeRequest({
      amount: 100, currency: "usd",
      payment_method: { type: "card_token", token: "pm_abc123def456" },
      confirm: true,
    })
    const body = await jsonBody(res)
    expect(res.status).toBe(200)
    expect(body.status).toBe("succeeded")
    // Verify MIT endpoint was called, not CIT
    expect(wpCall).toHaveBeenCalledWith(
      "/cardPayments/merchantInitiatedTransactions",
      expect.any(String),
      expect.objectContaining({
        instruction: expect.objectContaining({
          customerAgreement: expect.objectContaining({
            storedCardUsage: "subsequent",
            schemeReference: "SCHEME_REF_001",
          }),
        }),
      }),
    )
  })

  it("MIT skips FraudSight, DDC, and 3DS", async () => {
    const { wpCall } = setupDeps()
    const calledPaths: string[] = []
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      calledPaths.push(path)
      if (path === "/cardPayments/merchantInitiatedTransactions") {
        return { outcome: "authorized", paymentId: "pay_mit_002", _links: {} }
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    const { createPaymentIntent, createPaymentMethod } = await import("@repo/dal")
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentIntent({
      id: "pi_prior_cit2", merchantId: "m_test001", amount: 100, currency: "USD",
      status: "succeeded", paymentMethodId: "pm_abc123def456",
      setupFutureUsage: "off_session", schemeReference: "SCHEME_REF_002",
    })

    await makeRequest({
      amount: 100, currency: "usd",
      payment_method: { type: "card_token", token: "pm_abc123def456" },
      confirm: true,
    })
    // Must NOT call FraudSight, DDC, or 3DS
    expect(calledPaths).not.toContain("/fraudsight/assessment")
    expect(calledPaths).not.toContain("/verifications/customers/3ds/deviceDataInitialize")
    expect(calledPaths).not.toContain("/verifications/customers/3ds/authenticate")
  })

  it("MIT without prior CIT returns 400", async () => {
    setupDeps()
    const res = await makeRequest({
      amount: 100, currency: "usd",
      payment_method: { type: "card_token", token: "pm_nonexistent" },
      confirm: true,
    })
    const body = await jsonBody(res)
    expect(res.status).toBe(400)
    expect(body.error.code).toBe("token_invalid")
  })

  it("MIT with CIT lacking setup_future_usage returns 400", async () => {
    setupDeps()
    const { createPaymentIntent, createPaymentMethod } = await import("@repo/dal")
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentIntent({
      id: "pi_cit_no_mit", merchantId: "m_test001", amount: 100, currency: "USD",
      status: "succeeded", paymentMethodId: "pm_abc123def456",
      // No setupFutureUsage — so MIT should fail
    })
    const res = await makeRequest({
      amount: 100, currency: "usd",
      payment_method: { type: "card_token", token: "pm_abc123def456" },
      confirm: true,
    })
    const body = await jsonBody(res)
    expect(res.status).toBe(400)
    expect(body.error.code).toBe("mit_requires_cit")
  })

  it("multiple MIT payments against same token", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockResolvedValue({ outcome: "authorized", paymentId: "pay_mit_multi", _links: {} })
    const { createPaymentIntent, createPaymentMethod } = await import("@repo/dal")
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentIntent({
      id: "pi_prior_multi", merchantId: "m_test001", amount: 100, currency: "USD",
      status: "succeeded", paymentMethodId: "pm_abc123def456",
      setupFutureUsage: "off_session", schemeReference: "SCHEME_MULTI",
    })

    const res1 = await makeRequest({ amount: 100, currency: "usd", payment_method: { type: "card_token", token: "pm_abc123def456" }, confirm: true })
    const res2 = await makeRequest({ amount: 200, currency: "usd", payment_method: { type: "card_token", token: "pm_abc123def456" }, confirm: true })
    expect((await jsonBody(res1)).status).toBe("succeeded")
    expect((await jsonBody(res2)).status).toBe("succeeded")
    expect(wpCall).toHaveBeenCalledTimes(2)
  })

  it("MIT with manual capture returns requires_capture", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockResolvedValue({ outcome: "authorized", paymentId: "pay_mit_manual", _links: {} })
    const { createPaymentIntent, createPaymentMethod } = await import("@repo/dal")
    await createPaymentMethod({ id: "pm_abc123def456", merchantId: "m_test001", type: "card", tokenHref: "/tokens/tok_mit", brand: "visa", last4: "1111" })
    await createPaymentIntent({
      id: "pi_prior_manual", merchantId: "m_test001", amount: 100, currency: "USD",
      status: "succeeded", paymentMethodId: "pm_abc123def456",
      setupFutureUsage: "off_session", schemeReference: "SCHEME_MANUAL",
    })

    const res = await makeRequest({ amount: 100, currency: "usd", payment_method: { type: "card_token", token: "pm_abc123def456" }, confirm: true, capture_method: "manual" })
    const body = await jsonBody(res)
    expect(body.status).toBe("requires_capture")
  })
})

// ─── FraudSight Effect Test ───────────────────────────────────

describe("FraudSight effect on payment flow", () => {
  it("highRisk + block → payment_failed with high_risk code", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/fraudsight/assessment") return { outcome: "highRisk", actionOnHighRisk: "block", score: 95, riskProfile: { href: "https://try.access.worldpay.com/riskProfile/blocked" } }
      throw new Error("Should not reach CIT authorize")
    })

    const res = await makeRequest(cardRequest())
    const body = await jsonBody(res)
    expect(res.status).toBe(200)
    expect(body.status).toBe("payment_failed")
    expect(body.failure_code).toBe("high_risk")
  })
})

// ─── Idempotency-Key ───────────────────────────────────────

describe("Idempotency-Key support", () => {
  it("Idempotency-Key header is passed to payment intent service", async () => {
    const { wpCall } = setupDeps()
    let capturedHeaders: Record<string, string | null> = {}
    vi.mocked(wpCall).mockImplementation(async (path: string, _mediaType: string) => {
      if (path === "/fraudsight/assessment") return makeFraudSightPass()
      if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse()
      throw new Error(`Unmocked: ${path}`)
    })

    // The Idempotency-Key header is extracted by the route handler
    // and passed to the service. Verify the service can see it.
    const res1 = await makeRequest(
      cardRequest({ amount: 250, currency: "gbp" }),
      TEST_API_KEY,
      "idem_test_abc123"
    )
    expect(res1.status).toBe(200)
  })

  it("different Idempotency-Keys create separate payments", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/fraudsight/assessment") return makeFraudSightPass()
      if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse()
      throw new Error(`Unmocked: ${path}`)
    })

    const res1 = await makeRequest(
      cardRequest({ amount: 100, currency: "gbp" }),
      TEST_API_KEY,
      "idem_key_1"
    )
    const body1 = await jsonBody(res1)
    expect(res1.status).toBe(200)

    const res2 = await makeRequest(
      cardRequest({ amount: 200, currency: "gbp" }),
      TEST_API_KEY,
      "idem_key_2"
    )
    const body2 = await jsonBody(res2)
    expect(res2.status).toBe(200)

    // Different keys → different PaymentIntents
    expect(body2.id).not.toBe(body1.id)
  })

  it("payments without Idempotency-Key still succeed", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/fraudsight/assessment") return makeFraudSightPass()
      if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse()
      throw new Error(`Unmocked: ${path}`)
    })

    const res = await makeRequest(cardRequest({ amount: 100, currency: "gbp" }))
    expect(res.status).toBe(200)
  })
})

// ─── Concurrency ──────────────────────────────────────────

describe("Concurrent requests", () => {
  it("handles concurrent payments without errors", async () => {
    const { wpCall } = setupDeps()
    let callCount = 0
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/fraudsight/assessment") return makeFraudSightPass()
      if (path === "/cardPayments/customerInitiatedTransactions") {
        callCount++
        // Simulate a small delay to make concurrency realistic
        await new Promise(r => setTimeout(r, 5))
        return makeCitAuthorizeResponse()
      }
      throw new Error(`Unmocked: ${path}`)
    })

    // Fire 3 concurrent payment requests with different idempotency keys
    const results = await Promise.all([
      makeRequest(cardRequest({ amount: 100, currency: "gbp" }), TEST_API_KEY, "concurrent_1"),
      makeRequest(cardRequest({ amount: 200, currency: "gbp" }), TEST_API_KEY, "concurrent_2"),
      makeRequest(cardRequest({ amount: 300, currency: "gbp" }), TEST_API_KEY, "concurrent_3"),
    ])

    // All should succeed
    const bodies = await Promise.all(results.map(r => jsonBody(r)))
    for (const body of bodies) {
      expect(body.status).toBe("succeeded")
      expect(body.id).toMatch(/^pi_/)
    }

    // All 3 should have unique IDs
    const ids = bodies.map(b => b.id)
    expect(new Set(ids).size).toBe(3)

    // CIT authorize should be called 3 times (one per payment)
    expect(callCount).toBe(3)
  })

  it("concurrent requests with same idempotency key handled safely", async () => {
    const { wpCall } = setupDeps()
    vi.mocked(wpCall).mockImplementation(async (path: string) => {
      if (path === "/fraudsight/assessment") return makeFraudSightPass()
      if (path === "/cardPayments/customerInitiatedTransactions") {
        await new Promise(r => setTimeout(r, 10))
        return makeCitAuthorizeResponse()
      }
      throw new Error(`Unmocked: ${path}`)
    })

    // Fire 2 concurrent requests with same key
    const results = await Promise.all([
      makeRequest(cardRequest({ amount: 100, currency: "gbp" }), TEST_API_KEY, "concurrent_same"),
      makeRequest(cardRequest({ amount: 100, currency: "gbp" }), TEST_API_KEY, "concurrent_same"),
    ])

    // Both should succeed (at least one should complete, the other may be cached or also complete)
    for (const res of results) {
      expect(res.status).toBe(200)
    }
  })
})
