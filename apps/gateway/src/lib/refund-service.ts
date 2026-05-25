import { createRefundSchema, type CreateRefundInput } from "./schemas"
import type { WpCallFn, ResolveMerchantFn } from "./worldpay-types"
import {
  getPaymentIntentByIdAndMerchant,
  createRefund,
  getRefundByIdAndMerchant,
  getRefundsByPaymentIntent,
  getRefundByIdempotencyKey,
} from "@repo/dal"

function generateRfId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = "rf_"
  for (let i = 0; i < 14; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/** Extract HATEOAS link href from a linkData object. Returns null if not found. */
function getHateoasLink(linkData: Record<string, unknown> | null, rel: string): string | null {
  if (!linkData) return null
  const entry = linkData[rel]
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const href = (entry as Record<string, unknown>).href
    if (typeof href === "string") return href
  }
  return null
}

export interface RefundServiceDeps {
  wpCall: WpCallFn
  resolveMerchant: ResolveMerchantFn
}

export async function handleCreateRefund(
  body: unknown,
  apiKey: string,
  idempotencyKey: string | null,
  deps: RefundServiceDeps,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "authentication_error", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Idempotency check — if key provided and we already have a refund for it, return it
  if (idempotencyKey) {
    const existing = await getRefundByIdempotencyKey(idempotencyKey, merchant.merchantId)
    if (existing) {
      return Response.json(
        {
          id: existing.id,
          status: existing.status,
        },
        { status: 200 },
      )
    }
  }

  // 3. Validate input
  const parsed = createRefundSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: firstIssue?.message ?? "Invalid input",
          path: firstIssue?.path?.join("."),
        },
      },
      { status: 400 },
    )
  }

  const input = parsed.data as CreateRefundInput

  // 4. Lookup PaymentIntent
  const pi = await getPaymentIntentByIdAndMerchant(input.payment_intent, merchant.merchantId)
  if (!pi) {
    return Response.json(
      { error: { code: "payment_intent_not_found", message: "Payment intent not found" } },
      { status: 404 },
    )
  }

  // 5. Check PI status is succeeded
  if (pi.status !== "succeeded") {
    return Response.json(
      { error: { code: "status_invalid", message: "Payment intent is not in succeeded state" } },
      { status: 400 },
    )
  }

  const originalAmount = pi.amount as number
  const currency = pi.currency as string
  const linkData = pi.linkData as Record<string, unknown> | null

  // 6. Calculate cumulative refunded amount
  const existingRefunds = await getRefundsByPaymentIntent(input.payment_intent)
  const totalRefunded = existingRefunds.reduce((sum: number, r: Record<string, unknown>) => {
    return sum + (r.amount as number)
  }, 0)

  // 7. Determine refund amount
  let refundAmount: number
  if (input.amount !== undefined) {
    refundAmount = input.amount
  } else {
    // No amount specified → refund the remaining capturable amount
    refundAmount = originalAmount - totalRefunded
  }

  // 8. Validate amount constraints
  if (totalRefunded + refundAmount > originalAmount) {
    return Response.json(
      { error: { code: "refund_exceeds_balance", message: "Refund amount exceeds available balance" } },
      { status: 400 },
    )
  }

  // Check if full refund already done (original amount already fully refunded)
  if (totalRefunded >= originalAmount) {
    return Response.json(
      { error: { code: "already_refunded", message: "Payment intent has already been fully refunded" } },
      { status: 400 },
    )
  }

  // 9. Determine HATEOAS link to use
  const isPartialRefund = refundAmount < originalAmount - totalRefunded || refundAmount < originalAmount
  const refundLinkRel = input.amount !== undefined && input.amount < originalAmount
    ? "cardPayments:partialRefund"
    : totalRefunded > 0
      ? "cardPayments:partialRefund"
      : "cardPayments:refund"

  const refundUrl = getHateoasLink(linkData, refundLinkRel)
  if (!refundUrl) {
    return Response.json(
      { error: { code: "refund_failed", message: "No refund HATEOAS link found on payment intent" } },
      { status: 500 },
    )
  }

  // 10. Call Worldpay refund endpoint
  const refundId = generateRfId()

  // For partial refunds, send { value: { amount, currency } } in body
  const isPartial = refundLinkRel === "cardPayments:partialRefund"
  const wpBody: Record<string, unknown> = isPartial
    ? { value: { amount: refundAmount, currency } }
    : {}

  try {
    const refundResult = await deps.wpCall(refundUrl, "payments-v7", {
      method: "POST",
      body: wpBody,
    }) as { outcome?: string; refund?: { id?: string } }

    const worldpayRefundId = refundResult?.refund?.id ?? null

    // 11. Store refund record
    await createRefund({
      id: refundId,
      merchantId: merchant.merchantId,
      paymentIntentId: input.payment_intent,
      amount: refundAmount,
      currency,
      reason: input.reason ?? null,
      status: "succeeded",
      worldpayRefundId,
      idempotencyKey,
    })

    return Response.json(
      {
        id: refundId,
        status: "succeeded",
      },
      { status: 200 },
    )
  } catch {
    return Response.json(
      { error: { code: "refund_failed", message: "Refund request to Worldpay failed" } },
      { status: 500 },
    )
  }
}

export async function handleGetRefund(
  refundId: string,
  apiKey: string,
  deps: Pick<RefundServiceDeps, "resolveMerchant">,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "authentication_error", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Lookup refund
  const refund = await getRefundByIdAndMerchant(refundId, merchant.merchantId)
  if (!refund) {
    return Response.json(
      { error: { code: "not_found", message: "Refund not found" } },
      { status: 404 },
    )
  }

  return Response.json(
    {
      id: refund.id,
      payment_intent: refund.paymentIntentId,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      created: refund.createdAt instanceof Date ? refund.createdAt.toISOString() : new Date().toISOString(),
    },
    { status: 200 },
  )
}
