import { createHash } from "crypto"
import { getApiKeyByHash } from "@repo/dal"
import type { ApiKeyDTO } from "@repo/dal"

/**
 * Hash an API key prefix (e.g. "sk_test_" or "sk_live_") with SHA-256
 * for constant-time lookup in the ApiKey table.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

/**
 * Extract the bearer token from an Authorization header.
 * Returns null if missing or malformed.
 */
export function extractBearerToken(
  authorizationHeader: string | null
): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) return null
  return match[1].trim()
}

export interface ResolvedApiKey extends ApiKeyDTO {
  merchant: {
    id: string
    name: string
    worldpayEntity: string
    status: string
  }
}

/**
 * Resolve merchant from API key bearer token.
 * Returns the resolved API key record with merchant or null.
 */
export async function resolveMerchantFromApiKey(
  rawTokenOrHeader: string | null
): Promise<ResolvedApiKey | null> {
  // Accept either a raw token or a full Authorization header
  const token = rawTokenOrHeader?.startsWith("Bearer ")
    ? extractBearerToken(rawTokenOrHeader)
    : rawTokenOrHeader
  if (!token) return null

  const keyHash = hashApiKey(token)
  const apiKey = await getApiKeyByHash(keyHash)
  if (!apiKey) return null
  if (apiKey.merchant.status !== "active") return null

  return apiKey as ResolvedApiKey
}
