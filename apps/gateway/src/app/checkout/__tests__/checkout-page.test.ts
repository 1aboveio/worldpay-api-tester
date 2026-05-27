/**
 * Public checkout page (server component): app/checkout/[id]/page.tsx
 * Exercises the session lookup + terminal-state branches. The hosted-fields
 * client component is mocked (it drives a browser-only Worldpay SDK).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

class NextNotFoundError extends Error {
  digest = "NEXT_NOT_FOUND"
  constructor() {
    super("NEXT_NOT_FOUND")
  }
}
const mockNotFound = vi.fn(() => {
  throw new NextNotFoundError()
})
vi.mock("next/navigation", () => ({ notFound: () => mockNotFound() }))
vi.mock("@/app/checkout/[id]/checkout-client", () => ({ CheckoutClient: () => null }))

import CheckoutPage from "@/app/checkout/[id]/page"
import { resetMockStores, getMockStore } from "@repo/database"

function seedSession(id: string, overrides: Record<string, unknown> = {}) {
  getMockStore().merchants.set("m_co", { id: "m_co", name: "Acme Co", entity: "e", payFacConfig: {}, status: "active" })
  getMockStore().checkoutSessions.set(id, {
    id,
    merchantId: "m_co",
    amount: 4200,
    currency: "USD",
    captureMethod: "automatic",
    description: "Order #1",
    status: "open",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  })
}

const render = (id: string) => CheckoutPage({ params: Promise.resolve({ id }) })

beforeEach(() => {
  resetMockStores()
  mockNotFound.mockClear()
})

describe("public CheckoutPage", () => {
  it("calls notFound for an unknown checkout id", async () => {
    await expect(render("cs_missing")).rejects.toThrow(NextNotFoundError)
    expect(mockNotFound).toHaveBeenCalled()
  })

  it("renders the pay form for an open session", async () => {
    seedSession("cs_open")
    const el = await render("cs_open")
    expect(el).toBeTruthy()
  })

  it("renders a terminal state for a completed session", async () => {
    seedSession("cs_done", { status: "completed" })
    const el = await render("cs_done")
    expect(el).toBeTruthy()
  })

  it("renders a terminal state for an expired session", async () => {
    seedSession("cs_exp", { expiresAt: new Date(Date.now() - 1000) })
    const el = await render("cs_exp")
    expect(el).toBeTruthy()
  })

  it("renders a terminal state for a processing session", async () => {
    seedSession("cs_proc", { status: "processing" })
    const el = await render("cs_proc")
    expect(el).toBeTruthy()
  })
})
