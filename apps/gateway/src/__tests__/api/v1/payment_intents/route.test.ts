/**
 * Tests for POST /api/v1/payment_intents route handler
 *
 * Verifies auth behavior and basic validation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock the payment intent service
vi.mock("@/lib/payment-intent-service", () => ({
  handleCreatePaymentIntent: vi.fn(),
}))

import { handleCreatePaymentIntent } from "@/lib/payment-intent-service"
import { POST } from "@/app/api/v1/payment_intents/route"

function buildRequest(opts: { headers?: Record<string, string>; body?: unknown } = {}): NextRequest {
  const url = new URL("http://localhost/api/v1/payment_intents")
  const headers = new Headers({ "content-type": "application/json", ...opts.headers })
  const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  return new NextRequest(url, { method: "POST", headers, body } as never)
}

describe("POST /api/v1/payment_intents", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("passes body and extracted API key to service", async () => {
    vi.mocked(handleCreatePaymentIntent).mockResolvedValue(
      new Response(JSON.stringify({ status: "succeeded" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const res = await POST(buildRequest({
      headers: { authorization: "Bearer sk_test_valid" },
      body: { amount: 100, currency: "GBP" },
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("succeeded")
    expect(handleCreatePaymentIntent).toHaveBeenCalledWith(
      { amount: 100, currency: "GBP" },
      "sk_test_valid",
      expect.any(Object),
    )
  })

  it("passes empty API key when no auth header", async () => {
    vi.mocked(handleCreatePaymentIntent).mockResolvedValue(
      new Response(JSON.stringify({ status: "succeeded" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    const res = await POST(buildRequest({ body: { amount: 100, currency: "GBP" } }))
    expect(res.status).toBe(200)
    expect(handleCreatePaymentIntent).toHaveBeenCalledWith(
      { amount: 100, currency: "GBP" },
      "",
      expect.any(Object),
    )
  })

  it("handles invalid JSON body gracefully", async () => {
    const url = new URL("http://localhost/api/v1/payment_intents")
    const req = new NextRequest(url, { method: "POST", headers: new Headers({ "content-type": "application/json" }), body: "not json {{{" } as never)
    // handleCreatePaymentIntent receives null for body
    vi.mocked(handleCreatePaymentIntent).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "validation_error", message: "Invalid input" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    )
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
