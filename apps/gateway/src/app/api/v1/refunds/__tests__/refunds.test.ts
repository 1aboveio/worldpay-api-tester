/**
 * Refund API Tests
 *
 * Tests POST /api/v1/refunds and GET /api/v1/refunds/{id}
 * Mocks DAL + auth; uses real in-memory database mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { POST } from "@/app/api/v1/refunds/route"
import { GET } from "@/app/api/v1/refunds/[id]/route"
import { resetMockStores } from "@repo/database"

vi.mock("@/lib/auth", () => ({
  extractBearerToken: vi.fn((h: string | null) => h?.startsWith("Bearer ") ? h.slice(7) : h),
  resolveMerchantFromApiKey: vi.fn(),
}))

import { resolveMerchantFromApiKey } from "@/lib/auth"

function makeMerchant() {
  return { id: "ak_1", merchantId: "m_refund", keyHash: "h", merchant: { id: "m_refund", name: "M", worldpayEntity: "e", payfacSchemeId: "1", subMerchantRef: {}, status: "active" } }
}

function makeRequest(body: unknown, apiKey = "sk_test_refund", headers?: Record<string, string>) {
  return new NextRequest("http://localhost/api/v1/refunds", {
    method: "POST", headers: new Headers({ "content-type": "application/json", authorization: `Bearer ${apiKey}`, ...headers }),
    body: JSON.stringify(body),
  } as any)
}

function makeGetRequest(id: string, apiKey = "sk_test_refund") {
  return new NextRequest(`http://localhost/api/v1/refunds/${id}`, {
    headers: new Headers({ authorization: `Bearer ${apiKey}` }),
  } as any)
}

describe("POST /api/v1/refunds", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetMockStores()
  })

  it("full refund on succeeded PI → 201", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    // Seed a succeeded PI
    const { database } = await import("@repo/database")
    await database.paymentIntent.create({ data: { id: "pi_ref_1", merchantId: "m_refund", amount: 250, currency: "GBP", status: "succeeded" } })

    const res = await POST(makeRequest({ payment_intent: "pi_ref_1", amount: 250 }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe("succeeded")
    expect(body.amount).toBe(250)
    expect(body.id).toMatch(/^rf_/)
  })

  it("partial refund → 201", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_2", merchantId: "m_refund", amount: 500, currency: "GBP", status: "succeeded" } })

    const res = await POST(makeRequest({ payment_intent: "pi_ref_2", amount: 100 }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.amount).toBe(100)
  })

  it("refund on non-succeeded PI → 400", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_3", merchantId: "m_refund", amount: 250, currency: "GBP", status: "payment_failed" } })

    const res = await POST(makeRequest({ payment_intent: "pi_ref_3", amount: 250 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("status_invalid")
  })

  it("refund on different merchant PI → 404", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_4", merchantId: "other_merchant", amount: 250, currency: "GBP", status: "succeeded" } })

    const res = await POST(makeRequest({ payment_intent: "pi_ref_4", amount: 250 }))
    expect(res.status).toBe(404)
  })

  it("cumulative refunds exceeding → 400", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_5", merchantId: "m_refund", amount: 250, currency: "GBP", status: "succeeded" } })
    await POST(makeRequest({ payment_intent: "pi_ref_5", amount: 200 }))

    const res = await POST(makeRequest({ payment_intent: "pi_ref_5", amount: 100 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("already_refunded")
  })

  it("refund exceeds amount → 400", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_6", merchantId: "m_refund", amount: 250, currency: "GBP", status: "succeeded" } })

    const res = await POST(makeRequest({ payment_intent: "pi_ref_6", amount: 300 }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("refund_exceeds_balance")
  })

  it("invalid amount (0/negative) → 400", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_7", merchantId: "m_refund", amount: 250, currency: "GBP", status: "succeeded" } })

    const res0 = await POST(makeRequest({ payment_intent: "pi_ref_7", amount: 0 }))
    expect(res0.status).toBe(400)
    const resNeg = await POST(makeRequest({ payment_intent: "pi_ref_7", amount: -10 }))
    expect(resNeg.status).toBe(400)
  })

  it("idempotency key prevents duplicate refunds", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    await (await import("@repo/database")).database.paymentIntent.create({ data: { id: "pi_ref_8", merchantId: "m_refund", amount: 250, currency: "GBP", status: "succeeded" } })

    const res1 = await POST(makeRequest({ payment_intent: "pi_ref_8", amount: 100 }, "sk_test_refund", { "idempotency-key": "idem_001" }))
    expect(res1.status).toBe(201)
    const res2 = await POST(makeRequest({ payment_intent: "pi_ref_8", amount: 100 }, "sk_test_refund", { "idempotency-key": "idem_001" }))
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    const body1 = await res1.json()
    expect(body2.id).toBe(body1.id)
  })

  it("invalid API key → 401", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(null as any)
    const res = await POST(makeRequest({ payment_intent: "pi_ref_9", amount: 100 }, "bad_key"))
    expect(res.status).toBe(401)
  })
})

describe("GET /api/v1/refunds/{id}", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    resetMockStores()
  })

  it("returns refund by id", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    const { database } = await import("@repo/database")
    await (database as any).refund?.create?.({ data: { id: "rf_get_1", merchantId: "m_refund", paymentIntentId: "pi_x", amount: 100, currency: "GBP", reason: "duplicate", status: "succeeded", createdAt: new Date() } })

    const res = await GET(makeGetRequest("rf_get_1"), { params: Promise.resolve({ id: "rf_get_1" }) } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe("rf_get_1")
    expect(body.amount).toBe(100)
  })

  it("returns 404 for wrong merchant", async () => {
    vi.mocked(resolveMerchantFromApiKey).mockResolvedValue(makeMerchant() as any)
    const { database } = await import("@repo/database")
    await (database as any).refund?.create?.({ data: { id: "rf_other", merchantId: "other", paymentIntentId: "pi_y", amount: 100, currency: "GBP", reason: "fraudulent", status: "succeeded", createdAt: new Date() } })

    const res = await GET(makeGetRequest("rf_other"), { params: Promise.resolve({ id: "rf_other" }) } as any)
    expect(res.status).toBe(404)
  })
})
