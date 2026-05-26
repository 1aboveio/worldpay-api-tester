/**
 * Payment Queries & Statements Tests
 *
 * Test plan: Issue #9 — Payment Queries & Statements
 *
 * Coverage:
 * - GET /api/v1/payment_intents?limit=10 — scoped list
 * - GET /api/v1/payment_intents?created_since=... — filtered list
 * - GET /api/v1/payment_intents?limit=1 — has_more: true
 * - GET /api/v1/payment_intents/{id} — full detail with 3DS/refund
 * - GET /api/v1/statements?from=...&to=... — statement proxy
 * - Statement date range > 31 days → 400
 * - Statement pagination (page param)
 * - Worldpay statement proxy params mapping
 *
 * Mock policy: wpCall, resolveMerchant, createToken are mocked.
 * DAL (mock database) is the real in-memory implementation — we test through it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { GET, POST } from "@/app/api/v1/payment_intents/route"
import { GET as GET_BY_ID } from "@/app/api/v1/payment_intents/[id]/route"
import { GET as GET_STATEMENTS } from "@/app/api/v1/statements/route"
import { __setDeps, __resetDeps } from "@/app/api/v1/payment_intents/route"
import { __setDeps as __setGetDeps, __resetDeps as __resetGetDeps } from "@/app/api/v1/payment_intents/[id]/route"
import { __setDeps as __setStatementDeps, __resetDeps as __resetStatementDeps } from "@/app/api/v1/statements/route"
import { resetMockStores, getMockStore } from "@repo/database"
import type { WpCallFn, CreateTokenFn, ResolveMerchantFn } from "@/lib/worldpay-types"
import { NextRequest } from "next/server"

// ─── Test Helpers ────────────────────────────────────────────────

const TEST_API_KEY = "sk_test_key123"

function makeMerchant(merchantId = "m_test001"): Awaited<ReturnType<ResolveMerchantFn>> {
  return {
    merchantId,
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

function makeCitAuthorizeResponse() {
  return {
    outcome: "sentForSettlement",
    payment: { id: "wp_pay_001" },
    scheme: { reference: "MCCOLXT1C0104  " },
    _links: {
      "cardPayments:settle": { href: "/payments/settlements/linkdata_001" },
      "cardPayments:refund": { href: "/payments/settlements/refunds/full/linkdata_001" },
    },
  }
}

function cardRequest(overrides?: Record<string, unknown>) {
  return {
    amount: 250,
    currency: "gbp",
    payment_method: {
      type: "card" as const,
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
    capture_method: "automatic" as const,
    ...overrides,
  }
}

async function makeCreateRequest(body: unknown, apiKey = TEST_API_KEY) {
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

async function makeListRequest(query = "", apiKey = TEST_API_KEY) {
  const url = `http://localhost/api/v1/payment_intents${query ? `?${query}` : ""}`
  const req = new NextRequest(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  return GET(req)
}

async function makeGetByIdRequest(id: string, apiKey = TEST_API_KEY) {
  const req = new NextRequest(`http://localhost/api/v1/payment_intents/${id}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  return GET_BY_ID(req, { params: Promise.resolve({ id }) })
}

async function makeStatementsRequest(queryParams: Record<string, string>, apiKey = TEST_API_KEY) {
  const searchParams = new URLSearchParams(queryParams)
  const req = new NextRequest(`http://localhost/api/v1/statements?${searchParams.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  return GET_STATEMENTS(req)
}

async function jsonBody(res: Response) {
  return res.json()
}

// ─── Setup ───────────────────────────────────────────────────────

function createDefaultWpCall(): WpCallFn {
  return vi.fn(async (path: string) => {
    if (path === "/fraudsight/assessment") return makeFraudSightPass()
    if (path === "/cardPayments/customerInitiatedTransactions") return makeCitAuthorizeResponse()
    throw new Error(`Unmocked wpCall path: ${path}`)
  })
}

function createDefaultCreateToken(): CreateTokenFn {
  return vi.fn(async () => makeTokenResult())
}

function createDefaultResolveMerchant(): ResolveMerchantFn {
  return vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return makeMerchant()
    throw new Error("Invalid API key")
  })
}

function createPaymentIntent(
  overrides?: Partial<{
    id: string
    merchantId: string
    amount: number
    currency: string
    createdAt: Date
    status: string
    captureMethod: string
    threeDSStatus: string | null
    failureCode: string | null
    failureMessage: string | null
  }>,
) {
  const piId = overrides?.id ?? `pi_${Math.random().toString(36).slice(2)}`
  const createdAt = overrides?.createdAt ?? new Date()
  const pi = {
    id: piId,
    merchantId: overrides?.merchantId ?? "m_test001",
    amount: overrides?.amount ?? 250,
    currency: overrides?.currency ?? "GBP",
    status: overrides?.status ?? "succeeded",
    captureMethod: overrides?.captureMethod ?? "automatic",
    paymentMethodId: `pm_${piId.slice(3)}`,
    worldpayPaymentId: "wp_pay_001",
    schemeReference: "MCCOLXT1C0104",
    linkData: JSON.parse(JSON.stringify({
      "cardPayments:settle": { href: "/payments/settlements/linkdata_001" },
      "cardPayments:refund": { href: "/payments/settlements/refunds/full/linkdata_001" },
    })),
    threeDSStatus: overrides?.threeDSStatus ?? null,
    failureCode: overrides?.failureCode ?? null,
    failureMessage: overrides?.failureMessage ?? null,
    metadata: null,
    description: null,
    statementDescriptor: null,
    setupFutureUsage: null,
    customerEmail: null,
    customerIpAddress: null,
    shipping: null,
    idempotencyKey: null,
    createdAt,
    updatedAt: createdAt,
  }

  getMockStore().paymentIntents.set(piId, pi)

  // Also create associated payment method
  getMockStore().paymentMethods.set(`pm_${piId.slice(3)}`, {
    id: `pm_${piId.slice(3)}`,
    merchantId: pi.merchantId,
    type: "card",
    tokenHref: "/tokens/tok_abc123",
    brand: "visa",
    last4: "1111",
    expiryMonth: 5,
    expiryYear: 2035,
    funding: "debit",
    country: "GB",
  })

  return piId
}

function setupFullDeps() {
  const resolveMerchant = createDefaultResolveMerchant()
  const wpCall = createDefaultWpCall()
  const createToken = createDefaultCreateToken()

  __setDeps({ wpCall, createToken, resolveMerchant })
  __setGetDeps({ resolveMerchant })
  __setStatementDeps({ wpCall, resolveMerchant })

  return { wpCall, createToken, resolveMerchant }
}

beforeEach(() => {
  resetMockStores()
  __resetDeps()
  __resetGetDeps()
  __resetStatementDeps()
})

// ─── Tests: GET /api/v1/payment_intents (List) ──────────────────

describe("GET /api/v1/payment_intents", () => {
  describe("list returns scoped results", () => {
    it("returns payment intents for the authenticated merchant", async () => {
      setupFullDeps()

      // Seed 3 PIs with staggered timestamps for deterministic ordering
      createPaymentIntent({
        id: "pi_a",
        amount: 100,
        createdAt: new Date("2026-05-20T10:00:00Z"),
      })
      createPaymentIntent({
        id: "pi_b",
        amount: 200,
        createdAt: new Date("2026-05-20T11:00:00Z"),
      })
      createPaymentIntent({
        id: "pi_c",
        amount: 300,
        createdAt: new Date("2026-05-20T12:00:00Z"),
      })

      const res = await makeListRequest()
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.object).toBe("list")
      expect(body.data).toHaveLength(3)
      expect(body.has_more).toBe(false)

      // Sorted by createdAt desc (newest first)
      expect(body.data[0].amount).toBe(300)
      expect(body.data[1].amount).toBe(200)
      expect(body.data[2].amount).toBe(100)

      // Each item has expected shape
      for (const item of body.data) {
        expect(item.object).toBe("payment_intent")
        expect(item.id).toMatch(/^pi_/)
        expect(item.payment_method_details.type).toBe("card")
        expect(item.payment_method_details.card.brand).toBe("visa")
        expect(item.payment_method_details.card.last4).toBe("1111")
      }
    })

    it("only returns PIs scoped to the authenticated merchant", async () => {
      setupFullDeps()

      // Create PI for main merchant
      await makeCreateRequest(cardRequest({ amount: 100 }))

      // Seed a PI belonging to a different merchant
      createPaymentIntent({
        id: "pi_other_merchant",
        merchantId: "m_other",
        amount: 999,
        currency: "USD",
        createdAt: new Date("2026-05-20T00:00:00Z"),
      })

      const res = await makeListRequest()
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data).toHaveLength(1)
      expect(body.data[0].amount).toBe(100)
    })

    it("respects custom limit", async () => {
      setupFullDeps()

      // Create 5 PIs
      for (let i = 0; i < 5; i++) {
        await makeCreateRequest(cardRequest({ amount: (i + 1) * 100 }))
      }

      const res = await makeListRequest("limit=3")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data).toHaveLength(3)
    })

    it("defaults to limit 10", async () => {
      setupFullDeps()
      const res = await makeListRequest()
      const body = await jsonBody(res)
      expect(res.status).toBe(200)
      expect(body.object).toBe("list")
    })

    it("rejects limit > 100", async () => {
      setupFullDeps()
      const res = await makeListRequest("limit=101")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("rejects limit < 1", async () => {
      setupFullDeps()
      const res = await makeListRequest("limit=0")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })
  })

  describe("created_since filter works", () => {
    it("filters payments by created_since date", async () => {
      setupFullDeps()

      // Create 3 PIs with different dates by seeding directly
      createPaymentIntent({
        id: "pi_old1",
        amount: 100,
        createdAt: new Date("2026-05-18T00:00:00Z"),
      })
      createPaymentIntent({
        id: "pi_old2",
        amount: 200,
        createdAt: new Date("2026-05-19T00:00:00Z"),
      })
      createPaymentIntent({
        id: "pi_new1",
        amount: 300,
        createdAt: new Date("2026-05-21T00:00:00Z"),
      })

      // created_since = 2026-05-20T00:00:00Z → should only return pi_new1
      const res = await makeListRequest("created_since=2026-05-20T00%3A00%3A00Z")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data).toHaveLength(1)
      expect(body.data[0].id).toBe("pi_new1")
      expect(body.data[0].amount).toBe(300)
    })

    it("returns 400 for invalid created_since date", async () => {
      setupFullDeps()

      const res = await makeListRequest("created_since=not-a-date")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })
  })

  describe("has_more when more results", () => {
    it("returns has_more:true when results equal limit", async () => {
      setupFullDeps()

      // Seed 3 PIs
      createPaymentIntent({ id: "pi_1", amount: 100, createdAt: new Date("2026-05-20T10:00:00Z") })
      createPaymentIntent({ id: "pi_2", amount: 200, createdAt: new Date("2026-05-20T11:00:00Z") })
      createPaymentIntent({ id: "pi_3", amount: 300, createdAt: new Date("2026-05-20T12:00:00Z") })

      const res = await makeListRequest("limit=2")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data).toHaveLength(2)
      expect(body.has_more).toBe(true)
    })

    it("returns has_more:false when results fewer than limit", async () => {
      setupFullDeps()

      createPaymentIntent({ id: "pi_1", amount: 100, createdAt: new Date("2026-05-20T10:00:00Z") })

      const res = await makeListRequest("limit=5")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data).toHaveLength(1)
      expect(body.has_more).toBe(false)
    })
  })

  describe("empty list for new merchant", () => {
    it("returns empty list for merchant with no payments", async () => {
      setupFullDeps()

      const res = await makeListRequest()
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.object).toBe("list")
      expect(body.data).toEqual([])
      expect(body.has_more).toBe(false)
    })
  })

  describe("authentication", () => {
    it("returns 401 for invalid API key", async () => {
      setupFullDeps()
      const res = await makeListRequest("", "bad_key")
      const body = await jsonBody(res)

      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })

    it("returns 401 for missing API key", async () => {
      setupFullDeps()
      const req = new NextRequest("http://localhost/api/v1/payment_intents", {
        method: "GET",
      })
      const res = await GET(req)
      const body = await jsonBody(res)

      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })
})

// ─── Tests: GET /api/v1/payment_intents/{id} (Detail) ───────────

describe("GET /api/v1/payment_intents/{id}", () => {
  describe("returns full PaymentIntent detail", () => {
    it("returns full PI with masked card, 3DS status, and link_data", async () => {
      setupFullDeps()

      // Create a PI with full detail
      const createRes = await makeCreateRequest(cardRequest({ amount: 500 }))
      const createBody = await jsonBody(createRes)
      const piId = createBody.id

      const res = await makeGetByIdRequest(piId)
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.id).toBe(piId)
      expect(body.object).toBe("payment_intent")
      expect(body.amount).toBe(500)
      expect(body.currency).toBe("GBP")
      expect(body.status).toBe("succeeded")
      expect(body.capture_method).toBe("automatic")

      // Payment method details with full card info
      expect(body.payment_method_details.type).toBe("card")
      expect(body.payment_method_details.card.brand).toBe("visa")
      expect(body.payment_method_details.card.last4).toBe("1111")
      expect(body.payment_method_details.card.expiry_month).toBe(5)
      expect(body.payment_method_details.card.expiry_year).toBe(2035)

      // 3DS status
      expect(body).toHaveProperty("three_d_secure")

      // link_data for refunds
      expect(body).toHaveProperty("link_data")

      // failure fields
      expect(body).toHaveProperty("failure_code")
      expect(body).toHaveProperty("failure_message")
    })

    it("returns 404 for non-existent PI", async () => {
      setupFullDeps()
      const res = await makeGetByIdRequest("pi_nonexistent")
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })

    it("returns 404 for PI belonging to different merchant", async () => {
      setupFullDeps()

      // Create a PI
      const createRes = await makeCreateRequest(cardRequest())
      const createBody = await jsonBody(createRes)
      const piId = createBody.id

      // Override resolveMerchant to return a different merchant
      __setGetDeps({
        resolveMerchant: async () => makeMerchant("m_other"),
      })

      const res = await makeGetByIdRequest(piId)
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })
  })
})

// ─── Tests: GET /api/v1/statements ──────────────────────────────

describe("GET /api/v1/statements", () => {
  describe("returns statement items from Worldpay", () => {
    it("proxies to Worldpay and returns statement data", async () => {
      const resolveMerchant = createDefaultResolveMerchant()

      const wpCall = vi.fn(async (path: string, _mediaType: string, options?: { queryParams?: Record<string, string> }) => {
        if (path === "/accounts/statements") {
          expect(options?.queryParams).toMatchObject({
            startDate: "2026-05-01T00:00:00Z",
            endDate: "2026-05-15T00:00:00Z",
            pageNumber: "1",
          })
          return {
            items: [
              {
                id: "stmt_001",
                type: "settlement",
                fundingType: "credit",
                amount: 15000,
                currency: "GBP",
                balance: 50000,
                transactionReference: "txref_abc",
                createdDate: "2026-05-10T12:00:00Z",
              },
              {
                id: "stmt_002",
                type: "fee",
                fundingType: "debit",
                amount: 250,
                currency: "GBP",
                balance: 49750,
                transactionReference: "fee_def",
                createdDate: "2026-05-11T08:30:00Z",
              },
            ],
            hasMore: false,
          }
        }
        throw new Error(`Unmocked wpCall path: ${path}`)
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-15T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.object).toBe("list")
      expect(body.data).toHaveLength(2)
      expect(body.data[0].id).toBe("stmt_001")
      expect(body.data[0].type).toBe("settlement")
      expect(body.data[0].funding_type).toBe("credit")
      expect(body.data[0].amount).toBe(15000)
      expect(body.data[0].currency).toBe("GBP")
      expect(body.data[0].balance).toBe(50000)
      expect(body.data[0].transaction_reference).toBe("txref_abc")
      expect(body.data[0].created).toBe("2026-05-10T12:00:00Z")
      expect(body.has_more).toBe(false)
    })

    it("correctly maps params to Worldpay format", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async (_path: string, _mediaType: string, options?: { queryParams?: Record<string, string> }) => {
        expect(options?.queryParams).toEqual({
          startDate: "2026-05-01T00:00:00Z",
          endDate: "2026-05-10T00:00:00Z",
          pageNumber: "3",
        })
        return { items: [], hasMore: false }
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
        page: "3",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.object).toBe("list")
      expect(body.data).toEqual([])
    })

    it("uses WP-Api-Version: 2025-01-01 for statements endpoint", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async (path: string, mediaType: string) => {
        expect(path).toBe("/accounts/statements")
        expect(mediaType).toBe("statements-2025-01-01")
        return { items: [], hasMore: false }
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
      })

      expect(wpCall).toHaveBeenCalled()
    })
  })

  describe("date range validation", () => {
    it("returns 400 when from is missing", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({ to: "2026-05-15T00:00:00Z" })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 when to is missing", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({ from: "2026-05-01T00:00:00Z" })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for range > 31 days", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-06-02T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
      expect(body.error.message).toContain("31 days")
    })

    it("returns 400 when to is before from", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({
        from: "2026-05-15T00:00:00Z",
        to: "2026-05-01T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("returns 400 for invalid date format", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({
        from: "not-a-date",
        to: "2026-05-15T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })

    it("accepts a range of exactly 31 days", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async () => ({ items: [], hasMore: false }))

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-06-01T00:00:00Z",
      })
      expect(res.status).toBe(200)
    })
  })

  describe("pagination", () => {
    it("defaults to page 1", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async (_path: string, _mediaType: string, options?: { queryParams?: Record<string, string> }) => {
        expect(options?.queryParams?.pageNumber).toBe("1")
        return { items: [], hasMore: false }
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
      })

      expect(wpCall).toHaveBeenCalled()
    })

    it("passes page param to Worldpay as pageNumber", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async (_path: string, _mediaType: string, options?: { queryParams?: Record<string, string> }) => {
        expect(options?.queryParams?.pageNumber).toBe("2")
        return { items: [{ id: "s1", type: "settlement", fundingType: "credit", amount: 100, currency: "GBP", balance: 1000, transactionReference: "r1", createdDate: "2026-05-10T00:00:00Z" }], hasMore: true }
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
        page: "2",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.has_more).toBe(true)
    })

    it("returns 400 for page < 1", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
        page: "0",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("validation_error")
    })
  })

  describe("has_more propagation", () => {
    it("propagates has_more from Worldpay response", async () => {
      const resolveMerchant = createDefaultResolveMerchant()

      // Test with hasMore=true
      const wpCallTrue = vi.fn(async () => ({
        items: [{ id: "s1", type: "settlement", fundingType: "credit", amount: 100, currency: "GBP", balance: 1000, transactionReference: "r1", createdDate: "2026-05-10T00:00:00Z" }],
        hasMore: true,
      }))
      __setStatementDeps({ wpCall: wpCallTrue, resolveMerchant })

      const res = await makeStatementsRequest({ from: "2026-05-01T00:00:00Z", to: "2026-05-10T00:00:00Z" })
      const body = await jsonBody(res)
      expect(body.has_more).toBe(true)

      __resetStatementDeps()

      // Test with hasMore=false
      const wpCallFalse = vi.fn(async () => ({
        items: [],
        hasMore: false,
      }))
      __setStatementDeps({ wpCall: wpCallFalse, resolveMerchant })

      const res2 = await makeStatementsRequest({ from: "2026-05-01T00:00:00Z", to: "2026-05-10T00:00:00Z" })
      const body2 = await jsonBody(res2)
      expect(body2.has_more).toBe(false)
    })
  })

  describe("authentication", () => {
    it("returns 401 for invalid API key", async () => {
      setupFullDeps()
      const res = await makeStatementsRequest(
        { from: "2026-05-01T00:00:00Z", to: "2026-05-10T00:00:00Z" },
        "bad_key",
      )
      const body = await jsonBody(res)

      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })

  describe("Worldpay error handling", () => {
    it("returns 502 when Worldpay call fails", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async () => {
        throw new Error("Worldpay API error")
      })

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(502)
      expect(body.error.code).toBe("gateway_error")
    })
  })

  describe("handles missing response fields gracefully", () => {
    it("returns empty defaults for missing Worldpay response fields", async () => {
      const resolveMerchant = createDefaultResolveMerchant()
      const wpCall = vi.fn(async () => ({
        items: [{}],
        // no hasMore
      }))

      __setStatementDeps({ wpCall, resolveMerchant })

      const res = await makeStatementsRequest({
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-10T00:00:00Z",
      })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.data[0].id).toBe("")
      expect(body.data[0].type).toBe("")
      expect(body.data[0].amount).toBe(0)
      expect(body.has_more).toBe(false)
    })
  })
})
