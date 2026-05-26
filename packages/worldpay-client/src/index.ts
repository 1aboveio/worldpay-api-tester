/** Media type constants for Worldpay API */
export const MEDIA_TYPES = {
  TOKENS_V3: "application/vnd.worldpay.tokens-v3.hal+json",
  CARD_PAYMENTS_V7: "application/vnd.worldpay.payments-v7+json",
  THREEDS: "application/vnd.worldpay.verifications.customers-v2.hal+json",
  FRAUDSIGHT: "application/vnd.worldpay.fraudsight-v1.hal+json",
} as const;

export type WorldpayMediaType = (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];

// ── 3DS DDC Init ──────────────────────────────────────────

export interface DdcInitRequest {
  transactionReference: string;
  merchant: { entity: string };
  paymentInstrument: { type: "card/tokenized"; href: string };
}

export interface DdcInitResponse {
  outcome: "initialized";
  deviceDataCollection: {
    jwt: string;
    url: string;
    bin: string;
  };
}

// ── 3DS Authenticate ──────────────────────────────────────

export interface ThreeDSAuthenticateRequest {
  transactionReference: string;
  merchant: { entity: string };
  instruction: {
    value: { amount: number; currency: string };
    paymentInstrument: { type: "card/tokenized"; href: string };
  };
  deviceData: {
    acceptHeader: string;
    userAgentHeader: string;
    collectionReference: string;
  };
  challenge: {
    returnUrl: string;
    preference?: string;
  };
}

export interface ThreeDSAuthSuccess {
  outcome: "authenticated";
  authentication: {
    version: string;
    eci: string;
    authenticationValue: string;
    transactionId: string;
  };
}

export interface ThreeDSAuthChallenged {
  outcome: "challenged";
  challenge: {
    reference: string;
    url: string;
    jwt: string;
    payload: string;
  };
}

export interface ThreeDSAuthNotEnrolled {
  outcome: "notEnrolled";
}

export interface ThreeDSAuthUnavailable {
  outcome: "unavailable";
}

export interface ThreeDSAuthFailed {
  outcome: "authenticationFailed";
}

export type ThreeDSAuthenticateResponse =
  | ThreeDSAuthSuccess
  | ThreeDSAuthChallenged
  | ThreeDSAuthNotEnrolled
  | ThreeDSAuthUnavailable
  | ThreeDSAuthFailed;

// ── 3DS Verify ────────────────────────────────────────────

export interface ThreeDSVerifyRequest {
  transactionReference: string;
  merchant: { entity: string };
  challenge: { reference: string };
}

export interface ThreeDSVerifyResponse {
  outcome: "authenticated" | "failed";
  authentication?: {
    version: string;
    eci: string;
    authenticationValue: string;
    transactionId: string;
  };
  error?: { description: string };
}

// ── CIT Authorize ─────────────────────────────────────────

export interface ThreeDSInjection {
  version: string;
  eci: string;
  authenticationValue: string;
  transactionId: string;
}

export interface CITAuthorizeRequest {
  transactionReference: string;
  merchant: {
    entity: string;
    paymentFacilitator?: {
      schemeId: string;
      subMerchant: {
        reference: string;
        name: string;
        address: {
          street: string;
          postalCode: string;
          city: string;
          countryCode: string;
        };
      };
    };
  };
  instruction: {
    requestAutoSettlement: { enabled: boolean };
    narrative: { line1: string };
    value: { amount: number; currency: string };
    paymentInstrument: { type: "card/token"; href: string };
    customerAgreement?: {
      type: string;
      storedCardUsage: string;
    };
  };
  channel: string;
  authentication?: {
    threeDS: ThreeDSInjection;
  };
  riskProfile?: string;
}

export interface CITAuthorizeResponse {
  outcome: "authorized" | "refused" | "sentForSettlement";
  paymentId?: string;
  issuer?: { authorizationCode: string };
  scheme?: { reference: string };
  refusalCode?: string;
  refusalDescription?: string;
  _links?: Record<string, { href: string }>;
}

// ── Worldpay client interface ─────────────────────────────

export interface IWorldpayClient {
  threeDSInit(params: DdcInitRequest): Promise<DdcInitResponse>;
  threeDSAuthenticate(
    params: ThreeDSAuthenticateRequest
  ): Promise<ThreeDSAuthenticateResponse>;
  threeDSVerify(params: ThreeDSVerifyRequest): Promise<ThreeDSVerifyResponse>;
  citAuthorize(params: CITAuthorizeRequest): Promise<CITAuthorizeResponse>;
}
export { WorldpayClient } from "./client"
