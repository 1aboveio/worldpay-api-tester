import { NextRequest } from "next/server"
import {
  handleCreatePaymentIntent,
  handleListPaymentIntents,
  type PaymentIntentServiceDeps,
} from "@/lib/payment-intent-service"
import { resolveMerchantFromApiKey } from "@/lib/auth"
import { worldpayRequest, resolveMediaType, createCardToken } from "@/lib/worldpay-client"

const defaultDeps: PaymentIntentServiceDeps = {
  wpCall: (async (path: string, mediaType: string, options?: { body?: unknown }) => {
    return worldpayRequest(path, {
      method: options?.body ? "POST" : "GET",
      mediaType: resolveMediaType(mediaType),
      body: options?.body,
    } as any)
  }) as any,
  createToken: async (card: any, entity: string) => {
    const { tokenHref, brand, last4 } = await createCardToken(card, entity)
    return { tokenHref, brand, last4, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear }
  },
  resolveMerchant: async (apiKey: string) => {
    const record = await resolveMerchantFromApiKey(apiKey)
    if (!record) throw new Error("Invalid API key")
    return {
      merchantId: record.merchantId,
      entity: record.merchant.worldpayEntity,
      payFacConfig: {
        schemeId: record.merchant.payfacSchemeId ?? "",
        subMerchant: record.merchant.subMerchantRef as any ?? {},
      },
    }
  },
}

let overrides: Partial<PaymentIntentServiceDeps> | null = null

export function __setDeps(deps: Partial<PaymentIntentServiceDeps>) { overrides = deps }
export function __resetDeps() { overrides = null }
function getDeps(): PaymentIntentServiceDeps { return { ...defaultDeps, ...overrides } }
function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function POST(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const body = await request.json().catch(() => null)
  return handleCreatePaymentIntent(body, apiKey, getDeps())
}

export async function GET(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const url = new URL(request.url)
  const query: Record<string, unknown> = {}
  const limit = url.searchParams.get("limit")
  const createdSince = url.searchParams.get("created_since")
  if (limit) query.limit = Number(limit)
  if (createdSince) query.created_since = createdSince
  return handleListPaymentIntents(query, apiKey, getDeps())
}
