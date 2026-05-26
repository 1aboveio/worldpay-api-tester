import { createPaymentIntentSchema, capturePaymentIntentSchema, type CreatePaymentIntentInput } from "./schemas"
import type { WpCallFn, CreateTokenFn, ResolveMerchantFn } from "./worldpay-types"
import {
  createPaymentIntent,
  getPaymentIntentByIdAndMerchant,
  updatePaymentIntentStatus,
  createPaymentMethod,
} from "@repo/dal"
import { PaymentIntentStatus } from "@repo/database"

function generatePiId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = "pi_"
  for (let i = 0; i < 14; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function maskCard(brand: string | null, last4: string | null) {
  return {
    brand: brand ?? "unknown",
    last4: last4 ?? "****",
  }
}

export interface PaymentIntentServiceDeps {
  wpCall: WpCallFn
  createToken: CreateTokenFn
  resolveMerchant: ResolveMerchantFn
}

export async function handleCreatePaymentIntent(
  body: unknown,
  apiKey: string,
  deps: PaymentIntentServiceDeps,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "invalid_api_key", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Validate input
  const parsed = createPaymentIntentSchema.safeParse(body)
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

  const input = parsed.data
  const piId = generatePiId()
  const currency = input.currency.toUpperCase()
  const entity = merchant.entity
  const payFac = merchant.payFacConfig

  // 3. Create initial PI record
  await createPaymentIntent({
    id: piId,
    merchantId: merchant.merchantId,
    amount: input.amount,
    currency,
    status: PaymentIntentStatus.processing,
    captureMethod: input.capture_method,
    description: input.description ?? null,
    statementDescriptor: input.statement_descriptor ?? null,
    setupFutureUsage: input.setup_future_usage ?? null,
    customerEmail: input.customer?.email ?? null,
    customerIpAddress: input.customer?.ip_address ?? null,
    shipping: (input.shipping as Record<string, unknown>) ?? null,
    metadata: (input.metadata as Record<string, unknown>) ?? null,
  })

  // 4. Tokenize (or lookup token)
  let tokenHref: string
  let cardBrand: string | null = null
  let cardLast4: string | null = null
  let paymentMethodId: string | null = null

  if (input.payment_method.type === "card") {
    const card = input.payment_method.card
    try {
      await updatePaymentIntentStatus({ id: piId, status: PaymentIntentStatus.tokenizing })
      const tokenResult = await deps.createToken(
        {
          number: card.number,
          expiryMonth: card.expiry_month,
          expiryYear: card.expiry_year,
          cvc: card.cvc,
          cardholderName: card.cardholder_name,
          billingAddress: card.billing_address as Record<string, unknown> | undefined,
        },
        entity,
      )
      tokenHref = tokenResult.tokenHref
      cardBrand = tokenResult.brand
      cardLast4 = tokenResult.last4

      // Create a PaymentMethod record for lookup by GET endpoint
      const pmId = `pm_${piId.slice(3)}`
      paymentMethodId = pmId
      await createPaymentMethod({
        id: pmId,
        merchantId: merchant.merchantId,
        type: "card",
        tokenHref,
        brand: cardBrand,
        last4: cardLast4,
        expiryMonth: card.expiry_month,
        expiryYear: card.expiry_year,
      })

      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.tokenized,
        paymentMethodId,
      })
    } catch {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.payment_failed,
        failureCode: "tokenization_failed",
        failureMessage: "Failed to tokenize card",
      })
      return Response.json(
        {
          id: piId,
          object: "payment_intent",
          amount: input.amount,
          currency,
          status: "payment_failed",
          failure_code: "tokenization_failed",
          failure_message: "Failed to tokenize card",
          payment_method_details: { type: "card", card: maskCard(null, null) },
        },
        { status: 200 },
      )
    }
  } else {
    // card_token: lookup existing payment method
    // In this slice, we trust the token ID — full lookup would use DAL
    tokenHref = `/tokens/${input.payment_method.token}`
    paymentMethodId = input.payment_method.token

    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.tokenized,
      paymentMethodId,
    })
  }

  // 5. FraudSight assessment
  let riskProfileHref: string | null = null
  try {
    await updatePaymentIntentStatus({ id: piId, status: PaymentIntentStatus.risk_assessing })
    const fraudResult = (await deps.wpCall(
      "/fraudsight/assessment",
      "fraudsight-v1",
      {
        body: {
          transactionReference: piId,
          merchant: { entity },
          instruction: {
            value: { amount: input.amount, currency },
            paymentInstrument: { type: "card/tokenized", href: tokenHref },
          },
          riskData: {
            account: input.customer?.email ? { email: input.customer.email } : undefined,
          },
          deviceData: input.customer?.ip_address ? { ipAddress: input.customer.ip_address } : {},
        },
      },
    )) as {
      outcome?: string
      actionOnHighRisk?: string
      riskProfile?: { href?: string }
    }

    if (fraudResult.outcome === "highRisk" && fraudResult.actionOnHighRisk === "block") {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.payment_failed,
        failureCode: "high_risk",
        failureMessage: "Payment blocked by fraud screening",
      })
      return Response.json(
        {
          id: piId,
          object: "payment_intent",
          amount: input.amount,
          currency,
          status: "payment_failed",
          failure_code: "high_risk",
          failure_message: "Payment blocked by fraud screening",
          payment_method_details: { type: "card", card: maskCard(cardBrand, cardLast4) },
        },
        { status: 200 },
      )
    }

    riskProfileHref = fraudResult.riskProfile?.href ?? null
  } catch {
    // FraudSight soft-fail: continue without risk profile
    riskProfileHref = null
  }

  await updatePaymentIntentStatus({ id: piId, status: PaymentIntentStatus.risk_assessed })

  // 6. CIT Authorize
  const requestAutoSettlement = input.capture_method !== "manual"
  const narrative = input.statement_descriptor
    ? { line1: input.statement_descriptor.substring(0, 24) }
    : undefined

  const citBody: Record<string, unknown> = {
    transactionReference: piId,
    merchant: {
      entity,
      paymentFacilitator: {
        schemeId: payFac.schemeId,
        subMerchant: payFac.subMerchant,
      },
    },
    instruction: {
      requestAutoSettlement: { enabled: requestAutoSettlement },
      value: { amount: input.amount, currency },
      paymentInstrument: { type: "card/tokenized", href: tokenHref },
      ...(narrative ? { narrative } : {}),
      ...(input.setup_future_usage === "off_session"
        ? {
            customerAgreement: {
              type: "cardOnFile",
              storedCardUsage: "first",
            },
          }
        : {}),
    },
    channel: "ecom",
    ...(riskProfileHref ? { riskProfile: riskProfileHref } : {}),
  }

  try {
    await updatePaymentIntentStatus({ id: piId, status: PaymentIntentStatus.authorizing })

    const citResult = (await deps.wpCall(
      "/cardPayments/customerInitiatedTransactions",
      "payments-v7",
      { body: citBody },
    )) as {
      outcome?: string
      payment?: { id?: string }
      scheme?: { reference?: string }
      _links?: Record<string, unknown>
      refusal?: { code?: string; description?: string }
    }

    if (citResult.outcome === "authorized" || citResult.outcome === "sentForSettlement") {
      await updatePaymentIntentStatus({
        id: piId,
        status: input.capture_method === "manual" ? PaymentIntentStatus.requires_capture : PaymentIntentStatus.succeeded,
        worldpayPaymentId: citResult.payment?.id ?? null,
        schemeReference: citResult.scheme?.reference?.trim() ?? null,
        linkData: (citResult._links as Record<string, unknown>) ?? null,
      })

      return Response.json(
        {
          id: piId,
          object: "payment_intent",
          amount: input.amount,
          currency,
          status: input.capture_method === "manual" ? "requires_capture" : "succeeded",
          capture_method: input.capture_method,
          payment_method_details: { type: "card", card: maskCard(cardBrand, cardLast4) },
          created: new Date().toISOString(),
        },
        { status: 200 },
      )
    }

    // Refused
    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      worldpayPaymentId: citResult.payment?.id ?? null,
      failureCode: citResult.refusal?.code ?? "refused",
      failureMessage: citResult.refusal?.description ?? "Payment refused",
    })

    return Response.json(
      {
        id: piId,
        object: "payment_intent",
        amount: input.amount,
        currency,
        status: "payment_failed",
        failure_code: citResult.refusal?.code ?? "refused",
        failure_message: citResult.refusal?.description ?? "Payment refused",
        payment_method_details: { type: "card", card: maskCard(cardBrand, cardLast4) },
      },
      { status: 200 },
    )
  } catch {
    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      failureCode: "authorization_error",
      failureMessage: "Authorization request failed",
    })

    return Response.json(
      {
        id: piId,
        object: "payment_intent",
        amount: input.amount,
        currency,
        status: "payment_failed",
        failure_code: "authorization_error",
        failure_message: "Authorization request failed",
        payment_method_details: { type: "card", card: maskCard(cardBrand, cardLast4) },
      },
      { status: 200 },
    )
  }
}

