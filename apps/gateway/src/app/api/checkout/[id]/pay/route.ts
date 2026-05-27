import { NextRequest } from "next/server"
import { handleCreatePaymentIntent, type PaymentIntentServiceDeps } from "@/lib/payment-intent-service"
import { worldpayRequest, resolveMediaType, createCardToken } from "@/lib/worldpay-client"
import { database } from "@repo/database"
import {
  getCheckoutSessionById,
  markCheckoutSessionProcessing,
  completeCheckoutSession,
  reopenCheckoutSession,
} from "@repo/dal"

/**
 * Public pay endpoint for a hosted checkout. NO API key — authorized solely by
 * possession of the unguessable checkout-session id. All financial details
 * (amount, currency, capture method, merchant) are read from the session row;
 * the request body carries only the card the shopper entered.
 *
 * The card is tokenized server-side via the existing card/plain Tokens flow,
 * then runs the same FraudSight -> CIT authorize path as the JSON API.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const card = {
    number: typeof raw?.number === "string" ? raw.number.replace(/\s+/g, "") : "",
    expiry_month: Number(raw?.expiry_month),
    expiry_year: Number(raw?.expiry_year),
    cvc: typeof raw?.cvc === "string" ? raw.cvc : "",
    cardholder_name: typeof raw?.cardholder_name === "string" ? raw.cardholder_name : undefined,
  }
  if (!card.number || !card.cvc || !card.expiry_month || !card.expiry_year) {
    return Response.json(
      { error: { code: "validation_error", message: "Card details are incomplete" } },
      { status: 400 },
    )
  }

  // Load + validate the checkout session
  const cs = await getCheckoutSessionById(id)
  if (!cs) {
    return Response.json({ error: { code: "not_found", message: "Checkout not found" } }, { status: 404 })
  }
  if (cs.status !== "open") {
    return Response.json(
      { error: { code: "checkout_unavailable", message: `Checkout is ${cs.status}` } },
      { status: 409 },
    )
  }
  if (cs.expiresAt.getTime() <= Date.now()) {
    return Response.json(
      { error: { code: "checkout_expired", message: "This checkout link has expired" } },
      { status: 410 },
    )
  }

  // Atomic single-use guard: only one concurrent request can claim "open".
  const claimed = await markCheckoutSessionProcessing(id)
  if (!claimed) {
    return Response.json(
      { error: { code: "checkout_unavailable", message: "Checkout is already being processed" } },
      { status: 409 },
    )
  }

  // Resolve the merchant from the session (never the client). Use the real
  // schema fields (entity / payFacConfig) exposed by @repo/database.
  const merchant = await database.merchant.findUnique({ where: { id: cs.merchantId } })
  if (!merchant) {
    await reopenCheckoutSession(id)
    return Response.json({ error: { code: "not_found", message: "Merchant not found" } }, { status: 404 })
  }

  const deps: PaymentIntentServiceDeps = {
    wpCall: (async (path: string, mediaType: string, options?: { body?: unknown }) => {
      return worldpayRequest(path, {
        method: options?.body ? "POST" : "GET",
        mediaType: resolveMediaType(mediaType),
        body: options?.body,
      } as never)
    }) as PaymentIntentServiceDeps["wpCall"],
    createToken: async (cardDetails, entity) => {
      const { tokenHref, brand, last4 } = await createCardToken(cardDetails, entity)
      return { tokenHref, brand, last4, expiryMonth: cardDetails.expiryMonth, expiryYear: cardDetails.expiryYear }
    },
    resolveMerchant: async () => ({
      merchantId: merchant.id,
      entity: merchant.entity,
      payFacConfig: (merchant.payFacConfig ?? {
        schemeId: "",
        subMerchant: { reference: "", name: "", address: {} },
      }) as Awaited<ReturnType<PaymentIntentServiceDeps["resolveMerchant"]>>["payFacConfig"],
    }),
  }

  const piBody = {
    amount: cs.amount,
    currency: cs.currency,
    payment_method: {
      type: "card" as const,
      card: {
        number: card.number,
        expiry_month: card.expiry_month,
        expiry_year: card.expiry_year,
        cvc: card.cvc,
        ...(card.cardholder_name ? { cardholder_name: card.cardholder_name } : {}),
      },
    },
    capture_method: cs.captureMethod,
  }

  // apiKey is "" — only deps.resolveMerchant consumes it, and ours ignores it.
  const res = await handleCreatePaymentIntent(piBody, "", deps)
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string }

  // A successful authorization (including manual-capture "requires_capture")
  // completes the session; anything else releases it so the shopper can retry.
  if (data.status === "succeeded" || data.status === "requires_capture") {
    await completeCheckoutSession(id, data.id ?? "")
  } else {
    await reopenCheckoutSession(id)
  }

  return Response.json(data, { status: res.status })
}
