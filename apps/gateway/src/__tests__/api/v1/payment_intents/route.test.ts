/**
 * Tests for POST /api/v1/payment_intents
 *
 * AC coverage:
 * - AC4: valid API key resolves merchant → worldpayEntity
 * - AC5: invalid/missing API key → 401 { error: { code: "invalid_api_key" } }
 * - AC7: Zod validation → 400 { error: { code, message } }
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock DAL so route handler tests don't need a real database
vi.mock("@repo/dal", () => ({
  getApiKeyByHash: vi.fn(),
  getMerchantById: vi.fn(),
}))

import { getApiKeyByHash } from "@repo/dal"
import { POST } from "@/app/api/v1/payment_intents/route"

function buildRequest(overrides: {
  headers?: Record<string, string>
  body?: unknown
} = {}): NextRequest {
  const url = new URL("http://localhost/api/v1/payment_intents")
  const headers = new Headers({
    "content-type": "application/json",
    ...overrides.headers,
  })
  const body = overrides.body !== undefined ? JSON.stringify(overrides.body) : undefined
  return new NextRequest(url, { method: "POST", headers, body } as never)
}

// ---- AC5: Missing / invalid API key → 401 ----------------------------------

describe("POST /api/v1/payment_intents — auth", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("AC5: returns 401 for missing Authorization header", async () => {
    const req = buildRequest({ body: { amount: 100, currency: "GBP" } })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error.code).toBe("invalid_api_key")
  })

  it("AC5: returns 401 for invalid API key", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue(null)

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_invalid_key" },
      body: { amount: 100, currency: "GBP" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error.code).toBe("invalid_api_key")
  })
})

// ---- AC7: Zod validation → 400 { error: { code, message } } ----------------

describe("POST /api/v1/payment_intents — validation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("AC7: returns 400 for missing amount", async () => {
    // Bypass auth for this test
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { currency: "GBP" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe("validation_error")
  })

  it("AC7: returns 400 for missing currency", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { amount: 100 },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe("validation_error")
  })

  it("AC7: returns 400 for negative amount", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { amount: -100, currency: "GBP" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe("validation_error")
  })

  it("AC7: returns 400 for currency not 3 chars", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { amount: 100, currency: "GB" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe("validation_error")
  })

  it("AC7: returns 400 for invalid JSON body", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const url = new URL("http://localhost/api/v1/payment_intents")
    const headers = new Headers({
      authorization: "Bearer sk_test_valid",
      "content-type": "application/json",
    })
    const req = new NextRequest(url, {
      method: "POST",
      headers,
      body: "not json {{{",
    } as never)
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error.code).toBe("invalid_request")
  })
})

// ---- AC4: Valid API key resolves merchant → worldpayEntity -----------------

describe("POST /api/v1/payment_intents — merchant resolution", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("AC4: valid API key resolves merchant and returns worldpayEntity", async () => {
    vi.mocked(getApiKeyByHash).mockResolvedValue({
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "test",
      scopes: "read,write",
      merchant: {
        id: "mer_001",
        name: "Test Merchant",
        worldpayEntity: "gfhk001",
        status: "active",
      },
    })

    const req = buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { amount: 100, currency: "GBP" },
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.merchant.worldpayEntity).toBe("gfhk001")
    expect(data.merchant.name).toBe("Test Merchant")
    expect(data.merchant.status).toBe("active")
    expect(data.paymentIntent.amount).toBe(100)
    expect(data.paymentIntent.currency).toBe("GBP")
  })
})