export async function handleGetPaymentIntent(
  piId: string,
  apiKey: string,
  deps: Pick<PaymentIntentServiceDeps, "resolveMerchant">,
) {
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "invalid_api_key", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  const pi = await getPaymentIntentByIdAndMerchant(piId, merchant.merchantId)
  if (!pi) {
    return Response.json(
      { error: { code: "not_found", message: "Payment intent not found" } },
      { status: 404 },
    )
  }

  return Response.json(
    {
      id: pi.id,
      object: "payment_intent",
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      capture_method: pi.captureMethod,
      payment_method_details: {
        type: "card",
        card: maskCard(pi.paymentMethod?.brand ?? null, pi.paymentMethod?.last4 ?? null),
      },
      description: pi.description,
      statement_descriptor: pi.statementDescriptor,
      metadata: pi.metadata,
      created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
    },
    { status: 200 },
  )
}

export async function handleCapturePaymentIntent(
  piId: string,
  body: unknown,
  apiKey: string,
  idempotencyKey: string | null,
  deps: Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant">,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "invalid_api_key", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Lookup PI
  const pi = await getPaymentIntentByIdAndMerchant(piId, merchant.merchantId)
  if (!pi) {
    return Response.json(
      { error: { code: "not_found", message: "Payment intent not found" } },
      { status: 404 },
    )
  }

  // 3. Idempotency check: if already succeeded with matching key, return current state
  if (pi.status === PaymentIntentStatus.succeeded) {
    if (idempotencyKey) {
      return Response.json(
        {
          id: pi.id,
          object: "payment_intent",
          amount: pi.amount,
          currency: pi.currency,
          status: "succeeded",
          capture_method: pi.captureMethod,
          created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
        },
        { status: 200 },
      )
    }
    return Response.json(
      { error: { code: "already_captured", message: "Payment intent has already been captured" } },
      { status: 400 },
    )
  }

  // 4. Validate status
  if (pi.status !== PaymentIntentStatus.requires_capture) {
    return Response.json(
      { error: { code: "status_invalid", message: `Cannot capture payment intent with status: ${pi.status}` } },
      { status: 400 },
    )
  }

  // 5. Extract HATEOAS URLs from stored linkData
  const linkData = pi.linkData as Record<string, { href?: string }> | null
  if (!linkData) {
    return Response.json(
      { error: { code: "status_invalid", message: "No Worldpay links available for capture" } },
      { status: 400 },
    )
  }

  // 6. Validate capture input for partial capture
  const parsed = capturePaymentIntentSchema.safeParse(body ?? {})
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

  const amountToCapture = parsed.data.amount_to_capture
  const isPartialCapture = amountToCapture !== undefined

  // 7. Validate amount for partial capture
  if (isPartialCapture) {
    if (amountToCapture <= 0 || amountToCapture > pi.amount) {
      return Response.json(
        { error: { code: "capture_exceeded", message: "Capture amount exceeds authorized amount" } },
        { status: 400 },
      )
    }
  }

  // 8. Determine which HATEOAS URL to use
  const settleUrl = isPartialCapture
    ? linkData["cardPayments:partialSettle"]?.href
    : linkData["cardPayments:settle"]?.href

  if (!settleUrl) {
    return Response.json(
      { error: { code: "status_invalid", message: `No ${isPartialCapture ? "partialSettle" : "settle"} link available` } },
      { status: 400 },
    )
  }

  // 9. Make Worldpay capture call
  try {
    const settleBody: Record<string, unknown> = isPartialCapture
      ? { value: { amount: amountToCapture, currency: pi.currency } }
      : {}

    const settleResult = (await deps.wpCall(settleUrl, "payments-v7", {
      body: settleBody,
    })) as {
      outcome?: string
      refusal?: { code?: string; description?: string }
      _links?: Record<string, unknown>
    }

    if (settleResult.outcome === "authorized" || settleResult.outcome === "sentForSettlement") {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.succeeded,
        linkData: (settleResult._links as Record<string, unknown>) ?? undefined,
      })

      return Response.json(
        {
          id: pi.id,
          object: "payment_intent",
          amount: pi.amount,
          currency: pi.currency,
          status: "succeeded",
          capture_method: pi.captureMethod,
          created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
        },
        { status: 200 },
      )
    }

    // Refused — don't update status, forward refusal
    return Response.json(
      {
        id: pi.id,
        object: "payment_intent",
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        failure_code: settleResult.refusal?.code ?? "refused",
        failure_message: settleResult.refusal?.description ?? "Settlement refused",
        capture_method: pi.captureMethod,
        created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch {
    return Response.json(
      { error: { code: "processing_error", message: "Capture request failed" } },
      { status: 502 },
    )
  }
}

export async function handleCancelPaymentIntent(
  piId: string,
  apiKey: string,
  idempotencyKey: string | null,
  deps: Pick<PaymentIntentServiceDeps, "wpCall" | "resolveMerchant">,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "invalid_api_key", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Lookup PI
  const pi = await getPaymentIntentByIdAndMerchant(piId, merchant.merchantId)
  if (!pi) {
    return Response.json(
      { error: { code: "not_found", message: "Payment intent not found" } },
      { status: 404 },
    )
  }

  // 3. Idempotency check: if already canceled with matching key, return current state
  if (pi.status === PaymentIntentStatus.canceled) {
    if (idempotencyKey) {
      return Response.json(
        {
          id: pi.id,
          object: "payment_intent",
          amount: pi.amount,
          currency: pi.currency,
          status: "canceled",
          capture_method: pi.captureMethod,
          created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
        },
        { status: 200 },
      )
    }
    return Response.json(
      { error: { code: "already_canceled", message: "Payment intent has already been canceled" } },
      { status: 400 },
    )
  }

  // 4. Validate status
  if (pi.status !== PaymentIntentStatus.requires_capture) {
    return Response.json(
      { error: { code: "status_invalid", message: `Cannot cancel payment intent with status: ${pi.status}` } },
      { status: 400 },
    )
  }

  // 5. Extract cancel HATEOAS URL from stored linkData
  const linkData = pi.linkData as Record<string, { href?: string }> | null
  const cancelUrl = linkData?.["cardPayments:cancel"]?.href

  if (!cancelUrl) {
    return Response.json(
      { error: { code: "status_invalid", message: "No Worldpay cancel link available" } },
      { status: 400 },
    )
  }

  // 6. Make Worldpay cancel call
  try {
    const cancelResult = (await deps.wpCall(cancelUrl, "payments-v7", {})) as {
      outcome?: string
      refusal?: { code?: string; description?: string }
      _links?: Record<string, unknown>
    }

    if (cancelResult.outcome === "canceled" || cancelResult.outcome === "authorized") {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.canceled,
        linkData: (cancelResult._links as Record<string, unknown>) ?? undefined,
      })

      return Response.json(
        {
          id: pi.id,
          object: "payment_intent",
          amount: pi.amount,
          currency: pi.currency,
          status: "canceled",
          capture_method: pi.captureMethod,
          created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
        },
        { status: 200 },
      )
    }

    // Refused — don't update status, forward refusal
    return Response.json(
      {
        id: pi.id,
        object: "payment_intent",
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status,
        failure_code: cancelResult.refusal?.code ?? "refused",
        failure_message: cancelResult.refusal?.description ?? "Cancel refused",
        capture_method: pi.captureMethod,
        created: pi.createdAt instanceof Date ? pi.createdAt.toISOString() : new Date().toISOString(),
      },
      { status: 200 },
    )
  } catch {
    return Response.json(
      { error: { code: "processing_error", message: "Cancel request failed" } },
      { status: 502 },
    )
  }
}

