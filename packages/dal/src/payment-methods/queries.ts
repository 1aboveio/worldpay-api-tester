import "server-only";
import { database } from "@repo/database";

export async function getPaymentMethodById(id: string) {
  return database.paymentMethod.findUnique({
    where: { id },
  });
}

/**
 * Returns the token href for internal use only.
 * The caller is responsible for decrypting the returned value.
 * Never expose this to API responses.
 */
export async function getTokenHref(id: string): Promise<string | null> {
  const pm = await database.paymentMethod.findUnique({
    where: { id },
    select: { worldpayTokenHref: true },
  });
  return pm?.worldpayTokenHref ?? null;
}
