import { NextRequest } from "next/server"
import { handleGetStatements, type StatementsServiceDeps } from "@/lib/statements-service"
import type { WpCallFn, ResolveMerchantFn } from "@/lib/worldpay-types"

const defaultDeps: StatementsServiceDeps = {
  wpCall: async () => {
    throw new Error("wpCall not configured")
  },
  resolveMerchant: async () => {
    throw new Error("resolveMerchant not configured")
  },
}

let overrides: Partial<StatementsServiceDeps> | null = null

export function __setDeps(deps: Partial<StatementsServiceDeps>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

function getDeps(): StatementsServiceDeps {
  return { ...defaultDeps, ...overrides }
}

function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function GET(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const url = new URL(request.url)
  const query: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })
  return handleGetStatements(query, apiKey, getDeps())
}
