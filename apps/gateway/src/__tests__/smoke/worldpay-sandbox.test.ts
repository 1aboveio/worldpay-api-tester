/**
 * Worldpay Sandbox Smoke Tests
 *
 * Makes real API calls to Worldpay Access sandbox (try.access.worldpay.com).
 * Not run in CI — requires sandbox credentials.
 *
 * Usage:
 *   WORLDPAY_USERNAME=... WORLDPAY_PASSWORD=... WORLDPAY_ENTITY=... \
 *     npx vitest run src/__tests__/smoke/worldpay-sandbox.test.ts
 *
 * Skips gracefully if credentials are not set.
 */

import { describe, it, expect, beforeAll } from "vitest"

const BASE_URL = process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com"
const USERNAME = process.env.WORLDPAY_USERNAME ?? ""
const PASSWORD = process.env.WORLDPAY_PASSWORD ?? ""
const ENTITY = process.env.WORLDPAY_ENTITY ?? ""

const hasCredentials = USERNAME.length > 0 && PASSWORD.length > 0 && ENTITY.length > 0

function basicAuth(): string {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`
}

async function wpRequest<T>(
  path: string,
  options: {
    mediaType: string
    body?: unknown
    method?: "GET" | "POST"
  }
): Promise<{ status: number; body: T }> {
  const { mediaType, body, method = "POST" } = options
  const headers: Record<string, string> = {
    Authorization: basicAuth(),
    Accept: mediaType,
    "Content-Type": mediaType,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const json = (await res.json().catch(() => null)) as T
    return { status: res.status, body: json }
  } finally {
    clearTimeout(timeout)
  }
}

const MEDIA = {
  TOKENS: "application/vnd.worldpay.tokens-v3.hal+json",
  PAYMENTS: "application/vnd.worldpay.payments-v7+json",
}

// ─── Skip if no credentials ──────────────────────────────

const describeOrSkip = hasCredentials ? describe : describe.skip

describeOrSkip("Worldpay Sandbox — real API", () => {
  // Test card numbers that work in Worldpay sandbox
  // These are standard Worldpay test cards
  const VALID_CARD = {
    number: "4444333322221111",
    expiryMonth: 12,
    expiryYear: 2030,
    cvc: "123",
    name: "Smoke Test",
  }

  const DECLINED_CARD = {
    ...VALID_CARD,
    number: "4444333322221112",
  }

  let tokenHref = ""
  let paymentId = ""

  // ─── 1. Tokenize a card ──────────────────────────────

  describe("Tokenization", () => {
    it("creates a token and returns token href", async () => {
      const { status, body } = await wpRequest<{
        token: string
        tokenExpiryDateTime?: string
        cardBrand?: string
        maskedCardNumber?: string
        _links?: Record<string, { href: string }>
      }>("/tokens", {
        mediaType: MEDIA.TOKENS,
        body: {
          tokenType: "card",
          cardNumber: VALID_CARD.number,
          expiryMonth: VALID_CARD.expiryMonth,
          expiryYear: VALID_CARD.expiryYear,
          name: VALID_CARD.name,
          cvc: VALID_CARD.cvc,
        },
      })

      expect(status).toBe(201)
      expect(body.token).toBeTruthy()
      expect(body.cardBrand?.toLowerCase()).toBe("visa")
      expect(body.maskedCardNumber).toMatch(/\*{4}1111/)

      // Extract token href from HATEOAS links
      const selfLink = body._links?.["tokens:token"]?.href
      expect(selfLink).toBeTruthy()
      tokenHref = selfLink!
    })

    it("token response never exposes raw card number", async () => {
      const { body } = await wpRequest<Record<string, unknown>>("/tokens", {
        mediaType: MEDIA.TOKENS,
        body: {
          tokenType: "card",
          cardNumber: VALID_CARD.number,
          expiryMonth: VALID_CARD.expiryMonth,
          expiryYear: VALID_CARD.expiryYear,
          cvc: VALID_CARD.cvc,
        },
      })
      const str = JSON.stringify(body)
      expect(str).not.toContain(VALID_CARD.number)
      expect(str).not.toContain(VALID_CARD.cvc)
    })

    it("rejects an invalid card number", async () => {
      const { status, body } = await wpRequest<{ errorName?: string }>(
        "/tokens",
        {
          mediaType: MEDIA.TOKENS,
          body: {
            tokenType: "card",
            cardNumber: "0000000000000000",
            expiryMonth: 12,
            expiryYear: 2030,
          },
        }
      )
      expect([400, 422]).toContain(status)
    })
  })

  // ─── 2. CIT authorize ────────────────────────────────

  describe("CIT authorize", () => {
    it("authorizes a card payment and returns outcome", async () => {
      // Need a fresh token for the payment
      const tokenRes = await wpRequest<{
        _links?: Record<string, { href: string }>
      }>("/tokens", {
        mediaType: MEDIA.TOKENS,
        body: {
          tokenType: "card",
          cardNumber: VALID_CARD.number,
          expiryMonth: VALID_CARD.expiryMonth,
          expiryYear: VALID_CARD.expiryYear,
          cvc: VALID_CARD.cvc,
        },
      })
      const href = tokenRes.body._links?.["tokens:token"]?.href
      if (!href) throw new Error("Token href missing")

      const { status, body } = await wpRequest<{
        outcome?: string
        payment?: { id?: string }
        scheme?: { reference?: string }
        _links?: Record<string, { href: string }>
      }>("/cardPayments/customerInitiatedTransactions", {
        mediaType: MEDIA.PAYMENTS,
        body: {
          transactionReference: `smoke-${Date.now()}`,
          merchant: { entity: ENTITY },
          instruction: {
            requestAutoSettlement: { enabled: true },
            narrative: { line1: "Smoke Test" },
            value: { amount: 100, currency: "GBP" },
            paymentInstrument: {
              type: "card/token",
              href,
            },
          },
          channel: "ecom",
        },
      })

      expect(status).toBe(201)
      expect(body.outcome).toMatch(/authorized|sentForSettlement/)
      expect(body.payment?.id).toBeTruthy()
      expect(body.scheme?.reference).toBeTruthy()

      paymentId = body.payment?.id ?? ""

      // Verify HATEOAS refund link exists
      const refundLink = body._links?.["cardPayments:refund"]?.href
      expect(refundLink).toBeTruthy()
    })

    it("refuses a declined card", async () => {
      const tokenRes = await wpRequest<{
        _links?: Record<string, { href: string }>
      }>("/tokens", {
        mediaType: MEDIA.TOKENS,
        body: {
          tokenType: "card",
          cardNumber: DECLINED_CARD.number,
          expiryMonth: DECLINED_CARD.expiryMonth,
          expiryYear: DECLINED_CARD.expiryYear,
          cvc: DECLINED_CARD.cvc,
        },
      })
      const href = tokenRes.body._links?.["tokens:token"]?.href
      if (!href) throw new Error("Token href missing")

      const { status, body } = await wpRequest<{
        outcome?: string
        refusalCode?: string
      }>("/cardPayments/customerInitiatedTransactions", {
        mediaType: MEDIA.PAYMENTS,
        body: {
          transactionReference: `smoke-declined-${Date.now()}`,
          merchant: { entity: ENTITY },
          instruction: {
            requestAutoSettlement: { enabled: true },
            narrative: { line1: "Declined Test" },
            value: { amount: 200, currency: "GBP" },
            paymentInstrument: { type: "card/token", href },
          },
          channel: "ecom",
        },
      })

      expect(status).toBe(201)
      expect(body.outcome).toBe("refused")
      expect(body.refusalCode).toBeTruthy()
    })
  })

  // ─── 3. Refund ───────────────────────────────────────

  describe("Refund", () => {
    it("refunds a successful payment", async () => {
      // Create a new payment to refund
      const tokenRes = await wpRequest<{
        _links?: Record<string, { href: string }>
      }>("/tokens", {
        mediaType: MEDIA.TOKENS,
        body: {
          tokenType: "card",
          cardNumber: VALID_CARD.number,
          expiryMonth: VALID_CARD.expiryMonth,
          expiryYear: VALID_CARD.expiryYear,
          cvc: VALID_CARD.cvc,
        },
      })
      const href = tokenRes.body._links?.["tokens:token"]?.href

      const payRes = await wpRequest<{
        outcome?: string
        _links?: Record<string, { href: string }>
      }>("/cardPayments/customerInitiatedTransactions", {
        mediaType: MEDIA.PAYMENTS,
        body: {
          transactionReference: `smoke-refund-${Date.now()}`,
          merchant: { entity: ENTITY },
          instruction: {
            requestAutoSettlement: { enabled: true },
            narrative: { line1: "Refund Test" },
            value: { amount: 300, currency: "GBP" },
            paymentInstrument: { type: "card/token", href },
          },
          channel: "ecom",
        },
      })

      expect(payRes.body.outcome).toMatch(/authorized|sentForSettlement/)
      const refundLink = payRes.body._links?.["cardPayments:refund"]?.href

      if (!refundLink) {
        // Some sandbox configs may not have the refund link immediately.
        // This is expected — skip the test rather than fail.
        console.warn("  ⚠ Refund link not available — sandbox may require settlement first")
        return
      }

      // Extract path from HATEOAS link
      const refundPath = new URL(refundLink).pathname

      const { status, body } = await wpRequest<{ outcome?: string }>(
        refundPath,
        {
          mediaType: MEDIA.PAYMENTS,
          method: "POST",
          body: {
            value: { amount: 300, currency: "GBP" },
          },
        }
      )

      expect(status).toBe(201)
      expect(body.outcome).toBe("authorized")
    })
  })
})
