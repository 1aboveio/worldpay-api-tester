/**
 * Public hosted-checkout pay endpoint: POST /api/checkout/{id}/pay
 *
 * Authorization is by possession of the unguessable checkout-session id — NO
 * API key. These tests prove that, the session-state guards, and that the card
 * the shopper enters flows through tokenize (card/plain) → FraudSight → CIT
 * authorize (the real payment-intent service) using a mocked Worldpay client.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

// Default canned Worldpay responses for the happy path (tokenize → FraudSight → CIT).
async function defaultWorldpayImpl(path: string) {
  if (path === "/tokens") {
    return {
      tokenPaymentInstrument: { href: "/tokens/tok_1" },
      paymentInstrument: { brand: "visa", last4Digits: "1111" },
    }
  }
  if (path === "/fraudsight/assessment") {
    return { outcome: "lowRisk", riskProfile: { href: "/riskProfile/rp_1" } }
  }
  if (path === "/cardPayments/customerInitiatedTransactions") {
    return { outcome: "sentForSettlement", payment: { id: "wp_pay_1" }, scheme: { reference: "REF1" }, _links: {} }
  }
  throw new Error(`Unmocked worldpayRequest path: ${path}`)
}

// Mock the Worldpay HTTP client so the pay route's inline deps hit canned
// responses instead of the network.
vi.mock("@/lib/worldpay-client", () => ({
  MediaTypes: {
    TOKENS: "application/vnd.worldpay.tokens-v3.hal+json",
    CARD_PAYMENTS: "application/vnd.worldpay.payments-v7+json",
    FRAUDSIGHT: "application/vnd.worldpay.fraudsight-v1.hal+json",
  },
  worldpayRequest: vi.fn(),
}))

import { POST } from "@/app/api/checkout/[id]/pay/route"
import { worldpayRequest } from "@/lib/worldpay-client"
import { resetMockStores, getMockStore } from "@repo/database"
import { NextRequest } from "next/server"

const CS_ID = "cs_test_open_1"

const VALID_CARD = { number: "4444333322221111", expiry_month: 12, expiry_year: 2029, cvc: "123" }

function seedMerchant() {
  getMockStore().merchants.set("m_co", {
    id: "m_co",
    name: "Acme Co",
    entity: "entity_acme",
    payFacConfig: { schemeId: "S1", subMerchant: { reference: "r1", name: "Acme Sub", address: {} } },
    status: "active",
  })
}

function seedCheckout(overrides: Record<string, unknown> = {}) {
  getMockStore().checkoutSessions.set(CS_ID, {
    id: CS_ID,
    merchantId: "m_co",
    amount: 4200,
    currency: "USD",
    captureMethod: "automatic",
    description: "Order #1",
    status: "open",
    paymentIntentId: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })
}

function payRequest(id: string, body: unknown) {
  // Note: NO Authorization header — this endpoint is public.
  const req = new NextRequest(`http://localhost/api/checkout/${id}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return POST(req, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  resetMockStores()
  ;(worldpayRequest as ReturnType<typeof vi.fn>).mockReset()
  ;(worldpayRequest as ReturnType<typeof vi.fn>).mockImplementation(defaultWorldpayImpl)
  seedMerchant()
  seedCheckout()
})

describe("POST /api/checkout/{id}/pay", () => {
  it("pays an open checkout with a card — no API key required", async () => {
    const res = await payRequest(CS_ID, VALID_CARD)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe("succeeded")
    expect(body.id).toMatch(/^pi_/)

    // Session is marked completed and linked to the payment intent.
    const cs = getMockStore().checkoutSessions.get(CS_ID)
    expect(cs?.status).toBe("completed")
    expect(cs?.paymentIntentId).toBe(body.id)
  })

  it("tokenizes the entered card via card/plain", async () => {
    await payRequest(CS_ID, VALID_CARD)

    const tokenCall = (worldpayRequest as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === "/tokens")
    expect(tokenCall).toBeTruthy()
    const tokenBody = (tokenCall![1] as { body: Record<string, unknown> }).body
    const instrument = tokenBody.paymentInstrument as Record<string, unknown>
    expect(instrument.type).toBe("card/plain")
    expect(instrument.cardNumber).toBe("4444333322221111")
  })

  it("returns 400 when card details are incomplete", async () => {
    const res = await payRequest(CS_ID, { number: "4444333322221111" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("strips spaces from the entered card number", async () => {
    await payRequest(CS_ID, { ...VALID_CARD, number: "4444 3333 2222 1111" })
    const tokenCall = (worldpayRequest as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === "/tokens")
    const instrument = (tokenCall![1] as { body: Record<string, unknown> }).body.paymentInstrument as Record<string, unknown>
    expect(instrument.cardNumber).toBe("4444333322221111")
  })

  it("returns 404 for an unknown checkout id", async () => {
    const res = await payRequest("cs_does_not_exist", VALID_CARD)
    expect(res.status).toBe(404)
  })

  it("returns 410 for an expired checkout", async () => {
    seedCheckout({ expiresAt: new Date(Date.now() - 1000) })
    const res = await payRequest(CS_ID, VALID_CARD)
    expect(res.status).toBe(410)
    expect((await res.json()).error.code).toBe("checkout_expired")
  })

  it("rejects a second payment on an already-completed checkout (single use)", async () => {
    const first = await payRequest(CS_ID, VALID_CARD)
    expect(first.status).toBe(200)

    const second = await payRequest(CS_ID, VALID_CARD)
    expect(second.status).toBe(409)
    expect((await second.json()).error.code).toBe("checkout_unavailable")
  })

  it("releases the session back to open when authorization is refused", async () => {
    ;(worldpayRequest as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
      if (path === "/tokens") {
        return { tokenPaymentInstrument: { href: "/tokens/tok_x" }, paymentInstrument: { brand: "visa", last4Digits: "1111" } }
      }
      if (path === "/fraudsight/assessment") return { outcome: "lowRisk" }
      if (path === "/cardPayments/customerInitiatedTransactions") {
        return { outcome: "refused", refusal: { code: "5", description: "REFUSED" }, _links: {} }
      }
      throw new Error(`Unmocked: ${path}`)
    })

    const res = await payRequest(CS_ID, VALID_CARD)
    const body = await res.json()
    expect(body.status).toBe("payment_failed")

    const cs = getMockStore().checkoutSessions.get(CS_ID)
    expect(cs?.status).toBe("open")
  })
})
