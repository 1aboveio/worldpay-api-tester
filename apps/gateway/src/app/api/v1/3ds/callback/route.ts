import { NextRequest, NextResponse } from "next/server";
import { handleChallengeCallback } from "@payfac/gateway-core";
import { findPaymentIntentWithMerchant } from "@payfac/dal";
import { getWorldpayClient } from "@/lib/worldpay";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const piId = searchParams.get("pi_id");
    const sessionId = searchParams.get("session_id");

    if (!piId || !sessionId) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_request",
            message: "Missing pi_id or session_id query params",
          },
        },
        { status: 400 }
      );
    }

    // Look up PaymentIntent
    const pi = await findPaymentIntentWithMerchant(piId);
    if (!pi) {
      return NextResponse.json(
        { error: { code: "not_found", message: "PaymentIntent not found" } },
        { status: 404 }
      );
    }

    const wpClient = getWorldpayClient();

    const result = await handleChallengeCallback({
      worldpayClient: wpClient,
      paymentIntentId: piId,
      sessionId,
      worldpayEntity: pi.merchant.worldpayEntity,
      tokenHref:
        pi.tokenHref ??
        `https://try.access.worldpay.com/tokens/placeholder`,
      amount: pi.amount,
      currency: pi.currency,
      gatewayBaseUrl: process.env.GATEWAY_BASE_URL ?? "https://gateway.payfac.com",
      payfacSchemeId: pi.merchant.payfacSchemeId ?? undefined,
      subMerchantRef: pi.merchant.subMerchantRef ?? undefined,
      subMerchantName: pi.merchant.subMerchantName ?? undefined,
      subMerchantStreet: pi.merchant.subMerchantStreet ?? undefined,
      subMerchantPostal: pi.merchant.subMerchantPostal ?? undefined,
      subMerchantCity: pi.merchant.subMerchantCity ?? undefined,
      subMerchantCountry: pi.merchant.subMerchantCountry ?? undefined,
      statementDescriptor:
        pi.statementDescriptor ?? pi.description ?? undefined,
      riskProfileHref: pi.riskProfileHref ?? undefined,
    });

    // 302 redirect to merchant return URL
    return NextResponse.redirect(result.redirectUrl, 302);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 }
    );
  }
}
