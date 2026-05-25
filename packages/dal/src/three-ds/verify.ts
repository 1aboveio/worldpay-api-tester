import type {
  IWorldpayClient,
  ThreeDSVerifyResponse,
  ThreeDSInjection,
} from "@payfac/worldpay-client";
import prisma from "../client.js";

export interface Verify3DSParams {
  worldpayClient: IWorldpayClient;
  worldpayEntity: string;
  sessionId: string;
}

export interface Verify3DSResult {
  outcome: "authenticated" | "failed";
  threeDS?: ThreeDSInjection;
  error?: string;
}

export async function verify3DS(
  params: Verify3DSParams
): Promise<Verify3DSResult> {
  const { worldpayClient, worldpayEntity, sessionId } = params;

  // Look up the session to get challengeReference
  const session = await prisma.threeDSSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || !session.challengeReference) {
    return {
      outcome: "failed",
      error: "Session not found or missing challenge reference",
    };
  }

  const response: ThreeDSVerifyResponse = await worldpayClient.threeDSVerify({
    transactionReference: `verify-${sessionId}`,
    merchant: { entity: worldpayEntity },
    challenge: { reference: session.challengeReference },
  });

  // Update session status
  await prisma.threeDSSession.update({
    where: { id: sessionId },
    data: { status: response.outcome },
  });

  if (
    response.outcome === "authenticated" &&
    response.authentication
  ) {
    return {
      outcome: "authenticated",
      threeDS: {
        version: response.authentication.version,
        eci: response.authentication.eci,
        authenticationValue: response.authentication.authenticationValue,
        transactionId: response.authentication.transactionId,
      },
    };
  }

  return { outcome: "failed", error: response.error?.description };
}
