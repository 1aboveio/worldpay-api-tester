/**
 * Route handler tests for GET /api/v1/3ds/callback
 *
 * Test plan: docs/tests/2026-05-27-codebase-test-audit.md (gap G2, T2)
 *
 * Tests the HTTP handler through the exported GET function.
 * Mock policy: Worldpay client, handleChallengeCallback, and PI lookup are injected via __setDeps.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, __setDeps, __resetDeps } from "@/app/api/v1/3ds/callback/route";

// ─── Helpers ────────────────────────────────────────────────

function makeRequest(queryParams: Record<string, string>): NextRequest {
  const searchParams = new URLSearchParams(queryParams);
  return new NextRequest(
    `http://localhost/api/v1/3ds/callback?${searchParams.toString()}`,
    { method: "GET" },
  );
}

async function jsonBody(res: Response) {
  return res.json();
}

function makeMockPi(overrides?: Record<string, unknown>) {
  return {
    id: "pi_cb_001",
    merchantId: "m_test",
    amount: 250,
    currency: "GBP",
    status: "requires_action",
    captureMethod: "automatic",
    tokenHref: "https://try.access.worldpay.com/tokens/tok_abc",
    riskProfileHref: null,
    threeDSStatus: null,
    threeDSVersion: null,
    threeDSEci: null,
    threeDSAuthValue: null,
    threeDSTransactionId: null,
    merchantReturnUrl: "https://myshop.com/checkout/complete",
    challengePreference: null,
    description: null,
    statementDescriptor: null,
    setupFutureUsage: null,
    createdAt: new Date("2026-05-20T10:00:00Z"),
    updatedAt: new Date("2026-05-20T10:00:00Z"),
    merchant: {
      id: "m_test",
      name: "Test Merchant",
      worldpayEntity: "test_entity",
      payfacSchemeId: null,
      subMerchantRef: null,
      subMerchantName: null,
      subMerchantStreet: null,
      subMerchantPostal: null,
      subMerchantCity: null,
      subMerchantCountry: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetDeps();
});

// ─── Tests ───────────────────────────────────────────────────

describe("GET /api/v1/3ds/callback", () => {
  // ── Successful verify → 302 redirect with succeeded ──
  describe("Successful verify → 302 redirect with succeeded", () => {
    it("returns 302 redirect with ?status=succeeded", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());
      const mockHandleCallback = vi.fn().mockResolvedValue({
        redirectUrl: "https://myshop.com/checkout/complete?status=succeeded",
      });

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => ({}) as any,
        handleChallengeCallback: mockHandleCallback as any,
      });

      const res = await GET(
        makeRequest({ pi_id: "pi_cb_001", session_id: "3ds_sess_abc" }),
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "https://myshop.com/checkout/complete?status=succeeded",
      );

      // Verify deps called correctly
      expect(mockGetPi).toHaveBeenCalledWith("pi_cb_001");
      expect(mockHandleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId: "pi_cb_001",
          sessionId: "3ds_sess_abc",
        }),
      );
    });
  });

  // ── Failed verify → 302 redirect with failed ──
  describe("Failed verify → 302 redirect with failed", () => {
    it("returns 302 redirect with ?status=failed", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());
      const mockHandleCallback = vi.fn().mockResolvedValue({
        redirectUrl: "https://myshop.com/checkout/complete?status=failed",
      });

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => ({}) as any,
        handleChallengeCallback: mockHandleCallback as any,
      });

      const res = await GET(
        makeRequest({ pi_id: "pi_cb_001", session_id: "3ds_sess_expired" }),
      );

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "https://myshop.com/checkout/complete?status=failed",
      );
    });
  });

  // ── Missing query params → 400 ──
  describe("Missing query params → 400", () => {
    it("returns 400 when pi_id is missing", async () => {
      const res = await GET(
        makeRequest({ session_id: "3ds_sess_abc" }),
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
      expect(body.error.message).toContain("pi_id");
    });

    it("returns 400 when session_id is missing", async () => {
      const res = await GET(
        makeRequest({ pi_id: "pi_cb_001" }),
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    });

    it("returns 400 when both params are missing", async () => {
      const res = await GET(makeRequest({}));
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    });
  });

  // ── PaymentIntent not found → 404 ──
  describe("PaymentIntent not found → 404", () => {
    it("returns not_found for non-existent PI", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(null);

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => ({}) as any,
      });

      const res = await GET(
        makeRequest({ pi_id: "pi_nonexistent", session_id: "sess_1" }),
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body.error.code).toBe("not_found");
    });
  });

  // ── Internal error → 500 ──
  describe("Internal error → 500", () => {
    it("returns 500 when PI lookup throws", async () => {
      const mockGetPi = vi.fn().mockRejectedValue(new Error("DB error"));

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => ({}) as any,
      });

      const res = await GET(
        makeRequest({ pi_id: "pi_cb_001", session_id: "sess_1" }),
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });
  });

  // ── Passes correct params to handleChallengeCallback ──
  describe("Passes correct params to handleChallengeCallback", () => {
    it("passes captureMethod, setupFutureUsage, and merchant fields", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(
        makeMockPi({
          captureMethod: "manual",
          setupFutureUsage: "off_session",
        }),
      );
      const mockHandleCallback = vi.fn().mockResolvedValue({
        redirectUrl: "https://myshop.com/checkout/complete?status=succeeded",
      });

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => ({}) as any,
        handleChallengeCallback: mockHandleCallback as any,
      });

      await GET(
        makeRequest({ pi_id: "pi_cb_001", session_id: "sess_1" }),
      );

      expect(mockHandleCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          captureMethod: "manual",
          setupFutureUsage: "off_session",
        }),
      );
    });
  });
});
