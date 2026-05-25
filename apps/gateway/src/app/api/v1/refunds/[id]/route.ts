import { NextRequest } from "next/server"
import { handleGetRefund } from "@/lib/refund-service"
import type { RefundServiceDeps } from "@/lib/refund-service"

let overrides: Partial<Pick<RefundServiceDeps, "resolveMerchant">> | null = null

export function __setDeps(deps: Partial<Pick<RefundServiceDeps, "resolveMerchant">>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

function getDeps(): Pick<RefundServiceDeps, "resolveMerchant"> {
  return {
    resolveMerchant: overrides?.resolveMerchant ?? (async () => {
      throw new Error("resolveMerchant not configured")
    }),
  }
}

function extractApiKey(request: NextRequest): string {
  const auth = request.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return ""
  return auth.slice(7)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const apiKey = extractApiKey(request)
  return handleGetRefund(id, apiKey, getDeps())
}
