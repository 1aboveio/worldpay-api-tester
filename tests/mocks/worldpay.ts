import { vi } from "vitest";
import type { IWorldpayClient } from "@payfac/worldpay-client";

/**
 * Creates a mock Worldpay client with configurable responses.
 * Tests can call `.threeDSInit`, `.threeDSAuthenticate`, etc.
 * and control what the mock returns.
 */
export function createMockWorldpayClient(): IWorldpayClient & {
  _calls: {
    threeDSInit: unknown[];
    threeDSAuthenticate: unknown[];
    threeDSVerify: unknown[];
    citAuthorize: unknown[];
  };
} {
  const calls = {
    threeDSInit: [] as unknown[],
    threeDSAuthenticate: [] as unknown[],
    threeDSVerify: [] as unknown[],
    citAuthorize: [] as unknown[],
  };

  const client: IWorldpayClient = {
    threeDSInit: vi.fn(async (params) => {
      calls.threeDSInit.push(params);
      // Default mock: returns initialized
      return {
        outcome: "initialized",
        deviceDataCollection: {
          jwt: "mock-ddc-jwt",
          url: "https://secure.worldpay.com/rp/api/ddc.html",
          bin: "444433",
        },
      };
    }),

    threeDSAuthenticate: vi.fn(async (params) => {
      calls.threeDSAuthenticate.push(params);
      // Default mock: frictionless authenticated
      return {
        outcome: "authenticated",
        authentication: {
          version: "2.2.0",
          eci: "05",
          authenticationValue: "mock-auth-value",
          transactionId: "mock-tx-id",
        },
      };
    }),

    threeDSVerify: vi.fn(async (params) => {
      calls.threeDSVerify.push(params);
      // Default mock: authenticated
      return {
        outcome: "authenticated",
        authentication: {
          version: "2.2.0",
          eci: "05",
          authenticationValue: "mock-verify-auth-value",
          transactionId: "mock-verify-tx-id",
        },
      };
    }),

    citAuthorize: vi.fn(async (params) => {
      calls.citAuthorize.push(params);
      // Default mock: authorized
      return {
        outcome: "authorized",
        paymentId: "mock-payment-id",
        issuer: { authorizationCode: "T12345" },
        scheme: { reference: "MCREF001" },
      };
    }),
  };

  return { ...client, _calls: calls };
}

/**
 * Convenience: mock authenticate response as challenged.
 */
export function mockChallenged(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.threeDSAuthenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "challenged",
    challenge: {
      reference: "challenge-ref-abc",
      url: "https://issuer-bank.com/acs/challenge",
      jwt: "mock-challenge-jwt",
      payload: '{"acsUrl":"https://issuer.com/acs"}',
    },
  });
}

/**
 * Convenience: mock authenticate response as notEnrolled.
 */
export function mockNotEnrolled(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.threeDSAuthenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "notEnrolled",
  });
}

/**
 * Convenience: mock authenticate response as unavailable.
 */
export function mockUnavailable(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.threeDSAuthenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "unavailable",
  });
}

/**
 * Convenience: mock authenticate response as authenticationFailed.
 */
export function mockAuthenticationFailed(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.threeDSAuthenticate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "authenticationFailed",
  });
}

/**
 * Convenience: mock citAuthorize as refused.
 */
export function mockCitRefused(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.citAuthorize as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "refused",
    refusalCode: "5",
    refusalDescription: "Do not honor",
  });
}

/**
 * Convenience: mock verify as failed.
 */
export function mockVerifyFailed(client: ReturnType<typeof createMockWorldpayClient>) {
  (client.threeDSVerify as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    outcome: "failed",
    error: { description: "Verification failed" },
  });
}
