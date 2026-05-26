/**
 * Tests for Worldpay HTTP client
 *
 * AC6: Worldpay client can make a real POST /tokens call and return typed response
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { createToken, WorldpayError } from "@/lib/worldpay-client"

// ---- AC6: Token creation ---------------------------------------------------

describe("Worldpay client — createToken", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("AC6: returns typed TokenResponse on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: "tok_abc123",
        tokenExpiryDateTime: "2026-12-31T23:59:59Z",
        cardBrand: "VISA",
        maskedCardNumber: "**** **** **** 1111",
        tokenType: "card",
      }),
    })

    const result = await createToken({
      tokenType: "card",
      cardNumber: "4444333322221111",
      expiryMonth: 12,
      expiryYear: 2026,
      name: "Test User",
      cvc: "123",
    })

    expect(result.token).toBe("tok_abc123")
    expect(result.cardBrand).toBe("VISA")
    expect(result.maskedCardNumber).toBe("**** **** **** 1111")
    expect(result.tokenType).toBe("card")
  })

  it("AC6: throws WorldpayError on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ errorName: "invalidCardNumber", message: "Invalid card" }),
    })

    await expect(
      createToken({ tokenType: "card", cardNumber: "0000" } as never)
    ).rejects.toThrow(WorldpayError)
  })

  it("AC6: sends correct headers (Basic Auth, media type)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "tok_test" }),
    })

    await createToken({ tokenType: "card", cardNumber: "4444333322221111" } as never)

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain("/tokens")
    expect(init.headers.Authorization).toMatch(/^Basic /)
    expect(init.headers.Accept).toBe("application/vnd.worldpay.tokens-v3.hal+json")
    expect(init.headers["Content-Type"]).toBe("application/vnd.worldpay.tokens-v3.hal+json")
  })
})
