import type {
  IWorldpayClient,
  DdcInitResponse,
} from "@payfac/worldpay-client";
import prisma from "../client";

export interface DdcInitParams {
  worldpayClient: IWorldpayClient;
  worldpayEntity: string;
  tokenHref: string;
  paymentIntentId: string;
}

export async function initDDC(
  params: DdcInitParams
): Promise<DdcInitResponse> {
  const { worldpayClient, worldpayEntity, tokenHref, paymentIntentId } = params;

  const response = await worldpayClient.threeDSInit({
    transactionReference: `ddc-${paymentIntentId}`,
    merchant: { entity: worldpayEntity },
    paymentInstrument: { type: "card/tokenized", href: tokenHref },
  });

  // Store DDC session
  await prisma.threeDSSession.create({
    data: {
      paymentIntentId,
      ddcJwt: response.deviceDataCollection.jwt,
      ddcUrl: response.deviceDataCollection.url,
      status: "initialized",
    },
  });

  return response;
}
