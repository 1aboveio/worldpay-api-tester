import { database } from "@repo/database";

export class ThreeDSSessionManager {
  /** Create or find an existing session for a payment intent */
  static async getOrCreate(
    paymentIntentId: string,
    data?: {
      ddcJwt?: string;
      ddcUrl?: string;
      collectionReference?: string;
      merchantReturnUrl?: string;
    }
  ) {
    const existing = await (database as any).threeDSSession.findFirst({
      where: { paymentIntentId },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      // Update if new data is provided
      if (data) {
        return (database as any).threeDSSession.update({
          where: { id: existing.id },
          data,
        });
      }
      return existing;
    }

    return (database as any).threeDSSession.create({
      data: {
        paymentIntentId,
        ...data,
      },
    });
  }

  /** Store collectionReference from device data submission */
  static async setCollectionReference(
    paymentIntentId: string,
    collectionReference: string
  ) {
    const session = await (database as any).threeDSSession.findFirst({
      where: { paymentIntentId },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return (database as any).threeDSSession.create({
        data: {
          paymentIntentId,
          collectionReference,
          status: "ddc_complete",
        },
      });
    }

    return (database as any).threeDSSession.update({
      where: { id: session.id },
      data: {
        collectionReference,
        status: "ddc_complete",
      },
    });
  }

  /** Store challenge details after challenged response */
  static async setChallengeReference(
    paymentIntentId: string,
    challengeReference: string,
    merchantReturnUrl?: string
  ) {
    return (database as any).threeDSSession.updateMany({
      where: { paymentIntentId },
      data: {
        challengeReference,
        merchantReturnUrl: merchantReturnUrl ?? undefined,
        status: "challenged",
      },
    });
  }

  /** Find session by ID */
  static async findById(sessionId: string) {
    return (database as any).threeDSSession.findUnique({
      where: { id: sessionId },
      include: { paymentIntent: true },
    });
  }

  /** Find session by payment intent ID */
  static async findByPaymentIntent(paymentIntentId: string) {
    return (database as any).threeDSSession.findFirst({
      where: { paymentIntentId },
      orderBy: { createdAt: "desc" },
    });
  }
}
