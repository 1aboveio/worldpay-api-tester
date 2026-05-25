/**
 * Authentication helpers.
 *
 * Resolves merchantId from a Bearer API key.
 * Assumes middleware or route handler verification.
 */

import { database } from "@repo/database";

export async function resolveMerchantFromApiKey(
  apiKey: string,
): Promise<{ merchantId: string } | null> {
  const keyRecord = await database.apiKey.findUnique({
    where: { key: apiKey },
    select: { merchantId: true },
  });
  return keyRecord ? { merchantId: keyRecord.merchantId } : null;
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) return null;
  const parts = authorizationHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
