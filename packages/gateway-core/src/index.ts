import type { IWorldpayClient, ThreeDSInjection } from "@payfac/worldpay-client";
import { initDDC, authenticate3DS, verify3DS, ThreeDSSessionManager } from "@payfac/dal";
import {
  findPaymentIntentWithMerchant,
  storePaymentResult,
  storeThreeDSResult,
  updatePaymentIntentStatus,
} from "@payfac/dal";
import type { PaymentIntentResponse } from "@payfac/validators";

// ── Config ─────────────────────────────────────────────────

export interface GatewayConfig {
  gatewayBaseUrl: string; // e.g., "https://gateway.payfac.com"
}

// ── 3DS Orchestration result ──────────────────────────────

export type ThreeDSOrchestrationResult =
  | {
      type: "continue_to_authorize";
      threeDS?: ThreeDSInjection;
      threeDSStatus: "authenticated" | "not_enrolled" | "unavailable";
    }
  | {
      type: "requires_device_data";
      ddcUrl: string;
      ddcJwt: string;
    }
  | {
      type: "requires_action";
      challengeUrl: string;
      challengeJwt: string;
      challengePayload: string;
      sessionId: string;
    }
  | {
      type: "payment_failed";
      failureCode: string;
    };

// ── Main 3DS flow ─────────────────────────────────────────

export async function runThreeDSFlow(params: {
  worldpayClient: IWorldpayClient;
  paymentIntentId: string;
  worldpayEntity: string;
  tokenHref: string;
  amount: number;
  currency: string;
  collectionReference?: string;
  acceptHeader?: string;
  userAgentHeader?: string;
  merchantReturnUrl?: string;
  challengePreference?: string;
  gatewayBaseUrl: string;
}): Promise<ThreeDSOrchestrationResult> {
  const {
    worldpayClient,
    paymentIntentId,
    worldpayEntity,
    tokenHref,
    amount,
    currency,
    collectionReference,
    acceptHeader,
    userAgentHeader,
    merchantReturnUrl,
    challengePreference,
    gatewayBaseUrl,
  } = params;

  // Step 1: DDC Init
  const ddcResponse = await initDDC({
    worldpayClient,
    worldpayEntity,
    tokenHref,
    paymentIntentId,
  });
  const { url: ddcUrl, jwt: ddcJwt } =
    ddcResponse.deviceDataCollection;

  // Store merchant return URL on PaymentIntent if provided
  if (merchantReturnUrl) {
    await updatePaymentIntentStatus(paymentIntentId, "processing", {
      merchantReturnUrl,
    });
  }

  // Step 2: If no collectionReference, return requires_device_data
  if (!collectionReference) {
    return {
      type: "requires_device_data",
      ddcUrl,
      ddcJwt,
    };
  }

  // Step 3: Store collection reference and proceed to authenticate
  await ThreeDSSessionManager.setCollectionReference(
    paymentIntentId,
    collectionReference
  );

  const challengeReturnUrl = `${gatewayBaseUrl}/api/v1/3ds/callback?pi_id=${paymentIntentId}`;

  const authResponse = await authenticate3DS({
    worldpayClient,
    worldpayEntity,
    tokenHref,
    paymentIntentId,
    amount,
    currency,
    collectionReference,
    acceptHeader,
    userAgentHeader,
    challengeReturnUrl,
    challengePreference,
  });

  switch (authResponse.outcome) {
    case "authenticated": {
      const auth = authResponse.authentication;
      return {
        type: "continue_to_authorize",
        threeDS: {
          version: auth.version,
          eci: auth.eci,
          authenticationValue: auth.authenticationValue,
          transactionId: auth.transactionId,
        },
        threeDSStatus: "authenticated",
      };
    }

    case "challenged": {
      // Store challenge details in session
      const session = await ThreeDSSessionManager.findByPaymentIntent(
        paymentIntentId
      );

      return {
        type: "requires_action",
        challengeUrl: authResponse.challenge.url,
        challengeJwt: authResponse.challenge.jwt,
        challengePayload: authResponse.challenge.payload,
        sessionId: session?.id ?? "",
      };
    }

    case "notEnrolled":
      return { type: "continue_to_authorize", threeDSStatus: "not_enrolled" };

    case "unavailable":
      return { type: "continue_to_authorize", threeDSStatus: "unavailable" };

    case "authenticationFailed":
      return { type: "payment_failed", failureCode: "3ds_failed" };

    default:
      return { type: "payment_failed", failureCode: "3ds_unknown" };
  }
}

// ── Authorize with 3DS injection ──────────────────────────

