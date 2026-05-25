import { NextRequest } from "next/server"
import {
  handleCreateRefund,
  type RefundServiceDeps,
} from "@/lib/refund-service"

// These are the real production dependencies.
// Tests override them via module mocking or dependency injection.
const defaultDeps: RefundServiceDeps = {
  wpCall: async () => {
    throw new Error("wpCall not configured")
  },
  resolveMerchant: async (apiKey: string) => {
    // In production, this would look up the API key in the database.
    // For now, this is a placeholder — real auth will be wired in from #1.
    throw new Error("resolveMerchant not configured")
  },
}

// Allow tests to override deps
let overrides: Partial<RefundServiceDeps> | null = null

export function __setDeps(deps: Partial<RefundServiceDeps>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

function getDeps(): RefundServiceDeps {
  return { ...defaultDeps, ...overrides }
}

function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function POST(request: NextRequest) {
  const apiKey = extractApiKey(request)
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? null
  const body = await request.json().catch(() => null)
  return handleCreateRefund(body, apiKey, idempotencyKey, getDeps())
}
