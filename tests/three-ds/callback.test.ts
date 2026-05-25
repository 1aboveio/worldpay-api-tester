/**
 * Tests for GET /api/v1/3ds/callback
 *
 * Covers:
 * - Challenge callback → verify → authorize → 302 redirect to merchant URL
 * - Successful verification → authorize succeeds → redirect ?status=succeeded
 * - Failed verification → redirect ?status=failed
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleChallengeCallback } from "@payfac/gateway-core";
import { verify3DS } from "@payfac/dal";
import {
  createMockWorldpayClient,
  mockVerifyFailed,
} from "../mocks/worldpay.js";
import { prisma } from "@payfac/dal";

beforeEach(() => {
  vi.clearAllMocks();

  const mockSession = {
    id: "3ds_sess_callback1",
    paymentIntentId: "pi_callback",
    challengeReference: "challenge-ref-abc",
    merchantReturnUrl: "https://myshop.com/checkout/complete",
    ddcJwt: "mock-ddc-jwt",
    ddcUrl: "https://secure.worldpay.com/rp/api/ddc.html",
    collectionReference: "0_4ABCDEFG",
    status: "challenged",
    createdAt: new Date(),
    updatedAt: new Date(),
    paymentIntent: {
      id: "pi_callback",
      merchantId: "merchant-1",
      amount: 250,
      currency: "GBP",
      status: "requires_action",
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
      merchantReturnUrl: "https://myshop.com/checkout/complete",
      cardBrand: null,
      cardLast4: null,
      cardExpiryMonth: null,
      cardExpiryYear: null,
      cardFunding: null,
      cardCountry: null,
      idempotencyKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      merchant: {
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
      },
    },
  };

  // @ts-expect-error - mock
  prisma.threeDSSession.findUnique = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.findFirst = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.update = vi.fn().mockResolvedValue(mockSession);
  // @ts-expect-error - mock
  prisma.threeDSSession.updateMany = vi
    .fn()
    .mockResolvedValue({ count: 1 });

  // @ts-expect-error - mock
  prisma.paymentIntent.findUnique = vi.fn().mockResolvedValue({
    ...mockSession.paymentIntent,
    merchant: mockSession.paymentIntent.merchant,
  });
  // @ts-expect-error - mock
  prisma.paymentIntent.update = vi.fn().mockResolvedValue({});
  // @ts-expect-error - mock
  prisma.paymentIntent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
});

describe("GET /api/v1/3ds/callback", () => {
  it("should verify challenge, authorize, and redirect to merchant URL with succeeded", async () => {
    const wpClient = createMockWorldpayClient();

    const result = await handleChallengeCallback({
      worldpayClient: wpClient,
      paymentIntentId: "pi_callback",
      sessionId: "3ds_sess_callback1",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    // Verify was called
    expect(wpClient.threeDSVerify).toHaveBeenCalledOnce();
    const verifyCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .threeDSVerify[0] as Record<string, unknown>;
    expect(verifyCall.challenge).toEqual({
      reference: "challenge-ref-abc",
    });

    // Authorize was called
    expect(wpClient.citAuthorize).toHaveBeenCalledOnce();

    // Redirect URL
    expect(result.redirectUrl).toBe(
      "https://myshop.com/checkout/complete?status=succeeded"
    );
  });

  it("should inject 3DS auth from verify into CIT authorize", async () => {
    const wpClient = createMockWorldpayClient();

    await handleChallengeCallback({
      worldpayClient: wpClient,
      paymentIntentId: "pi_callback",
      sessionId: "3ds_sess_callback1",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    // Verify the 3DS auth was injected into authorize
    const citCall = (wpClient as ReturnType<typeof createMockWorldpayClient>)._calls
      .citAuthorize[0] as Record<string, unknown>;
    expect(citCall.authentication).toEqual({
      threeDS: {
        version: "2.2.0",
        eci: "05",
        authenticationValue: "mock-verify-auth-value",
        transactionId: "mock-verify-tx-id",
      },
    });
  });

  it("should redirect with failed when verification fails", async () => {
    const wpClient = createMockWorldpayClient();
    mockVerifyFailed(wpClient);

    const result = await handleChallengeCallback({
      worldpayClient: wpClient,
      paymentIntentId: "pi_callback",
      sessionId: "3ds_sess_callback1",
      worldpayEntity: "test_entity",
      tokenHref: "https://try.access.worldpay.com/tokens/eyJr...",
      amount: 250,
      currency: "GBP",
      gatewayBaseUrl: "https://gateway.payfac.com",
    });

    // Verify was called
    expect(wpClient.threeDSVerify).toHaveBeenCalledOnce();

    // Authorize should NOT be called (verification failed)
    expect(wpClient.citAuthorize).not.toHaveBeenCalled();

    // Redirect URL with failed
    expect(result.redirectUrl).toBe(
      "https://myshop.com/checkout/complete?status=failed"
    );
  });
});
