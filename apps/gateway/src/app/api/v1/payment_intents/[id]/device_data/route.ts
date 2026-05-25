import { NextRequest, NextResponse } from "next/server";
import { deviceDataSubmitSchema } from "@payfac/validators";
import {
  runThreeDSFlow,
  authorizeWithThreeDS,
} from "@payfac/gateway-core";
import { findPaymentIntentWithMerchant, updatePaymentIntentStatus } from "@payfac/dal";
import { getWorldpayClient } from "@/lib/worldpay";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentIntentId } = await params;
    const body = await request.json();

    // Validate
    const parsed = deviceDataSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { collection_reference } = parsed.data;

    // Look up PaymentIntent
    const pi = await findPaymentIntentWithMerchant(paymentIntentId);
    if (!pi) {
      return NextResponse.json(
        { error: { code: "not_found", message: "PaymentIntent not found" } },
        { status: 404 }
      );
    }

    if (pi.status !== "requires_device_data" && pi.status !== "processing") {
      return NextResponse.json(
        {
          error: {
            code: "status_invalid",
            message: `Cannot submit device data for payment in status: ${pi.status}`,
          },
        },
        { status: 400 }
      );
    }

    const wpClient = getWorldpayClient();

    // Run 3DS flow starting from authenticate (DDC already done)
    const threeDSResult = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId,
      worldpayEntity: pi.merchant.worldpayEntity,
      tokenHref: pi.tokenHref ?? `https://try.access.worldpay.com/tokens/placeholder`,
      amount: pi.amount,
      currency: pi.currency,
      collectionReference: collection_reference,
      merchantReturnUrl: pi.merchantReturnUrl ?? undefined,
      challengePreference: pi.challengePreference ?? undefined,
      gatewayBaseUrl: process.env.GATEWAY_BASE_URL ?? "https://gateway.payfac.com",
    });

    switch (threeDSResult.type) {
      case "requires_action": {
        await updatePaymentIntentStatus(paymentIntentId, "requires_action");
        return NextResponse.json(
          {
            id: paymentIntentId,
            status: "requires_action",
            next_action: {
              type: "three_d_secure_challenge",
              three_d_secure_challenge: {
                challenge_url: threeDSResult.challengeUrl,
                challenge_jwt: threeDSResult.challengeJwt,
                challenge_payload: threeDSResult.challengePayload,
                session_id: threeDSResult.sessionId,
              },
            },
          },
          { status: 200 }
        );
      }

      case "payment_failed": {
        await updatePaymentIntentStatus(paymentIntentId, "payment_failed", {
          failureCode: threeDSResult.failureCode,
        });
        return NextResponse.json(
          {
            id: paymentIntentId,
            object: "payment_intent",
            amount: pi.amount,
            currency: pi.currency,
            status: "payment_failed",
            failure_code: threeDSResult.failureCode,
            created: pi.createdAt.toISOString(),
          },
          { status: 200 }
        );
      }

      case "continue_to_authorize": {
        const authResult = await authorizeWithThreeDS({
          worldpayClient: wpClient,
          paymentIntentId,
          worldpayEntity: pi.merchant.worldpayEntity,
          tokenHref: pi.tokenHref ?? `https://try.access.worldpay.com/tokens/placeholder`,
          amount: pi.amount,
          currency: pi.currency,
          threeDS: threeDSResult.threeDS,
          threeDSStatus: threeDSResult.threeDSStatus,
          payfacSchemeId: pi.merchant.payfacSchemeId ?? undefined,
          subMerchantRef: pi.merchant.subMerchantRef ?? undefined,
          subMerchantName: pi.merchant.subMerchantName ?? undefined,
          subMerchantStreet: pi.merchant.subMerchantStreet ?? undefined,
          subMerchantPostal: pi.merchant.subMerchantPostal ?? undefined,
          subMerchantCity: pi.merchant.subMerchantCity ?? undefined,
          subMerchantCountry: pi.merchant.subMerchantCountry ?? undefined,
          statementDescriptor: pi.statementDescriptor ?? pi.description ?? undefined,
          captureMethod: pi.captureMethod,
          setupFutureUsage: pi.setupFutureUsage ?? undefined,
          riskProfileHref: pi.riskProfileHref ?? undefined,
        });

        return NextResponse.json(
          {
            id: paymentIntentId,
            object: "payment_intent",
            amount: pi.amount,
            currency: pi.currency,
            status: authResult.status,
            capture_method: pi.captureMethod,
            three_d_secure: {
              status: threeDSResult.threeDSStatus,
            },
            ...(authResult.status === "payment_failed" && {
              failure_code: authResult.details.failureCode,
              failure_message: authResult.details.failureMessage,
            }),
            created: pi.createdAt.toISOString(),
          },
          { status: 200 }
        );
      }

      // device_data endpoint should not get requires_device_data (we just submitted it)
      case "requires_device_data":
        return NextResponse.json(
          {
            id: paymentIntentId,
            status: "requires_device_data",
            next_action: {
              type: "device_data_collection",
              device_data_collection: {
                ddc_url: threeDSResult.ddcUrl,
                ddc_jwt: threeDSResult.ddcJwt,
              },
            },
          },
          { status: 200 }
        );

      default:
        return NextResponse.json(
          { error: { code: "internal_error", message: "Unknown 3DS result" } },
          { status: 500 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 }
    );
  }
}