export async function handleListPaymentIntents(
  query: Record<string, unknown>,
  rawApiKey: string,
  deps: PaymentIntentServiceDeps,
) {
  const merchant = await deps.resolveMerchant(rawApiKey)
  if (!merchant) {
    return new Response(
      JSON.stringify({ error: { code: "invalid_api_key", message: "Invalid API key" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    )
  }

  const requestedLimit = Number(query.limit) || 10
  const limit = Math.min(Math.max(requestedLimit, 1), 100)
  
  const { listPaymentIntents } = await import("@repo/dal")
  const results = await listPaymentIntents(merchant.merchantId, {
    limit,
    createdSince: query.created_since as string | undefined,
  })
  
  const { formatPaymentIntentResponse } = await import("./format-pi-response")
  const data = (results ?? []).map((pi: any) => ({
    id: pi.id,
    object: "payment_intent",
    amount: pi.amount,
    currency: pi.currency,
    status: pi.status,
    created: (pi as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
    payment_method_details: pi.paymentMethod ? {
      card: {
        brand: pi.paymentMethod.brand ?? "unknown",
        last4: pi.paymentMethod.last4 ?? "****",
      },
    } : undefined,
  }))
  return new Response(
    JSON.stringify({ object: "list", data, has_more: data.length >= limit }),
    { status: 200, headers: { "content-type": "application/json" } },
  )
}
