import type {
  IWorldpayClient,
  ThreeDSAuthenticateResponse,
} from "@payfac/worldpay-client";
import prisma from "../client";

export interface Authenticate3DSParams {
  worldpayClient: IWorldpayClient;
  worldpayEntity: string;
  tokenHref: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  collectionReference: string;
  acceptHeader?: string;
  userAgentHeader?: string;
  challengeReturnUrl: string;
  challengePreference?: string;
}

export async function authenticate3DS(
  params: Authenticate3DSParams
): Promise<ThreeDSAuthenticateResponse> {
  const {
    worldpayClient,
    worldpayEntity,
    tokenHref,
    paymentIntentId,
    amount,
    currency,
    collectionReference,
    acceptHeader = "*/*",
    userAgentHeader = "",
    challengeReturnUrl,
    challengePreference,
  } = params;

  const response = await worldpayClient.threeDSAuthenticate({
    transactionReference: `3ds-auth-${paymentIntentId}`,
    merchant: { entity: worldpayEntity },
    instruction: {
      value: { amount, currency },
      paymentInstrument: { type: "card/tokenized", href: tokenHref },
    },
    deviceData: {
      acceptHeader,
      userAgentHeader,
      collectionReference,
    },
    challenge: {
      returnUrl: challengeReturnUrl,
      ...(challengePreference && { preference: challengePreference }),
    },
  });

  // Update ThreeDSSession based on outcome
  await prisma.threeDSSession.updateMany({
    where: { paymentIntentId },
    data: {
      collectionReference,
      status: response.outcome,
      ...(response.outcome === "challenged" && {
        challengeReference: response.challenge.reference,
      }),
    },
  });

  return response;
}
