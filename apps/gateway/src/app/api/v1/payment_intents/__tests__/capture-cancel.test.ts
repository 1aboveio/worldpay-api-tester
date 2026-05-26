/**
 * Manual Capture & Cancel Tests
 *
 * Test plan: docs/test-plans/2026-05-25-capture-cancel-test-plan.md
 *
 * These tests exercise observable behavior through the public API:
 * - POST /api/v1/payment_intents/{id}/capture (full + partial)
 * - POST /api/v1/payment_intents/{id}/cancel
 *
 * Mock policy: wpCall, resolveMerchant are mocked (external system boundaries).
 * DAL is the real in-memory mock that behaves like Prisma.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { POST as POST_CAPTURE } from "@/app/api/v1/payment_intents/[id]/capture/route"
import { POST as POST_CANCEL } from "@/app/api/v1/payment_intents/[id]/cancel/route"
import { __setDeps as __setCaptureDeps, __resetDeps as __resetCaptureDeps } from "@/app/api/v1/payment_intents/[id]/capture/route"
import { __setDeps as __setCancelDeps, __resetDeps as __resetCancelDeps } from "@/app/api/v1/payment_intents/[id]/cancel/route"
import { resetMockStores, getMockStore } from "@repo/database"
import type { WpCallFn, ResolveMerchantFn } from "@/lib/worldpay-types"
import { NextRequest } from "next/server"

// ─── Test Helpers ────────────────────────────────────────────────

const TEST_API_KEY = "sk_test_key123"
const OTHER_API_KEY = "sk_other_key456"

function makeMerchant(merchantId = "m_test001") {
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
  } as Awaited<ReturnType<ResolveMerchantFn>>
}

const HATEOAS_SETTLE_URL = "/payments/settlements/linkdata_settle_001"
const HATEOAS_PARTIAL_SETTLE_URL = "/payments/settlements/partial/linkdata_partial_001"
const HATEOAS_CANCEL_URL = "/payments/cancellations/linkdata_cancel_001"

function makeRequiresCapturePi(overrides?: Record<string, unknown>) {
  return {
    id: "pi_manual001",
    merchantId: "m_test001",
    amount: 250,
    currency: "GBP",
    status: "requires_capture",
    captureMethod: "manual",
    worldpayPaymentId: "wp_pay_manual001",
    linkData: {
      "cardPayments:settle": { href: HATEOAS_SETTLE_URL },
      "cardPayments:partialSettle": { href: HATEOAS_PARTIAL_SETTLE_URL },
      "cardPayments:cancel": { href: HATEOAS_CANCEL_URL },
    },
    paymentMethodId: "pm_card001",
    ...overrides,
  }
}

function makeSettledPi() {
  return makeRequiresCapturePi({
    id: "pi_settled",
    status: "succeeded",
  })
}

function makeCanceledPi() {
  return makeRequiresCapturePi({
    id: "pi_canceled",
    status: "canceled",
  })
}

function makeProcessingPi() {
  return makeRequiresCapturePi({
    id: "pi_processing",
    status: "processing",
  })
}

function makeSettleSuccessResponse() {
  return {
    outcome: "authorized",
    _links: {},
  }
}

function makeCancelSuccessResponse() {
  return {
    outcome: "canceled",
    _links: {},
  }
}

function makeRefusalResponse() {
  return {
    outcome: "refused",
    refusal: { code: "5", description: "REFUSED" },
  }
}

function seedPi(pi: Record<string, unknown>) {
  getMockStore().paymentIntents.set(pi.id as string, { ...pi })
}

function seedPaymentMethod() {
  getMockStore().paymentMethods.set("pm_card001", {
    id: "pm_card001",
    merchantId: "m_test001",
    type: "card",
    tokenHref: "/tokens/tok_abc",
    brand: "visa",
    last4: "1111",
    expiryMonth: 5,
    expiryYear: 2035,
  })
}

// ─── Request Helpers ─────────────────────────────────────────────

async function makeCaptureRequest(
  piId: string,
  body?: unknown,
  apiKey = TEST_API_KEY,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey
  }
  const req = new NextRequest(
    `http://localhost/api/v1/payment_intents/${piId}/capture`,
    {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
  )
  return POST_CAPTURE(req, { params: Promise.resolve({ id: piId }) })
}

async function makeCancelRequest(
  piId: string,
  apiKey = TEST_API_KEY,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey
  }
  const req = new NextRequest(
    `http://localhost/api/v1/payment_intents/${piId}/cancel`,
    {
      method: "POST",
      headers,
    },
  )
  return POST_CANCEL(req, { params: Promise.resolve({ id: piId }) })
}

async function jsonBody(res: Response) {
  return res.json()
}

// ─── Test Setup ──────────────────────────────────────────────────

function setupCaptureDeps(
  overrides: {
    wpCall?: WpCallFn
    resolveMerchant?: ResolveMerchantFn
  } = {},
) {
  const merchant = makeMerchant()

  const wpCall: WpCallFn = overrides.wpCall ?? vi.fn(async (path: string) => {
    if (path === HATEOAS_SETTLE_URL) return makeSettleSuccessResponse()
    if (path === HATEOAS_PARTIAL_SETTLE_URL) return makeSettleSuccessResponse()
    throw new Error(`Unmocked wpCall path: ${path}`)
  })

  const resolveMerchant: ResolveMerchantFn = overrides.resolveMerchant ?? vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return merchant
    if (key === OTHER_API_KEY) return makeMerchant("m_other")
    throw new Error("Invalid API key")
  })

  __setCaptureDeps({ wpCall, resolveMerchant })
  __setCancelDeps({ wpCall, resolveMerchant })

  return { wpCall, resolveMerchant, merchant }
}

function setupCancelDeps(
  overrides: {
    wpCall?: WpCallFn
    resolveMerchant?: ResolveMerchantFn
  } = {},
) {
  const merchant = makeMerchant()

  const wpCall: WpCallFn = overrides.wpCall ?? vi.fn(async (path: string) => {
    if (path === HATEOAS_CANCEL_URL) return makeCancelSuccessResponse()
    throw new Error(`Unmocked wpCall path: ${path}`)
  })

  const resolveMerchant: ResolveMerchantFn = overrides.resolveMerchant ?? vi.fn(async (key: string) => {
    if (key === TEST_API_KEY) return merchant
    if (key === OTHER_API_KEY) return makeMerchant("m_other")
    throw new Error("Invalid API key")
  })

  __setCaptureDeps({ wpCall, resolveMerchant })
  __setCancelDeps({ wpCall, resolveMerchant })

  return { wpCall, resolveMerchant, merchant }
}

beforeEach(() => {
  resetMockStores()
  seedPaymentMethod()
  __resetCaptureDeps()
  __resetCancelDeps()
})

// ─── Tests: Capture ──────────────────────────────────────────────

describe("POST /api/v1/payment_intents/{id}/capture", () => {
  // ── AC1: Full capture → succeeded ──
  describe("Full capture → succeeded", () => {
    it("captures full amount and returns status:succeeded", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toBe("pi_manual001")

      // Verify settle HATEOAS URL was used
      const settleCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === HATEOAS_SETTLE_URL,
      )
      expect(settleCalls.length).toBe(1)

      // Verify PI status updated in DB
      const pi = getMockStore().paymentIntents.get("pi_manual001")
      expect(pi?.status).toBe("succeeded")
    })

    it("sends correct media type to settle endpoint", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCaptureDeps()

      await makeCaptureRequest("pi_manual001")

      const settleCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === HATEOAS_SETTLE_URL,
      )
      expect(settleCall?.[1]).toBe("payments-v7")
    })
  })

  // ── AC2: Partial capture → succeeded ──
  describe("Partial capture → succeeded", () => {
    it("captures partial amount and returns status:succeeded", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001", { amount_to_capture: 150 })
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toBe("pi_manual001")

      // Verify partialSettle HATEOAS URL was used
      const partialCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === HATEOAS_PARTIAL_SETTLE_URL,
      )
      expect(partialCalls.length).toBe(1)

      // Verify PI status updated
      const pi = getMockStore().paymentIntents.get("pi_manual001")
      expect(pi?.status).toBe("succeeded")
    })

    it("sends value object with amount and currency to partialSettle", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCaptureDeps()

      await makeCaptureRequest("pi_manual001", { amount_to_capture: 100 })

      const partialCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === HATEOAS_PARTIAL_SETTLE_URL,
      )
      const body = partialCall?.[2]?.body as Record<string, unknown>
      expect(body?.value).toEqual({ amount: 100, currency: "GBP" })
    })
  })

  // ── AC5: Capture on succeeded → 400 already_captured ──
  describe("Capture on already-succeeded PI → 400", () => {
    it("returns already_captured error", async () => {
      seedPi(makeSettledPi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_settled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("already_captured")
    })
  })

  // ── AC7: Capture exceeded → 400 ──
  describe("Partial capture exceeding amount → 400", () => {
    it("returns capture_exceeded when amount_to_capture > authorized amount", async () => {
      seedPi(makeRequiresCapturePi({ amount: 250 }))
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001", { amount_to_capture: 300 })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("capture_exceeded")
    })

    it("returns capture_exceeded when amount_to_capture equals zero", async () => {
      seedPi(makeRequiresCapturePi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001", { amount_to_capture: 0 })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("capture_exceeded")
    })

    it("returns capture_exceeded when amount_to_capture is negative", async () => {
      seedPi(makeRequiresCapturePi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001", { amount_to_capture: -1 })
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("capture_exceeded")
    })
  })

  // ── AC8: status_invalid → 400 ──
  describe("Capture on invalid status → 400", () => {
    it("returns status_invalid when PI is in processing state", async () => {
      seedPi(makeProcessingPi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_processing")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("status_invalid")
    })

    it("returns status_invalid when PI is in canceled state", async () => {
      seedPi(makeCanceledPi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_canceled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("status_invalid")
    })
  })

  // ── AC9: Wrong merchant → 404 ──
  describe("Capture on different merchant → 404", () => {
    it("returns 404 when PI belongs to different merchant", async () => {
      seedPi(makeRequiresCapturePi({ merchantId: "m_other" }))
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })
  })

  // ── AC8b: Uses stored HATEOAS URL not constructed path ──
  describe("Uses stored HATEOAS URL", () => {
    it("calls the stored settle URL, not a manually constructed path", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCaptureDeps()

      await makeCaptureRequest("pi_manual001")

      // Verify no call to a generic /cardPayments/settlements/{id} path
      const genericCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("cardPayments"),
      )
      expect(genericCalls.length).toBe(0)

      // Verify call used the exact HATEOAS URL
      const settleCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === HATEOAS_SETTLE_URL,
      )
      expect(settleCall).toBeTruthy()
    })
  })

  // ── Idempotency-Key ──
  describe("Idempotency-Key support", () => {
    it("reuses result when idempotency key matches a previously captured PI", async () => {
      seedPi(makeSettledPi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_settled", undefined, TEST_API_KEY, "idem_abc")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("succeeded")
      expect(body.id).toBe("pi_settled")
    })

    it("returns already_captured when no idempotency key on already-captured PI", async () => {
      seedPi(makeSettledPi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_settled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("already_captured")
    })
  })

  // ── Worldpay refusal ──
  describe("Worldpay refusal", () => {
    it("returns 200 with refusal code when Worldpay refuses the settlement", async () => {
      seedPi(makeRequiresCapturePi())
      setupCaptureDeps({
        wpCall: vi.fn(async () => makeRefusalResponse()),
      })

      const res = await makeCaptureRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("requires_capture")
      expect(body.failure_code).toBe("5")
      expect(body.failure_message).toBe("REFUSED")

      // PI status should NOT have changed
      const pi = getMockStore().paymentIntents.get("pi_manual001")
      expect(pi?.status).toBe("requires_capture")
    })
  })

  // ── Auth errors ──
  describe("Authentication errors", () => {
    it("returns 401 for invalid API key", async () => {
      seedPi(makeRequiresCapturePi())
      setupCaptureDeps()

      const res = await makeCaptureRequest("pi_manual001", undefined, "bad_key")
      const body = await jsonBody(res)

      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })
})

// ─── Tests: Cancel ───────────────────────────────────────────────

describe("POST /api/v1/payment_intents/{id}/cancel", () => {
  // ── AC3: Cancel → canceled ──
  describe("Cancel → canceled", () => {
    it("cancels authorization and returns status:canceled", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCancelDeps()

      const res = await makeCancelRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("canceled")
      expect(body.id).toBe("pi_manual001")

      // Verify cancel HATEOAS URL was used
      const cancelCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === HATEOAS_CANCEL_URL,
      )
      expect(cancelCalls.length).toBe(1)

      // Verify PI status updated in DB
      const pi = getMockStore().paymentIntents.get("pi_manual001")
      expect(pi?.status).toBe("canceled")
    })

    it("sends correct media type to cancel endpoint", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCancelDeps()

      await makeCancelRequest("pi_manual001")

      const cancelCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === HATEOAS_CANCEL_URL,
      )
      expect(cancelCall?.[1]).toBe("payments-v7")
    })
  })

  // ── AC6: Cancel on canceled → 400 already_canceled ──
  describe("Cancel on already-canceled PI → 400", () => {
    it("returns already_canceled error", async () => {
      seedPi(makeCanceledPi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_canceled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("already_canceled")
    })
  })

  // ── Cancel on succeeded PI → 400 status_invalid ──
  describe("Cancel on succeeded PI → 400", () => {
    it("returns status_invalid error", async () => {
      seedPi(makeSettledPi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_settled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("status_invalid")
    })
  })

  // ── Cancel on processing PI → 400 status_invalid ──
  describe("Cancel on processing PI → 400", () => {
    it("returns status_invalid when PI is in processing state", async () => {
      seedPi(makeProcessingPi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_processing")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("status_invalid")
    })
  })

  // ── Wrong merchant → 404 ──
  describe("Cancel on different merchant → 404", () => {
    it("returns 404 when PI belongs to different merchant", async () => {
      seedPi(makeRequiresCapturePi({ merchantId: "m_other" }))
      setupCancelDeps()

      const res = await makeCancelRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(404)
      expect(body.error.code).toBe("not_found")
    })
  })

  // ── Uses stored HATEOAS URL ──
  describe("Uses stored HATEOAS URL", () => {
    it("calls the stored cancel URL, not a manually constructed path", async () => {
      seedPi(makeRequiresCapturePi())
      const { wpCall } = setupCancelDeps()

      await makeCancelRequest("pi_manual001")

      // Verify call used the exact HATEOAS URL
      const cancelCall = (wpCall as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === HATEOAS_CANCEL_URL,
      )
      expect(cancelCall).toBeTruthy()

      // Verify no call to a generic cancellations path
      const genericCalls = (wpCall as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => typeof c[0] === "string" && c[0] !== HATEOAS_CANCEL_URL,
      )
      expect(genericCalls.length).toBe(0)
    })
  })

  // ── Idempotency-Key ──
  describe("Idempotency-Key support", () => {
    it("reuses result when idempotency key matches a previously canceled PI", async () => {
      seedPi(makeCanceledPi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_canceled", TEST_API_KEY, "idem_xyz")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("canceled")
      expect(body.id).toBe("pi_canceled")
    })

    it("returns already_canceled when no idempotency key on already-canceled PI", async () => {
      seedPi(makeCanceledPi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_canceled")
      const body = await jsonBody(res)

      expect(res.status).toBe(400)
      expect(body.error.code).toBe("already_canceled")
    })
  })

  // ── Worldpay refusal ──
  describe("Worldpay refusal", () => {
    it("returns 200 with refusal code when Worldpay refuses the cancel", async () => {
      seedPi(makeRequiresCapturePi())
      setupCancelDeps({
        wpCall: vi.fn(async () => makeRefusalResponse()),
      })

      const res = await makeCancelRequest("pi_manual001")
      const body = await jsonBody(res)

      expect(res.status).toBe(200)
      expect(body.status).toBe("requires_capture")
      expect(body.failure_code).toBe("5")
      expect(body.failure_message).toBe("REFUSED")

      // PI status should NOT have changed
      const pi = getMockStore().paymentIntents.get("pi_manual001")
      expect(pi?.status).toBe("requires_capture")
    })
  })

  // ── Auth errors ──
  describe("Authentication errors", () => {
    it("returns 401 for invalid API key", async () => {
      seedPi(makeRequiresCapturePi())
      setupCancelDeps()

      const res = await makeCancelRequest("pi_manual001", "bad_key")
      const body = await jsonBody(res)

      expect(res.status).toBe(401)
      expect(body.error.code).toBe("authentication_error")
    })
  })
})