export async function authorizeWithThreeDS(params: {
  worldpayClient: IWorldpayClient;
  paymentIntentId: string;
  worldpayEntity: string;
  tokenHref: string;
  amount: number;
  currency: string;
  threeDS?: ThreeDSInjection;
  threeDSStatus: "authenticated" | "not_enrolled" | "unavailable";
  payfacSchemeId?: string;
  subMerchantRef?: string;
  subMerchantName?: string;
  subMerchantStreet?: string;
  subMerchantPostal?: string;
  subMerchantCity?: string;
  subMerchantCountry?: string;
  statementDescriptor?: string;
  riskProfileHref?: string;
  setupFutureUsage?: string;
  captureMethod?: string;
}): Promise<{ status: "succeeded" | "payment_failed"; details: Record<string, unknown> }> {
  const {
    worldpayClient,
    paymentIntentId,
    worldpayEntity,
    tokenHref,
    amount,
    currency,
    threeDS,
    threeDSStatus,
    payfacSchemeId,
    subMerchantRef,
    subMerchantName,
    subMerchantStreet,
    subMerchantPostal,
    subMerchantCity,
    subMerchantCountry,
    statementDescriptor,
    riskProfileHref,
    setupFutureUsage,
    captureMethod = "automatic",
  } = params;

  const citRequest: Parameters<IWorldpayClient["citAuthorize"]>[0] = {
    transactionReference: `cit-${paymentIntentId}`,
    merchant: { entity: worldpayEntity },
    instruction: {
      requestAutoSettlement: { enabled: captureMethod !== "manual" },
      narrative: {
        line1: (statementDescriptor ?? "").substring(0, 24),
      },
      value: { amount, currency },
      paymentInstrument: { type: "card/token", href: tokenHref },
    },
    channel: "ecom",
  };

  // Add PayFac details if available
  if (
    payfacSchemeId &&
    subMerchantRef &&
    subMerchantName &&
    subMerchantStreet &&
    subMerchantPostal &&
    subMerchantCity &&
    subMerchantCountry
  ) {
    citRequest.merchant.paymentFacilitator = {
      schemeId: payfacSchemeId,
      subMerchant: {
        reference: subMerchantRef,
        name: subMerchantName,
        address: {
          street: subMerchantStreet,
          postalCode: subMerchantPostal,
          city: subMerchantCity,
          countryCode: subMerchantCountry,
        },
      },
    };
  }

  // Inject 3DS result
  if (threeDS) {
    citRequest.authentication = { threeDS };
  }

  if (riskProfileHref) {
    citRequest.riskProfile = riskProfileHref;
  }

  if (setupFutureUsage === "off_session") {
    citRequest.instruction.customerAgreement = {
      type: "cardOnFile",
      storedCardUsage: "first",
    };
  }

  const citResponse = await worldpayClient.citAuthorize(citRequest);

  if (
    citResponse.outcome === "authorized" ||
    citResponse.outcome === "sentForSettlement"
  ) {
    // Store successful payment result
    await storePaymentResult(paymentIntentId, {
      status: "succeeded",
      worldpayPaymentId: citResponse.paymentId,
      schemeReference: citResponse.scheme?.reference,
      issuerAuthCode: citResponse.issuer?.authorizationCode,
      threeDSStatus,
      ...(threeDS && {
        threeDSVersion: threeDS.version,
        threeDSEci: threeDS.eci,
        threeDSAuthValue: threeDS.authenticationValue,
        threeDSTransactionId: threeDS.transactionId,
      }),
    });

    return {
      status: "succeeded",
      details: {
        worldpayPaymentId: citResponse.paymentId,
        schemeReference: citResponse.scheme?.reference,
        issuerAuthCode: citResponse.issuer?.authorizationCode,
      },
    };
  }

  // Payment refused
  await storePaymentResult(paymentIntentId, {
    status: "payment_failed",
    failureCode: citResponse.refusalCode ?? "refused",
    failureMessage: citResponse.refusalDescription,
    threeDSStatus,
    ...(threeDS && {
      threeDSVersion: threeDS.version,
      threeDSEci: threeDS.eci,
      threeDSAuthValue: threeDS.authenticationValue,
    }),
  });

  return {
    status: "payment_failed",
    details: {
      failureCode: citResponse.refusalCode ?? "refused",
      failureMessage: citResponse.refusalDescription,
    },
  };
}

// ── Challenge callback handler ─────────────────────────────

export async function handleChallengeCallback(params: {
  worldpayClient: IWorldpayClient;
  paymentIntentId: string;
  sessionId: string;
  worldpayEntity: string;
  tokenHref: string;
  amount: number;
  currency: string;
  gatewayBaseUrl: string;
  payfacSchemeId?: string;
  subMerchantRef?: string;
  subMerchantName?: string;
  subMerchantStreet?: string;
  subMerchantPostal?: string;
  subMerchantCity?: string;
  subMerchantCountry?: string;
  statementDescriptor?: string;
  riskProfileHref?: string;
}): Promise<{
  redirectUrl: string;
}> {
  const {
    worldpayClient,
    paymentIntentId,
    sessionId,
    worldpayEntity,
    tokenHref,
    amount,
    currency,
    payfacSchemeId,
    subMerchantRef,
    subMerchantName,
    subMerchantStreet,
    subMerchantPostal,
    subMerchantCity,
    subMerchantCountry,
    statementDescriptor,
    riskProfileHref,
  } = params;

  // Step 1: Verify
  const verifyResult = await verify3DS({
    worldpayClient,
    worldpayEntity,
    sessionId,
  });

  if (verifyResult.outcome !== "authenticated" || !verifyResult.threeDS) {
    // Update PI to failed
    await updatePaymentIntentStatus(paymentIntentId, "payment_failed", {
      failureCode: "3ds_verification_failed",
    });

    // Get merchant return URL
    const pi = await findPaymentIntentWithMerchant(paymentIntentId);
    const returnUrl = pi?.merchantReturnUrl ?? "/";
    return { redirectUrl: `${returnUrl}?status=failed` };
  }

  // Step 2: Authorize with 3DS
  const authResult = await authorizeWithThreeDS({
    worldpayClient,
    paymentIntentId,
    worldpayEntity,
    tokenHref,
    amount,
    currency,
    threeDS: verifyResult.threeDS,
    threeDSStatus: "authenticated",
    payfacSchemeId,
    subMerchantRef,
    subMerchantName,
    subMerchantStreet,
    subMerchantPostal,
    subMerchantCity,
    subMerchantCountry,
    statementDescriptor,
    riskProfileHref,
  });

  // Step 3: Get merchant return URL for redirect
  const pi = await findPaymentIntentWithMerchant(paymentIntentId);
  const returnUrl = pi?.merchantReturnUrl ?? "/";
  const status = authResult.status === "succeeded" ? "succeeded" : "failed";

  return { redirectUrl: `${returnUrl}?status=${status}` };
}
