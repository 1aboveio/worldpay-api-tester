import { NextRequest, NextResponse } from "next/server";
import { createPaymentIntentSchema } from "@payfac/validators";
import { runThreeDSFlow, authorizeWithThreeDS } from "@payfac/gateway-core";
import { updatePaymentIntentStatus, storePaymentResult } from "@payfac/dal";
import { prisma } from "@payfac/dal";
import type { IWorldpayClient } from "@payfac/worldpay-client";

// In production, this would be the real Worldpay client.
// In tests, it's mocked via dependency injection.
import { getWorldpayClient } from "@/lib/worldpay";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate
    const parsed = createPaymentIntentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Authenticate merchant via API key
    const authHeader = request.headers.get("authorization") ?? "";
    const apiKey = authHeader.replace("Bearer ", "");
    const merchant = await prisma.merchant.findUnique({
      where: { apiKey },
    });

    if (!merchant) {
      return NextResponse.json(
        { error: { code: "invalid_api_key", message: "Invalid API key" } },
        { status: 401 }
      );
    }

    // Create PaymentIntent record
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        merchantId: merchant.id,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        status: "processing",
        captureMethod: input.capture_method,
        description: input.description,
        statementDescriptor: input.statement_descriptor,
        setupFutureUsage: input.setup_future_usage,
        confirm: input.confirm,
        challengePreference: input.three_d_secure.challenge_preference,
      },
    });

    const wpClient = getWorldpayClient();

    // Determine 3DS enablement
    const threeDSEnabled = input.three_d_secure.enabled !== false;

    if (!threeDSEnabled) {
      // 3DS disabled: skip straight to authorize
      const result = await authorizeWithThreeDS({
        worldpayClient: wpClient,
        paymentIntentId: paymentIntent.id,
        worldpayEntity: merchant.worldpayEntity,
        tokenHref: `https://try.access.worldpay.com/tokens/placeholder`, // would come from tokenize step in real flow
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        threeDSStatus: "authenticated", // not_requested in real flow
        payfacSchemeId: merchant.payfacSchemeId ?? undefined,
        subMerchantRef: merchant.subMerchantRef ?? undefined,
        subMerchantName: merchant.subMerchantName ?? undefined,
        subMerchantStreet: merchant.subMerchantStreet ?? undefined,
        subMerchantPostal: merchant.subMerchantPostal ?? undefined,
        subMerchantCity: merchant.subMerchantCity ?? undefined,
        subMerchantCountry: merchant.subMerchantCountry ?? undefined,
        statementDescriptor: input.statement_descriptor ?? input.description,
        captureMethod: input.capture_method,
        setupFutureUsage: input.setup_future_usage,
      });

      // Override threeDS status for disabled path
      await updatePaymentIntentStatus(paymentIntent.id, result.status, {
        threeDSStatus: "not_requested",
      });

      return NextResponse.json(
        {
          id: paymentIntent.id,
          object: "payment_intent",
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          status: result.status,
          capture_method: input.capture_method,
          three_d_secure: { status: "not_requested" },
          ...(result.status === "payment_failed" && {
            failure_code: result.details.failureCode,
            failure_message: result.details.failureMessage,
          }),
          created: paymentIntent.createdAt.toISOString(),
        },
        { status: 200 }
      );
    }

    // 3DS enabled: run the full 3DS flow
    const threeDSResult = await runThreeDSFlow({
      worldpayClient: wpClient,
      paymentIntentId: paymentIntent.id,
      worldpayEntity: merchant.worldpayEntity,
      tokenHref: `https://try.access.worldpay.com/tokens/placeholder`,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      collectionReference: input.device_data?.collection_reference,
      acceptHeader: input.device_data?.accept_header,
      userAgentHeader: input.device_data?.user_agent,
      merchantReturnUrl: input.three_d_secure.return_url,
      challengePreference: input.three_d_secure.challenge_preference,
      gatewayBaseUrl: process.env.GATEWAY_BASE_URL ?? "https://gateway.payfac.com",
    });

    switch (threeDSResult.type) {
      case "requires_device_data": {
        await updatePaymentIntentStatus(paymentIntent.id, "requires_device_data");
        return NextResponse.json(
          {
            id: paymentIntent.id,
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
      }

      case "requires_action": {
        await updatePaymentIntentStatus(paymentIntent.id, "requires_action");
        return NextResponse.json(
          {
            id: paymentIntent.id,
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
        await updatePaymentIntentStatus(paymentIntent.id, "payment_failed", {
          failureCode: threeDSResult.failureCode,
        });
        return NextResponse.json(
          {
            id: paymentIntent.id,
            object: "payment_intent",
            amount: input.amount,
            currency: input.currency.toUpperCase(),
            status: "payment_failed",
            failure_code: threeDSResult.failureCode,
            created: paymentIntent.createdAt.toISOString(),
          },
          { status: 200 }
        );
      }

      case "continue_to_authorize": {
        // Continue to CIT authorize with 3DS result
        const authResult = await authorizeWithThreeDS({
          worldpayClient: wpClient,
          paymentIntentId: paymentIntent.id,
          worldpayEntity: merchant.worldpayEntity,
          tokenHref: `https://try.access.worldpay.com/tokens/placeholder`,
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          threeDS: threeDSResult.threeDS,
          threeDSStatus: threeDSResult.threeDSStatus,
          payfacSchemeId: merchant.payfacSchemeId ?? undefined,
          subMerchantRef: merchant.subMerchantRef ?? undefined,
          subMerchantName: merchant.subMerchantName ?? undefined,
          subMerchantStreet: merchant.subMerchantStreet ?? undefined,
          subMerchantPostal: merchant.subMerchantPostal ?? undefined,
          subMerchantCity: merchant.subMerchantCity ?? undefined,
          subMerchantCountry: merchant.subMerchantCountry ?? undefined,
          statementDescriptor: input.statement_descriptor ?? input.description,
          captureMethod: input.capture_method,
          setupFutureUsage: input.setup_future_usage,
        });

        return NextResponse.json(
          {
            id: paymentIntent.id,
            object: "payment_intent",
            amount: input.amount,
            currency: input.currency.toUpperCase(),
            status: authResult.status,
            capture_method: input.capture_method,
            three_d_secure: {
              status: threeDSResult.threeDSStatus,
            },
            ...(authResult.status === "payment_failed" && {
              failure_code: authResult.details.failureCode,
              failure_message: authResult.details.failureMessage,
            }),
            created: paymentIntent.createdAt.toISOString(),
          },
          { status: 200 }
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 }
    );
  }
}
