import { NextRequest, NextResponse } from "next/server"
import { extractBearerToken, resolveMerchantFromApiKey } from "@/lib/auth"
import { database } from "@repo/database"

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get("authorization"))
    if (!token) return NextResponse.json({ error: { code: "invalid_api_key", message: "Missing API key" } }, { status: 401 })

    const auth = await resolveMerchantFromApiKey(token)
    if (!auth) return NextResponse.json({ error: { code: "invalid_api_key", message: "Invalid API key" } }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body?.payment_intent) return NextResponse.json({ error: { code: "validation_error", message: "payment_intent is required" } }, { status: 400 })

    const pi = await database.paymentIntent.findUnique({ where: { id: body.payment_intent } })
    if (!pi || (pi as any).merchantId !== auth.merchantId) {
      return NextResponse.json({ error: { code: "payment_intent_not_found", message: "Payment intent not found" } }, { status: 404 })
    }
    if ((pi as any).status !== "succeeded" && (pi as any).status !== "requires_capture") {
      return NextResponse.json({ error: { code: "status_invalid", message: "Payment intent is not in a refundable state" } }, { status: 400 })
    }

    const refundAmount = body.amount ?? (pi as any).amount
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return NextResponse.json({ error: { code: "validation_error", message: "Invalid refund amount" } }, { status: 400 })
    }
    if (refundAmount > (pi as any).amount) {
      return NextResponse.json({ error: { code: "refund_exceeds_balance", message: "Refund exceeds captured amount" } }, { status: 400 })
    }

    // Check cumulative refunds
    const existingRefunds = await (database as any).refund?.findMany?.({ where: { paymentIntentId: body.payment_intent } }) ?? []
    const totalRefunded = existingRefunds.reduce((sum: number, r: any) => sum + r.amount, 0)
    if (totalRefunded + refundAmount > (pi as any).amount) {
      return NextResponse.json({ error: { code: "already_refunded", message: "Full amount already refunded" } }, { status: 400 })
    }

    const idempotencyKey = request.headers.get("idempotency-key")
    if (idempotencyKey) {
      const existing = existingRefunds.find((r: any) => r.idempotencyKey === idempotencyKey)
      if (existing) return NextResponse.json({ id: existing.id, payment_intent: existing.paymentIntentId, amount: existing.amount, currency: (pi as any).currency, status: existing.status }, { status: 200 })
    }

    const refundId = `rf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const reason = body.reason ?? "requested_by_customer"

    await (database as any).refund?.create?.({
      data: { id: refundId, merchantId: auth.merchantId, paymentIntentId: body.payment_intent, amount: refundAmount, currency: (pi as any).currency, reason, status: "succeeded", idempotencyKey: idempotencyKey ?? null, createdAt: new Date() },
    })

    return NextResponse.json({ id: refundId, object: "refund", payment_intent: body.payment_intent, amount: refundAmount, currency: (pi as any).currency, status: "succeeded" }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: { code: "internal_error", message: e.message } }, { status: 500 })
  }
}
