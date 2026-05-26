import { NextRequest } from "next/server"
import { handleGetPaymentIntent } from "@/lib/payment-intent-service"
import type { PaymentIntentServiceDeps } from "@/lib/payment-intent-service"
import { resolveMerchantFromApiKey } from "@/lib/auth"

let overrides: Partial<Pick<PaymentIntentServiceDeps, "resolveMerchant">> | null = null

export function __setDeps(deps: Partial<Pick<PaymentIntentServiceDeps, "resolveMerchant">>) {
  overrides = deps
}

export function __resetDeps() {
  overrides = null
}

const defaultResolveMerchant = async (apiKey: string) => {
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
}

function getDeps(): Pick<PaymentIntentServiceDeps, "resolveMerchant"> {
  return {
    resolveMerchant: overrides?.resolveMerchant ?? defaultResolveMerchant,
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
  return handleGetPaymentIntent(id, apiKey, getDeps())
}
