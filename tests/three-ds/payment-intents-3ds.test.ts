/**
 * Tests for the 3DS flow orchestration.
 *
 * Covers acceptance criteria:
 * - Payment with three_d_secure.enabled: true + frictionless -> succeeded authenticated
 * - DDC needed -> requires_device_data response
 * - three_d_secure.enabled: false -> skips all 3DS, status: not_requested
 * - notEnrolled -> succeeded without liability shift (no threeDS injection)
 * - unavailable -> succeeded without liability shift
 * - authenticationFailed -> payment_failed
 * - 3DS auth result injected into CIT authorize request
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runThreeDSFlow,
  authorizeWithThreeDS,
} from "@payfac/gateway-core";
import {
  createMockWorldpayClient,
  mockChallenged,
  mockNotEnrolled,
  mockUnavailable,
  mockAuthenticationFailed,
  mockCitRefused,
} from "../mocks/worldpay.js";
import { prisma } from "@payfac/dal";

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();

  // Default Prisma mocks
  const mockMerchant = {
    id: "merchant-1",
    name: "Test Merchant",
    apiKey: "sk_test_123",
    worldpayEntity: "test_entity",
    payfacSchemeId: null,
    subMerchantRef: null,
    subMerchantName: null,
    subMerchantStreet: null,
    subMerchantPostal: null,
    subMerchantCity: null,
    subMerchantCountry: null,
    fraudsightEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPI = {
    id: "pi_test123",
    merchantId: "merchant-1",
    amount: 250,
    currency: "GBP",
    status: "processing",
    captureMethod: "automatic",
    tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
    threeDSStatus: null,
    threeDSVersion: null,
    threeDSEci: null,
    threeDSAuthValue: null,
    threeDSTransactionId: null,
    riskProfileHref: null,
    worldpayPaymentId: null,
    schemeReference: null,
    issuerAuthCode: null,
    failureCode: null,
    failureMessage: null,
    description: null,
    statementDescriptor: "MYSHOP.CO",
    setupFutureUsage: null,
    confirm: true,
    challengePreference: null,
    merchantReturnUrl: null,
    cardBrand: null,
    cardLast4: null,
    cardExpiryMonth: null,
    cardExpiryYear: null,
    cardFunding: null,
    cardCountry: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - mock
  prisma.merchant.findUnique = vi.fn().mockResolvedValue(mockMerchant);
  // @ts-expect-error - mock
  prisma.paymentIntent.findUnique = vi.fn().mockResolvedValue(mockPI);
  // @ts-expect-error - mock
  prisma.paymentIntent.findFirst = vi.fn().mockResolvedValue(mockPI);
  // @ts-expect-error - mock
  prisma.paymentIntent.create = vi.fn().mockResolvedValue(mockPI);
  // @ts-expect-error - mock
  prisma.paymentIntent.update = vi.fn().mockResolvedValue(mockPI);
  // @ts-expect-error - mock
  prisma.paymentIntent.updateMany = vi.fn().mockResolvedValue({ count: 1 });

  const mockSession = {
    id: "3ds_sess_abc123",
    paymentIntentId: "pi_test123",
    challengeReference: null,
    merchantReturnUrl: null,
    ddcJwt: null,
    ddcUrl: null,
    collectionReference: null,
    status: "initialized",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - mock
  prisma.threeDSSession.create = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.findUnique = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.findFirst = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.update = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.updateMany = vi.fn().mockResolvedValue({ count: 1 });
});

// ── Scenario 1: Frictionless authentication ───────────────

describe("3DS Frictionless flow (authenticated)", () => {
  it("should authenticate frictionless and continue to authorize", async () => {
    const wpClient = createMockWorldpayClient();

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4ABCDEFG",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("continue_to_authorize");
    if (result.type === "continue_to_authorize") {
      expect(result.threeDSStatus).toBe("authenticated");
      expect(result.threeDS).toBeDefined();
      expect(result.threeDS!.version).toBe("2.2.0");
      expect(result.threeDS!.eci).toBe("05");
      expect(result.threeDS!.authenticationValue).toBe("mock-auth-value");
      expect(result.threeDS!.transactionId).toBe("mock-tx-id");
    }

    // Verify DDC Init was called
    expect(wpClient.threeDSInit).toHaveBeenCalledOnce();
    const ddcCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .threeDSInit[0] as Record<string, unknown>;
    expect(ddcCall.merchant).toEqual({ entity: "test_entity" });

    // Verify Authenticate was called with proper params
    expect(wpClient.threeDSAuthenticate).toHaveBeenCalledOnce();
    const authCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .threeDSAuthenticate[0] as Record<string, unknown>;
    expect(authCall.instruction).toMatchObject({
      value: { amount: 250, currency: "GBP" },
    });
    expect(authCall.deviceData).toMatchObject({
      collectionReference: "0_4ABCDEFG",
    });
    expect(authCall.challenge).toMatchObject({
      returnUrl:
        "https://gateway.payfac.com/api/v1/3ds/callback?pi_id=pi_test123",
    });
  });

  it("should inject 3DS auth result into CIT authorize request", async () => {
    const wpClient = createMockWorldpayClient();

    await authorizeWithThreeDS({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      threeDS: {
        version: "2.2.0",
        eci: "05",
        authenticationValue: "kBNHXUAy...",
        transactionId: "b8fb4ecc-...",
      },
      threeDSStatus: "authenticated",
    });

    expect(wpClient.citAuthorize).toHaveBeenCalledOnce();
    const citCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .citAuthorize[0] as Record<string, unknown>;

    // Verify 3DS injection
    expect(citCall.authentication).toEqual({
      threeDS: {
        version: "2.2.0",
        eci: "05",
        authenticationValue: "kBNHXUAy...",
        transactionId: "b8fb4ecc-...",
      },
    });
  });

  it("should return succeeded with authenticated three_d_secure status", async () => {
    const wpClient = createMockWorldpayClient();

    const result = await authorizeWithThreeDS({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      threeDS: {
        version: "2.2.0",
        eci: "05",
        authenticationValue: "mock-auth-value",
        transactionId: "mock-tx-id",
      },
      threeDSStatus: "authenticated",
    });

    expect(result.status).toBe("succeeded");
  });
});

// ── Scenario 2: DDC needed (no collection reference) ──────

describe("3DS DDC required (no collectionReference)", () => {
  it("should return requires_device_data when no collectionReference", async () => {
    const wpClient = createMockWorldpayClient();

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      // No collectionReference
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("requires_device_data");
    if (result.type === "requires_device_data") {
      expect(result.ddcUrl).toBe(
        "https://secure.worldpay.com/rp/api/ddc.html"
      );
      expect(result.ddcJwt).toBe("mock-ddc-jwt");
    }

    // Verify DDC Init was called but NOT Authenticate
    expect(wpClient.threeDSInit).toHaveBeenCalledOnce();
    expect(wpClient.threeDSAuthenticate).not.toHaveBeenCalled();
  });
});

// ── Scenario 3: Challenged ────────────────────────────────

describe("3DS Challenged flow", () => {
  it("should return requires_action with challenge details", async () => {
    const wpClient = createMockWorldpayClient();
    mockChallenged(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4ABCDEFG",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("requires_action");
    if (result.type === "requires_action") {
      expect(result.challengeUrl).toBe(
        "https://issuer-bank.com/acs/challenge"
      );
      expect(result.challengeJwt).toBe("mock-challenge-jwt");
      expect(result.challengePayload).toBe(
        '{"acsUrl":"https://issuer.com/acs"}'
      );
    }
  });
});

// ── Scenario 4: notEnrolled ───────────────────────────────

describe("3DS notEnrolled", () => {
  it("should continue to authorize with not_enrolled status and no threeDS injection", async () => {
    const wpClient = createMockWorldpayClient();
    mockNotEnrolled(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4ABCDEFG",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("continue_to_authorize");
    if (result.type === "continue_to_authorize") {
      expect(result.threeDSStatus).toBe("not_enrolled");
      expect(result.threeDS).toBeUndefined();
    }
  });

  it("should authorize without 3DS injection (no liability shift)", async () => {
    const wpClient = createMockWorldpayClient();

    const result = await authorizeWithThreeDS({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      threeDSStatus: "not_enrolled",
      // No threeDS injection
    });

    expect(result.status).toBe("succeeded");

    const citCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .citAuthorize[0] as Record<string, unknown>;
    expect(citCall.authentication).toBeUndefined();
  });
});

// ── Scenario 5: unavailable ───────────────────────────────

describe("3DS unavailable", () => {
  it("should continue to authorize with unavailable status", async () => {
    const wpClient = createMockWorldpayClient();
    mockUnavailable(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4ABCDEFG",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("continue_to_authorize");
    if (result.type === "continue_to_authorize") {
      expect(result.threeDSStatus).toBe("unavailable");
    }
  });
});

// ── Scenario 6: authenticationFailed ──────────────────────

describe("3DS authenticationFailed", () => {
  it("should return payment_failed with 3ds_failed failure code", async () => {
    const wpClient = createMockWorldpayClient();
    mockAuthenticationFailed(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4ABCDEFG",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("payment_failed");
    if (result.type === "payment_failed") {
      expect(result.failureCode).toBe("3ds_failed");
    }
  });
});

// ── Scenario 7: 3DS disabled ──────────────────────────────

describe("3DS disabled", () => {
  it("should skip DDC Init and Authenticate, go straight to authorize", async () => {
    const wpClient = createMockWorldpayClient();

    // When 3DS disabled, we call authorizeWithThreeDS directly
    const result = await authorizeWithThreeDS({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      threeDSStatus: "not_requested",
    });

    expect(result.status).toBe("succeeded");

    // Verify no 3DS calls were made
    expect(wpClient.threeDSInit).not.toHaveBeenCalled();
    expect(wpClient.threeDSAuthenticate).not.toHaveBeenCalled();

    // But CIT authorize was called
    expect(wpClient.citAuthorize).toHaveBeenCalledOnce();

    // Verify no threeDS in the request
    const citCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .citAuthorize[0] as Record<string, unknown>;
    expect(citCall.authentication).toBeUndefined();
  });
});

// ── Scenario 8: CIT authorize refused ─────────────────────

describe("CIT authorize refused after 3DS", () => {
  it("should return payment_failed when CIT authorize is refused", async () => {
    const wpClient = createMockWorldpayClient();
    mockCitRefused(wpClient);

    const result = await authorizeWithThreeDS({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test123",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      threeDS: {
        version: "2.2.0",
        eci: "05",
        authenticationValue: "mock-auth-value",
        transactionId: "mock-tx-id",
      },
      threeDSStatus: "authenticated",
    });

    expect(result.status).toBe("payment_failed");
    expect(result.details.failureCode).toBe("5");
  });
});
