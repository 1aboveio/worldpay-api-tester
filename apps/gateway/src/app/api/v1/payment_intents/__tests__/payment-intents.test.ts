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
