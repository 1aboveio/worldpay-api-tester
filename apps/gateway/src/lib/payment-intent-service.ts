import { createPaymentIntentSchema, type CreatePaymentIntentInput } from "./schemas"
import type { WpCallFn, CreateTokenFn, ResolveMerchantFn } from "./worldpay-types"
import {
  createPaymentIntent,
  getPaymentIntentByIdAndMerchant,
  updatePaymentIntentStatus,
  createPaymentMethod,
  getPaymentMethodByIdAndMerchant,
  getLatestCitWithSetupFutureUsage,
  getAnyPaymentIntentForPaymentMethod,
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

/** Helper to check if raw request body has three_d_secure field */
function hasThreeDS(body: unknown): boolean {
  return body !== null && typeof body === "object" && "three_d_secure" in body
}

/** Helper to extract payment_method type from raw body before Zod validation */
function rawPaymentMethodType(body: unknown): string | undefined {
  if (body === null || typeof body !== "object") return undefined
  const pm = (body as Record<string, unknown>).payment_method
  if (pm === null || typeof pm !== "object") return undefined
  return (pm as Record<string, unknown>).type as string | undefined
}

function payFacBlock(payFac: {
  schemeId: string
  subMerchant: {
    reference: string
    name: string
    address: Record<string, unknown>
  }
}) {
  return {
    schemeId: payFac.schemeId,
    subMerchant: payFac.subMerchant,
  }
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
      { error: { code: "authentication_error", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 1a. Detect potential MIT before validation
  const isCardToken = rawPaymentMethodType(body) === "card_token"
  const hasThreeD = hasThreeDS(body)
  const isMitCandidate = isCardToken && !hasThreeD

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

  // ─── MIT Pathway ────────────────────────────────────────────────
  if (isMitCandidate) {
    return handleMitPayment(
      piId, input, merchant, entity, payFac, deps.wpCall,
    )
  }

  // ─── CIT Pathway (existing) ─────────────────────────────────────

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
    // card_token CIT (e.g., with three_d_secure present)
    const existingPm = await getPaymentMethodByIdAndMerchant(
      input.payment_method.token,
      merchant.merchantId,
    )
    if (!existingPm) {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.payment_failed,
        failureCode: "token_invalid",
        failureMessage: "Payment method token not found",
      })
      return Response.json(
        {
          id: piId,
          object: "payment_intent",
          amount: input.amount,
          currency,
          status: "payment_failed",
          failure_code: "token_invalid",
          failure_message: "Payment method token not found",
          payment_method_details: { type: "card", card: maskCard(null, null) },
        },
        { status: 200 },
      )
    }
    tokenHref = existingPm.tokenHref as string
    cardBrand = (existingPm.brand as string) ?? null
    cardLast4 = (existingPm.last4 as string) ?? null
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
      paymentFacilitator: payFacBlock(payFac),
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

// ─── MIT Payment Handler ──────────────────────────────────────────

async function handleMitPayment(
  piId: string,
  input: CreatePaymentIntentInput,
  merchant: { merchantId: string },
  entity: string,
  payFac: { schemeId: string; subMerchant: { reference: string; name: string; address: Record<string, unknown> } },
  wpCall: WpCallFn,
) {
  const currency = input.currency.toUpperCase()
  const tokenId = input.payment_method.type === "card_token"
    ? input.payment_method.token
    : ""

  // MIT step 1: Create initial PI record
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

  // MIT step 2: Lookup token → worldpayTokenHref
  const paymentMethod = await getPaymentMethodByIdAndMerchant(tokenId, merchant.merchantId)
  if (!paymentMethod) {
    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      failureCode: "token_invalid",
      failureMessage: "Payment method token not found or has been deleted",
    })
    return Response.json(
      {
        error: {
          code: "token_invalid",
          message: "Payment method token not found or has been deleted",
        },
      },
      { status: 400 },
    )
  }

  const tokenHref = paymentMethod.tokenHref as string
  const cardBrand = (paymentMethod.brand as string) ?? null
  const cardLast4 = (paymentMethod.last4 as string) ?? null

  // MIT step 3: Lookup CIT record → verify setup_future_usage, get schemeReference
  const citRecord = await getLatestCitWithSetupFutureUsage(tokenId, merchant.merchantId)
  if (!citRecord) {
    // Distinguish: no CIT at all vs CIT without off_session setup
    const anyPi = await getAnyPaymentIntentForPaymentMethod(tokenId, merchant.merchantId)
    if (!anyPi) {
      await updatePaymentIntentStatus({
        id: piId,
        status: PaymentIntentStatus.payment_failed,
        failureCode: "mit_requires_cit",
        failureMessage: "No prior CIT payment found for this token",
      })
      return Response.json(
        {
          error: {
            code: "mit_requires_cit",
            message: "No prior CIT payment found for this token",
          },
        },
        { status: 400 },
      )
    }

    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      failureCode: "mit_not_setup",
      failureMessage: "Token was not set up for off-session payments",
    })
    return Response.json(
      {
        error: {
          code: "mit_not_setup",
          message: "Token was not set up for off-session payments",
        },
      },
      { status: 400 },
    )
  }

  const schemeReference = citRecord.schemeReference as string

  // MIT step 4: Link PI to token + start authorizing
  await updatePaymentIntentStatus({
    id: piId,
    status: PaymentIntentStatus.authorizing,
    paymentMethodId: tokenId,
  })

  // MIT step 5: POST /cardPayments/merchantInitiatedTransactions
  // SKIP: Tokenization, FraudSight, DDC, 3DS
  // Auto-capture by default
  const requestAutoSettlement = input.capture_method !== "manual"
  const narrative = input.statement_descriptor
    ? { line1: input.statement_descriptor.substring(0, 24) }
    : undefined

  const mitBody: Record<string, unknown> = {
    transactionReference: piId,
    merchant: {
      entity,
      paymentFacilitator: payFacBlock(payFac),
    },
    instruction: {
      requestAutoSettlement: { enabled: requestAutoSettlement },
      value: { amount: input.amount, currency },
      paymentInstrument: {
        type: "card/token",
        href: tokenHref,
      },
      customerAgreement: {
        type: "unscheduled",
        storedCardUsage: "subsequent",
        schemeReference,
      },
      ...(narrative ? { narrative } : {}),
    },
    channel: "ecom",
  }

  try {
    const mitResult = (await wpCall(
      "/cardPayments/merchantInitiatedTransactions",
      "payments-v7",
      { body: mitBody },
    )) as {
      outcome?: string
      payment?: { id?: string }
      _links?: Record<string, unknown>
      refusal?: { code?: string; description?: string }
    }

    if (mitResult.outcome === "authorized" || mitResult.outcome === "sentForSettlement") {
      const finalStatus =
        input.capture_method === "manual"
          ? PaymentIntentStatus.requires_capture
          : PaymentIntentStatus.succeeded

      await updatePaymentIntentStatus({
        id: piId,
        status: finalStatus,
        worldpayPaymentId: mitResult.payment?.id ?? null,
        linkData: (mitResult._links as Record<string, unknown>) ?? null,
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

    // MIT refused
    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      worldpayPaymentId: mitResult.payment?.id ?? null,
      failureCode: mitResult.refusal?.code ?? "refused",
      failureMessage: mitResult.refusal?.description ?? "Payment refused",
    })

    return Response.json(
      {
        id: piId,
        object: "payment_intent",
        amount: input.amount,
        currency,
        status: "payment_failed",
        failure_code: mitResult.refusal?.code ?? "refused",
        failure_message: mitResult.refusal?.description ?? "Payment refused",
        payment_method_details: { type: "card", card: maskCard(cardBrand, cardLast4) },
      },
      { status: 200 },
    )
  } catch {
    await updatePaymentIntentStatus({
      id: piId,
      status: PaymentIntentStatus.payment_failed,
      failureCode: "authorization_error",
      failureMessage: "MIT authorization request failed",
    })

    return Response.json(
      {
        id: piId,
        object: "payment_intent",
        amount: input.amount,
        currency,
        status: "payment_failed",
        failure_code: "authorization_error",
        failure_message: "MIT authorization request failed",
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
      { error: { code: "authentication_error", message: "Invalid API key" } },
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
