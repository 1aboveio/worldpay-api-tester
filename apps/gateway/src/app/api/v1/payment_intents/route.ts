import { NextRequest } from "next/server"
import {
  handleCreatePaymentIntent,
  handleListPaymentIntents,
  type PaymentIntentServiceDeps,
} from "@/lib/payment-intent-service"

// These are the real production dependencies.
// Tests override them via module mocking or dependency injection.
const defaultDeps: PaymentIntentServiceDeps = {
  wpCall: async () => {
    throw new Error("wpCall not configured")
  },
  createToken: async () => {
    throw new Error("createToken not configured")
  },
  resolveMerchant: async (apiKey: string) => {
    // In production, this would look up the API key in the database.
    // For now, this is a placeholder — real auth will be wired in from #1.
    throw new Error("resolveMerchant not configured")
  },
}

// Allow tests to override deps
let overrides: Partial<PaymentIntentServiceDeps> | null = null

export function __setDeps(deps: Partial<PaymentIntentServiceDeps>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

function getDeps(): PaymentIntentServiceDeps {
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
  return handleListPaymentIntents(query, apiKey, getDeps())
}

export async function POST(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const body = await request.json().catch(() => null)
  return handleCreatePaymentIntent(body, apiKey, getDeps())
}
