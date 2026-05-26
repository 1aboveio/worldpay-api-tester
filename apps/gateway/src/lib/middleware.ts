import { NextRequest, NextResponse } from "next/server"
import { hashApiKey, extractBearerToken } from "./auth"
import { getApiKeyByHash, type ApiKeyDTO } from "@repo/dal"

export interface AuthenticatedRequest extends NextRequest {
  merchant?: {
    id: string
    name: string
    worldpayEntity: string
    status: string
  }
}

export type ResolvedApiKey = ApiKeyDTO & {
  merchant: {
    id: string
    name: string
    worldpayEntity: string
    status: string
  }
}

/**
 * Authenticate the request by hashing the bearer token and looking up
 * the API key. Returns the resolved ApiKey record on success so the
 * caller can reuse it without a second database lookup.
 */
export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | ResolvedApiKey> {
  const authHeader = request.headers.get("authorization")
  const token = extractBearerToken(authHeader)

  if (!token) {
    return NextResponse.json(
      { error: { code: "invalid_api_key", message: "Missing API key" } },
      { status: 401 }
    )
  }

  const keyHash = hashApiKey(token)
  const apiKeyRecord = await getApiKeyByHash(keyHash)

  if (!apiKeyRecord) {
    return NextResponse.json(
      { error: { code: "invalid_api_key", message: "Invalid API key" } },
      { status: 401 }
    )
  }

  if (apiKeyRecord.merchant.status !== "active") {
    return NextResponse.json(
      { error: { code: "invalid_api_key", message: "Merchant account is not active" } },
      { status: 401 }
    )
  }

  return apiKeyRecord
}

/**
 * Extract merchant context from a pre-resolved API key record.
 * Consumer should obtain the record from authMiddleware to avoid
 * a duplicate database lookup.
 */
export function resolveMerchant(
  apiKeyRecord: ResolvedApiKey
): AuthenticatedRequest["merchant"] | null {
  if (!apiKeyRecord?.merchant) return null
  if (apiKeyRecord.merchant.status !== "active") return null
  return apiKeyRecord.merchant
}
