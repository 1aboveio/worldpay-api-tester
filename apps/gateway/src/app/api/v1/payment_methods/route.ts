import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createPaymentMethodSchema } from "./schema";
import { extractBearerToken, resolveMerchantFromApiKey } from "@/lib/auth";
import { wpCall } from "@/lib/worldpay-client";
import { encrypt } from "@/lib/encryption";
import { generatePaymentMethodId } from "@/lib/id-generator";
import { createPaymentMethod, getPaymentMethodById, getPaymentMethodByIdempotencyKey } from "@repo/dal";

const TOKENS_MEDIA_TYPE = "application/vnd.worldpay.tokens-v3.hal+json";

function isCardExpired(year: number, month: number): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return true;
  if (year === currentYear && month < currentMonth) return true;
  return false;
}

function computeIdempotencyKey(tokenHref: string): string {
  // Hash of the plaintext token href for idempotency lookups.
  // Using SHA-256 so that we can dedup without storing the plaintext href.
  return createHash("sha256").update(tokenHref).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    // --- Auth ---
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "invalid_api_key", message: "Missing or invalid Authorization header" } },
        { status: 401 },
      );
    }

    const auth = await resolveMerchantFromApiKey(token);
    if (!auth) {
      return NextResponse.json(
        { error: { code: "invalid_api_key", message: "Invalid API key" } },
        { status: 401 },
      );
    }

    const merchantId = auth.merchantId;

    // --- Validate request body ---
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Invalid JSON body" } },
        { status: 400 },
      );
    }

    const parsed = createPaymentMethodSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: "invalid_request",
            message: firstIssue?.message ?? "Invalid request body",
          },
        },
        { status: 400 },
      );
    }

    const { card } = parsed.data;

    // --- Validate card expiry ---
    if (isCardExpired(card.expiry_year, card.expiry_month)) {
      return NextResponse.json(
        { error: { code: "card_expired", message: "The card has expired" } },
        { status: 400 },
      );
    }

    // --- Call Worldpay Tokens v3 ---
    // Card number is sent to Worldpay but NEVER logged or stored locally.
    const worldpayRequest = {
      tokenType: "card",
      paymentInstrument: {
        type: "card/plain",
        cardNumber: card.number,
        cardHolderName: card.cardholder_name ?? undefined,
        expiryDate: {
          month: card.expiry_month,
          year: card.expiry_year,
        },
        cvc: card.cvc,
      },
    };

    const wpResponse = await wpCall({
      method: "POST",
      path: "/tokens",
      mediaType: TOKENS_MEDIA_TYPE,
      body: worldpayRequest,
    });

    const wpBody = await wpResponse.json();

    // --- Handle Worldpay errors ---
    if (!wpResponse.ok) {
      const wpMessage: string = wpBody?.message ?? wpBody?.error?.message ?? "Tokenization failed";

      // Match against Worldpay error response structure (errorName / errorCode),
      // not by substring-matching the message text.
      const wpErrorName: string | undefined =
        wpBody?.errorName ?? wpBody?.error?.errorName ?? wpBody?.errorCode ?? wpBody?.error?.errorCode;

      if (wpErrorName === "cardNumberInvalid" || wpErrorName === "invalidCardNumber") {
        return NextResponse.json(
          { error: { code: "invalid_card_number", message: "The card number is invalid" } },
          { status: 400 },
        );
      }

      if (wpErrorName === "tokenExpired" || wpErrorName === "cardExpired") {
        return NextResponse.json(
          { error: { code: "card_expired", message: "The card has expired" } },
          { status: 400 },
        );
      }

      // 409: duplicate token — handle gracefully
      if (wpResponse.status === 409) {
        const existingTokenHref: string =
          wpBody?.tokenHref ?? wpBody?._links?.self?.href ?? "";
        if (existingTokenHref) {
          const ik = computeIdempotencyKey(existingTokenHref);
          const existing = await getPaymentMethodByIdempotencyKey(merchantId, ik);
          if (existing) {
            return NextResponse.json(formatPaymentMethodResponse(existing), { status: 200 });
          }
        }
      }

      return NextResponse.json(
        { error: { code: "tokenization_failed", message: wpMessage } },
        { status: 400 },
      );
    }

    // --- Successful tokenization ---
    const tokenHref: string =
      wpBody?.tokenHref ??
      wpBody?._links?.self?.href ??
      wpBody?._links?.["tokens:token"]?.href ??
      "";

    if (!tokenHref) {
            // Never log the raw Worldpay response body — it may echo card number back.
      console.error("Worldpay Tokens v3 response missing token href", {
        status: 201,
        errorType: "token_href_missing",
        responseKeys: Object.keys(wpBody ?? {}),
      });
      return NextResponse.json(
        { error: { code: "tokenization_failed", message: "Failed to extract token from Worldpay response" } },
        { status: 502 },
      );
    }

    // --- Idempotency: check if we already have a PaymentMethod for this token ---
    const idempotencyKey = computeIdempotencyKey(tokenHref);
    const existingPM = await getPaymentMethodByIdempotencyKey(merchantId, idempotencyKey);
    if (existingPM) {
      return NextResponse.json(formatPaymentMethodResponse(existingPM), { status: 200 });
    }

    // --- Extract masked card info from Worldpay response ---
    const maskedInfo = extractMaskedInfo(wpBody);

    // --- Encrypt token href for storage at rest ---
    const encryptedHref = encrypt(tokenHref);

    // --- Store PaymentMethod ---
    const pmId = generatePaymentMethodId();

    const paymentMethod = await createPaymentMethod({
      id: pmId,
      merchantId,
      idempotencyKey,
      worldpayTokenHref: encryptedHref,
      brand: maskedInfo.brand,
      last4: maskedInfo.last4,
      expiryMonth: card.expiry_month,
      expiryYear: card.expiry_year,
      funding: maskedInfo.funding,
      country: maskedInfo.country,
    });

    return NextResponse.json(formatPaymentMethodResponse(paymentMethod), { status: 201 });
  } catch (err) {
    console.error("POST /v1/payment_methods error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: { code: "internal_error", message: "An internal error occurred" } },
      { status: 500 },
    );
  }
}

// --- Helpers ---

interface MaskedCardInfo {
  brand: string;
  last4: string;
  funding: string;
  country?: string;
}

function extractMaskedInfo(wpBody: Record<string, unknown>): MaskedCardInfo {
  const pi = (wpBody.paymentInstrument ?? wpBody.card) as Record<string, unknown> | undefined;

  return {
    brand: String(pi?.brand ?? pi?.cardBrand ?? "unknown"),
    last4: String(
      pi?.maskedCardNumber?.slice(-4) ??
      pi?.last4 ??
      pi?.last4Digits ??
      "0000",
    ),
    funding: String(pi?.fundingType ?? pi?.type ?? "unknown"),
    country: pi?.issuerCountryCode
      ? String(pi.issuerCountryCode)
      : undefined,
  };
}

function formatPaymentMethodResponse(pm: {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  funding: string;
  country: string | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: pm.id,
    object: "payment_method",
    type: "card",
    card: {
      brand: pm.brand,
      last4: pm.last4,
      expiry_month: pm.expiryMonth,
      expiry_year: pm.expiryYear,
      funding: pm.funding,
      country: pm.country,
    },
    created: pm.createdAt.toISOString(),
  };
}
