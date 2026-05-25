/**
 * Tests for POST /api/v1/payment_intents/{id}/device_data
 *
 * Covers:
 * - device_data endpoint triggers authenticate
 * - Challenged outcome → requires_action response
 * - Authenticated outcome → succeeded
 * - notEnrolled → succeeded
 * - authenticationFailed → payment_failed
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
  mockAuthenticationFailed,
} from "../mocks/worldpay.js";
import { prisma } from "@payfac/dal";

beforeEach(() => {
  vi.clearAllMocks();

  const mockSession = {
    id: "3ds_sess_abc123",
    paymentIntentId: "pi_test456",
    challengeReference: null,
    merchantReturnUrl: null,
    ddcJwt: "mock-ddc-jwt",
    ddcUrl: "https://secure.worldpay.com/rp/api/ddc.html",
    collectionReference: null,
    status: "initialized",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // @ts-expect-error - mock
  prisma.threeDSSession.findFirst = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.findUnique = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.create = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.update = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.updateMany = vi
    .fn()
    .mockResolvedValue({ count: 1 });

  // @ts-expect-error - mock
  prisma.paymentIntent.update = vi.fn().mockResolvedValue({});
  // @ts-expect-error - mock
  prisma.paymentIntent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
});

describe("POST /api/v1/payment_intents/{id}/device_data", () => {
  it("submitting device_data with collectionReference triggers authenticate", async () => {
    const wpClient = createMockWorldpayClient();

    // Simulate device_data submission: DDC already initialized, now we have collectionReference
    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test456",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      collectionReference: "0_4XYZ12345",
      acceptHeader: "text/html,application/xhtml+xml",
      userAgentHeader:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    // Should authenticate and succeed frictionless (default mock)
    expect(result.type).toBe("continue_to_authorize");

    // Verify authenticate was called with device data headers
    const authCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .threeDSAuthenticate[0] as Record<string, unknown>;
    expect(authCall.deviceData).toMatchObject({
      acceptHeader: "text/html,application/xhtml+xml",
      userAgentHeader:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      collectionReference: "0_4XYZ12345",
    });
  });

  it("device_data with challenged outcome returns requires_action", async () => {
    const wpClient = createMockWorldpayClient();
    mockChallenged(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test456",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 1000,
      currency: "USD",
      collectionReference: "0_4CHALLENGE",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("requires_action");
    if (result.type === "requires_action") {
      expect(result.challengeUrl).toBe(
        "https://issuer-bank.com/acs/challenge"
      );
    }
  });

  it("device_data with notEnrolled continues to authorize", async () => {
    const wpClient = createMockWorldpayClient();
    mockNotEnrolled(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test456",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 500,
      currency: "EUR",
      collectionReference: "0_4NOTENROLLED",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("continue_to_authorize");
    if (result.type === "continue_to_authorize") {
      expect(result.threeDSStatus).toBe("not_enrolled");
      expect(result.threeDS).toBeUndefined();
    }
  });

  it("device_data with authenticationFailed returns payment_failed", async () => {
    const wpClient = createMockWorldpayClient();
    mockAuthenticationFailed(wpClient);

    const result = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: "pi_test456",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 750,
      currency: "GBP",
      collectionReference: "0_4FAILED",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    expect(result.type).toBe("payment_failed");
    if (result.type === "payment_failed") {
      expect(result.failureCode).toBe("3ds_failed");
    }
  });
});
