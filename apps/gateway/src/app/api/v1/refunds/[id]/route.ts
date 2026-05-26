import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, resolveMerchantFromApiKey } from "@/lib/auth"
import { database } from "@repo/database"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"))
    if (!token) return NextResponse.json({ error: { code: "invalid_api_key", message: "Missing API key" } }, { status: 401 })

    const auth = await resolveMerchantFromApiKey(token)
    if (!auth) return NextResponse.json({ error: { code: "invalid_api_key", message: "Invalid API key" } }, { status: 401 })

    const { id } = await params
    const refunds = await (database as any).refund?.findMany?.({ where: { id } }) ?? []
    const refund = refunds[0]
    if (!refund || refund.merchantId !== auth.merchantId) {
      return NextResponse.json({ error: { code: "not_found", message: "Refund not found" } }, { status: 404 })
    }

    return NextResponse.json({
      id: refund.id, object: "refund", payment_intent: refund.paymentIntentId,
      amount: refund.amount, currency: refund.currency, status: refund.status,
      reason: refund.reason, created: refund.createdAt,
    })
  } catch {
    return NextResponse.json({ error: { code: "internal_error", message: "Internal error" } }, { status: 500 })
  }
}
