import { NextRequest, NextResponse } from "next/server"
import { hashApiKey, extractBearerToken } from "./auth"
import { getApiKeyByHash } from "@repo/dal"

export interface AuthenticatedRequest extends NextRequest {
  merchant?: {
    id: string
    name: string
    worldpayEntity: string
    status: string
  }
}

export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
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

  return null
}

/**
 * Extract merchant context from the request by hashing the bearer token
 * and looking up the ApiKey. Returns null if not found.
 */
export async function resolveMerchant(
  request: NextRequest
): Promise<AuthenticatedRequest["merchant"] | null> {
  const authHeader = request.headers.get("authorization")
  const token = extractBearerToken(authHeader)
  if (!token) return null

  const keyHash = hashApiKey(token)
  const apiKeyRecord = await getApiKeyByHash(keyHash)
  if (!apiKeyRecord) return null

  return apiKeyRecord.merchant
}
