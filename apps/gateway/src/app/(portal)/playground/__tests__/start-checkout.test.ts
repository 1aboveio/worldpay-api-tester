/**
 * startCheckoutAction — creates a shareable checkout session for the active
 * merchant. Guards on auth + merchant membership.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

const getSession = vi.fn()
vi.mock("@/lib/auth-server", () => ({ getSession: () => getSession() }))

class NextRedirectError extends Error {
  digest = "NEXT_REDIRECT"
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`)
  }
}
const mockRedirect = vi.fn((url: string) => {
  throw new NextRedirectError(url)
})
vi.mock("next/navigation", () => ({ redirect: (url: string) => mockRedirect(url) }))
vi.mock("@/app/(portal)/playground/start-checkout-form", () => ({ StartCheckoutForm: () => null }))

import { startCheckoutAction } from "@/app/(portal)/playground/actions"
import PlaygroundPage from "@/app/(portal)/playground/page"
import { resetMockStores, getMockStore } from "@repo/database"

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  resetMockStores()
  getSession.mockReset()
  mockRedirect.mockClear()
  process.env.BETTER_AUTH_URL = "https://example.test"
})

describe("startCheckoutAction", () => {
  it("rejects when not signed in", async () => {
    getSession.mockResolvedValue(null)
    const res = await startCheckoutAction(null, form({ amount: "100", currency: "USD" }))
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("UNAUTHENTICATED")
  })

  it("rejects when no active merchant is selected", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: null,
      availableMerchants: [],
      isPlatformAdmin: true,
    })
    const res = await startCheckoutAction(null, form({ amount: "100", currency: "USD" }))
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("NO_MERCHANT")
  })

  it("rejects when the user has no access to the active merchant", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: "m_other",
      availableMerchants: [{ merchantId: "m_mine", merchantName: "Mine", role: "merchant" }],
      isPlatformAdmin: false,
    })
    const res = await startCheckoutAction(null, form({ amount: "100", currency: "USD" }))
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("FORBIDDEN")
  })

  it("creates a checkout session and returns a shareable URL", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: "m_mine",
      availableMerchants: [{ merchantId: "m_mine", merchantName: "Mine", role: "merchant" }],
      isPlatformAdmin: false,
    })
    const res = await startCheckoutAction(null, form({ amount: "4200", currency: "usd", capture_method: "manual" }))

    expect(res.success).toBe(true)
    expect(res.data?.id).toMatch(/^cs_/)
    expect(res.data?.url).toBe(`https://example.test/checkout/${res.data?.id}`)

    const cs = getMockStore().checkoutSessions.get(res.data!.id)
    expect(cs?.merchantId).toBe("m_mine")
    expect(cs?.amount).toBe(4200)
    expect(cs?.currency).toBe("USD")
    expect(cs?.captureMethod).toBe("manual")
    expect(cs?.status).toBe("open")
  })

  it("rejects invalid amount", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: "m_mine",
      availableMerchants: [{ merchantId: "m_mine", merchantName: "Mine", role: "merchant" }],
      isPlatformAdmin: false,
    })
    const res = await startCheckoutAction(null, form({ amount: "0", currency: "USD" }))
    expect(res.success).toBe(false)
    expect(res.error?.code).toBe("VALIDATION_ERROR")
  })
})

describe("PlaygroundPage", () => {
  it("redirects to /login when not signed in", async () => {
    getSession.mockResolvedValue(null)
    await expect(PlaygroundPage()).rejects.toThrow(NextRedirectError)
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("redirects to /dashboard when no active merchant", async () => {
    getSession.mockResolvedValue({ activeMerchantId: null, availableMerchants: [], isPlatformAdmin: true })
    await expect(PlaygroundPage()).rejects.toThrow(NextRedirectError)
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("renders recent checkouts for the active merchant", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: "m_mine",
      availableMerchants: [{ merchantId: "m_mine", merchantName: "Mine", role: "merchant" }],
      isPlatformAdmin: false,
    })
    getMockStore().checkoutSessions.set("cs_1", {
      id: "cs_1", merchantId: "m_mine", amount: 4200, currency: "USD",
      captureMethod: "automatic", status: "open", expiresAt: new Date(Date.now() + 1000),
      createdAt: new Date(), updatedAt: new Date(),
    })
    const el = await PlaygroundPage()
    expect(el).toBeTruthy()
  })

  it("renders the empty state when there are no checkouts", async () => {
    getSession.mockResolvedValue({
      activeMerchantId: "m_empty",
      availableMerchants: [{ merchantId: "m_empty", merchantName: "Empty", role: "merchant" }],
      isPlatformAdmin: false,
    })
    const el = await PlaygroundPage()
    expect(el).toBeTruthy()
  })
})
