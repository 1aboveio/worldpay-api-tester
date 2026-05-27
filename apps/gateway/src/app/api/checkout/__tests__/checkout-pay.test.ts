/**
 * Public hosted-checkout pay endpoint: POST /api/checkout/{id}/pay
 *
 * Authorization is by possession of the unguessable checkout-session id — NO
 * API key. These tests prove that, the session-state guards, and that the card
 * the shopper enters flows through tokenize (card/front) → FraudSight → CIT
 * authorize.
 *
 * We mock at the `fetch` boundary so the REAL worldpay-client runs — verifying
 * the actual request shaping (card/front tokenization, media types).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

function defaultFetchImpl(url: string) {
  if (url.includes("/tokens")) {
    return jsonResponse(200, {
      tokenPaymentInstrument: { href: "/tokens/tok_checkout_1" },
      paymentInstrument: { brand: "visa", last4Digits: "1111" },
    })
  }
  if (url.includes("/fraudsight/assessment")) {
    return jsonResponse(200, { outcome: "lowRisk", riskProfile: { href: "/riskProfile/rp_1" } })
  }
  if (url.includes("/customerInitiatedTransactions")) {
    return jsonResponse(200, { outcome: "sentForSettlement", payment: { id: "wp_pay_1" }, scheme: { reference: "REF1" }, _links: {} })
  }
  throw new Error(`Unmocked fetch: ${url}`)
}

const fetchMock = vi.fn()

import { POST } from "@/app/api/checkout/[id]/pay/route"
import { resetMockStores, getMockStore } from "@repo/database"
import { NextRequest } from "next/server"

// Parsed JSON body of the fetch call to a given Worldpay path fragment.
function fetchBodyFor(pathFragment: string): Record<string, unknown> | undefined {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes(pathFragment))
  if (!call) return undefined
  return JSON.parse((call[1] as { body: string }).body)
}

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
  global.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => defaultFetchImpl(url))
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

    const cs = getMockStore().checkoutSessions.get(CS_ID)
    expect(cs?.status).toBe("completed")
    expect(cs?.paymentIntentId).toBe(body.id)
  })

  it("tokenizes the entered card via card/front with the merchant entity", async () => {
    await payRequest(CS_ID, VALID_CARD)

    const tokenBody = fetchBodyFor("/tokens")
    expect(tokenBody).toBeTruthy()
    const instrument = tokenBody!.paymentInstrument as Record<string, unknown>
    expect(instrument.type).toBe("card/front")
    expect(instrument.cardNumber).toBe("4444333322221111")
    expect(instrument.cvc).toBeUndefined() // cvc is not allowed in the Tokens API
    expect((tokenBody!.merchant as Record<string, unknown>)?.entity).toBe("entity_acme")
  })

  it("returns 400 when card details are incomplete", async () => {
    const res = await payRequest(CS_ID, { number: "4444333322221111" })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("strips spaces from the entered card number before tokenizing", async () => {
    await payRequest(CS_ID, { ...VALID_CARD, number: "4444 3333 2222 1111" })
    const tokenBody = fetchBodyFor("/tokens")
    const instrument = tokenBody!.paymentInstrument as Record<string, unknown>
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

  it("treats a Worldpay 409 (card already tokenized) as success", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/tokens")) {
        return jsonResponse(409, {
          tokenPaymentInstrument: { href: "/tokens/tok_existing" },
          paymentInstrument: { brand: "VISA", cardNumber: "4444********1111" },
        })
      }
      return defaultFetchImpl(url)
    })

    const res = await payRequest(CS_ID, VALID_CARD)
    expect((await res.json()).status).toBe("succeeded")
  })

  it("releases the session back to open when authorization is refused", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/customerInitiatedTransactions")) {
        return jsonResponse(200, { outcome: "refused", refusal: { code: "5", description: "REFUSED" }, _links: {} })
      }
      return defaultFetchImpl(url)
    })

    const res = await payRequest(CS_ID, VALID_CARD)
    const body = await res.json()
    expect(body.status).toBe("payment_failed")

    const cs = getMockStore().checkoutSessions.get(CS_ID)
    expect(cs?.status).toBe("open")
  })
})
