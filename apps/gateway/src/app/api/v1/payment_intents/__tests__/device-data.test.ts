/**
 * Route handler tests for POST /api/v1/payment_intents/{id}/device_data
 *
 * Test plan: docs/tests/2026-05-27-codebase-test-audit.md (gap G1, T1)
 *
 * Tests the HTTP handler directly through the exported POST function.
 * Mock policy: Worldpay client, orchestrator functions, and DAL are injected via __setDeps.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, __setDeps, __resetDeps } from "@/app/api/v1/payment_intents/[id]/device_data/route";

// ─── Helpers ────────────────────────────────────────────────

function makeRequest(
  piId: string,
  body: unknown,
  contentType = "application/json",
): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/payment_intents/${piId}/device_data`,
    {
      method: "POST",
      headers: new Headers({ "content-type": contentType }),
      body: JSON.stringify(body),
    } as never,
  );
}

async function jsonBody(res: Response) {
  return res.json();
}

function makeMockPi(overrides?: Record<string, unknown>) {
  return {
    id: "pi_dd_001",
    merchantId: "m_test",
    amount: 250,
    currency: "GBP",
    status: "requires_device_data",
    captureMethod: "automatic",
    tokenHref: "https://try.access.worldpay.com/tokens/tok_abc",
    riskProfileHref: null,
    threeDSStatus: null,
    threeDSVersion: null,
    threeDSEci: null,
    threeDSAuthValue: null,
    threeDSTransactionId: null,
    merchantReturnUrl: null,
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

function makeMockWpClient() {
  return {
    threeDSInit: vi.fn(),
    threeDSAuthenticate: vi.fn(),
    threeDSVerify: vi.fn(),
    citAuthorize: vi.fn(),
  } as unknown as ReturnType<typeof vi.fn> & {
    threeDSInit: ReturnType<typeof vi.fn>;
    threeDSAuthenticate: ReturnType<typeof vi.fn>;
    threeDSVerify: ReturnType<typeof vi.fn>;
    citAuthorize: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetDeps();
});

// ─── Tests ───────────────────────────────────────────────────

describe("POST /api/v1/payment_intents/{id}/device_data", () => {
  // ── Valid DDC submission → continue_to_authorize ──
  describe("Valid DDC submission → continue_to_authorize", () => {
    it("returns continue_to_authorize result with three_d_secure status", async () => {
      const mockPi = makeMockPi();
      const mockWp = makeMockWpClient();

      const mockRun3DS = vi.fn().mockResolvedValue({
        type: "continue_to_authorize" as const,
        threeDS: {
          version: "2.2.0",
          eci: "05",
          authenticationValue: "mock-auth-value",
          transactionId: "mock-tx-id",
        },
        threeDSStatus: "authenticated" as const,
      });

      const mockAuthorize = vi.fn().mockResolvedValue({
        status: "succeeded" as const,
        details: {},
      });

      const mockGetPi = vi.fn().mockResolvedValue(mockPi);
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => mockWp as any,
        runThreeDSFlow: mockRun3DS as any,
        authorizeWithThreeDS: mockAuthorize as any,
        updatePaymentIntentStatus: mockUpdateStatus as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4XYZ12345",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe("succeeded");
      expect(body.id).toBe("pi_dd_001");
      expect(body.three_d_secure.status).toBe("authenticated");

      // Verify deps were called correctly
      expect(mockGetPi).toHaveBeenCalledWith("pi_dd_001");
      expect(mockRun3DS).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId: "pi_dd_001",
          collectionReference: "0_4XYZ12345",
          skipDdcInit: true,
        }),
      );
      expect(mockAuthorize).toHaveBeenCalledOnce();
    });
  });

  // ── Challenged outcome → requires_action ──
  describe("Challenged outcome → requires_action", () => {
    it("returns requires_action with challenge details", async () => {
      const mockRun3DS = vi.fn().mockResolvedValue({
        type: "requires_action" as const,
        challengeUrl: "https://issuer-bank.com/acs/challenge",
        challengeJwt: "mock-challenge-jwt",
        challengePayload: '{"acsUrl":"https://issuer.com/acs"}',
        sessionId: "3ds_sess_abc",
      });

      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
        runThreeDSFlow: mockRun3DS as any,
        updatePaymentIntentStatus: mockUpdateStatus as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4CHALLENGE",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe("requires_action");
      expect(body.next_action.type).toBe("three_d_secure_challenge");
      expect(body.next_action.three_d_secure_challenge.challenge_url).toBe(
        "https://issuer-bank.com/acs/challenge",
      );
      expect(body.next_action.three_d_secure_challenge.challenge_jwt).toBe(
        "mock-challenge-jwt",
      );

      expect(mockUpdateStatus).toHaveBeenCalledWith("pi_dd_001", "requires_action");
    });
  });

  // ── authenticationFailed → payment_failed ──
  describe("authenticationFailed → payment_failed", () => {
    it("returns payment_failed with failure_code", async () => {
      const mockRun3DS = vi.fn().mockResolvedValue({
        type: "payment_failed" as const,
        failureCode: "3ds_failed",
      });

      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
        runThreeDSFlow: mockRun3DS as any,
        updatePaymentIntentStatus: mockUpdateStatus as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4FAILED",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe("payment_failed");
      expect(body.failure_code).toBe("3ds_failed");

      expect(mockUpdateStatus).toHaveBeenCalledWith(
        "pi_dd_001",
        "payment_failed",
        { failureCode: "3ds_failed" },
      );
    });
  });

  // ── PaymentIntent not found → 404 ──
  describe("PI not found → 404", () => {
    it("returns not_found for non-existent PI", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(null);

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
      });

      const res = await POST(
        makeRequest("pi_nonexistent", {
          collection_reference: "0_4XYZ",
        }),
        { params: Promise.resolve({ id: "pi_nonexistent" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(404);
      expect(body.error.code).toBe("not_found");
    });
  });

  // ── Invalid status → 400 ──
  describe("Invalid PI status → 400", () => {
    it("returns status_invalid for PI in wrong status", async () => {
      const mockGetPi = vi
        .fn()
        .mockResolvedValue(makeMockPi({ status: "succeeded" }));

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4XYZ",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("status_invalid");
    });
  });

  // ── Invalid body → 400 ──
  describe("Invalid request body → 400", () => {
    it("returns invalid_request for missing collection_reference", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {}),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    });

    it("returns 400 for empty collection_reference", async () => {
      const mockGetPi = vi.fn().mockResolvedValue(makeMockPi());

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", { collection_reference: "" }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    });
  });

  // ── Processing status accepted ──
  describe("Processing status accepted", () => {
    it("accepts PI in processing status (retry scenario)", async () => {
      const mockRun3DS = vi.fn().mockResolvedValue({
        type: "continue_to_authorize" as const,
        threeDS: {
          version: "2.2.0",
          eci: "05",
          authenticationValue: "mock-auth",
          transactionId: "mock-tx",
        },
        threeDSStatus: "authenticated" as const,
      });

      const mockAuthorize = vi.fn().mockResolvedValue({
        status: "succeeded" as const,
        details: {},
      });

      const mockGetPi = vi
        .fn()
        .mockResolvedValue(makeMockPi({ status: "processing" }));
      const mockUpdateStatus = vi.fn().mockResolvedValue({});

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
        runThreeDSFlow: mockRun3DS as any,
        authorizeWithThreeDS: mockAuthorize as any,
        updatePaymentIntentStatus: mockUpdateStatus as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4XYZ",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe("succeeded");
    });
  });

  // ── Error handling ──
  describe("Internal error handling", () => {
    it("returns 500 on unexpected errors", async () => {
      const mockGetPi = vi.fn().mockRejectedValue(new Error("DB error"));

      __setDeps({
        getPaymentIntentByIdAndMerchant: mockGetPi as any,
        getWorldpayClient: () => makeMockWpClient() as any,
      });

      const res = await POST(
        makeRequest("pi_dd_001", {
          collection_reference: "0_4XYZ",
        }),
        { params: Promise.resolve({ id: "pi_dd_001" }) },
      );
      const body = await jsonBody(res);

      expect(res.status).toBe(500);
      expect(body.error.code).toBe("internal_error");
    });
  });
});
