import { createHash } from "crypto"

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
