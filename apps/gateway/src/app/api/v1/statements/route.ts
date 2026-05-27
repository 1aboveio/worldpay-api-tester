import { NextRequest } from "next/server"
import { handleGetStatements, type StatementsServiceDeps } from "@/lib/statements-service"
import type { WpCallFn, ResolveMerchantFn } from "@/lib/worldpay-types"
import { resolveMerchantFromApiKey } from "@/lib/auth"
import { worldpayRequest } from "@/lib/worldpay-client"

const defaultDeps: StatementsServiceDeps = {
  wpCall: (async (path: string, mediaType: string, options?: any) => {
    return worldpayRequest(path, { method: "GET", mediaType, ...options } as any)
  }) as any,
  resolveMerchant: async (apiKey: string) => {
    const record = await resolveMerchantFromApiKey(apiKey)
    if (!record) throw new Error("Invalid API key")
    return {
      merchantId: record.merchantId,
      entity: record.merchant.worldpayEntity,
      payFacConfig: { schemeId: record.merchant.payfacSchemeId ?? "", subMerchant: record.merchant.subMerchantRef as any ?? {} },
    } as any
  },
}

let overrides: Partial<StatementsServiceDeps> | null = null

export function __setDeps(deps: Partial<StatementsServiceDeps>) { overrides = deps }
export function __resetDeps() { overrides = null }
function getDeps(): StatementsServiceDeps { return { ...defaultDeps, ...overrides } }
function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function GET(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const url = new URL(request.url)
  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => { query[key] = value })
  return handleGetStatements(query, apiKey, getDeps())
}
