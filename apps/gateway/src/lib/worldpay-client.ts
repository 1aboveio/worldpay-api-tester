/**
 * Worldpay HTTP client — typed, media-type-aware, with Basic Auth.
 *
 * Each Worldpay API group (Tokens, Card Payments, 3DS, FraudSight, etc.)
 * uses its own Accept and Content-Type media-type header.
 *
 * Timeout: 10s per call.
 * Base URL: WORLDPAY_BASE_URL env var.
 * Auth: HTTP Basic Auth via WORLDPAY_USERNAME / WORLDPAY_PASSWORD env vars.
 */

const BASE_URL = process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com"
const USERNAME = process.env.WORLDPAY_USERNAME ?? ""
const PASSWORD = process.env.WORLDPAY_PASSWORD ?? ""
const TIMEOUT_MS = 10_000

// ---- Media types per API group -------------------------------------------

export const MediaTypes = {
  /** Tokens v3 */
  TOKENS: "application/vnd.worldpay.tokens-v3.hal+json",
  /** Card Payments v7 */
  CARD_PAYMENTS: "application/vnd.worldpay.payments-v7+json",
  /** 3DS v2 */
  THREE_DS: "application/vnd.worldpay.3ds-v2.hal+json",
  /** FraudSight v1 */
  FRAUDSIGHT: "application/vnd.worldpay.fraudsight-v1.hal+json",
  /** Payment Queries v1 */
  PAYMENT_QUERIES: "application/vnd.worldpay.payment-queries-v1.hal+json",
  /** Statements 2025-01-01 */
  STATEMENTS: "application/vnd.worldpay.statements-v1.hal+json",
} as const

// ---- Auth header ----------------------------------------------------------

function basicAuthHeader(): string {
  const encoded = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")
  return `Basic ${encoded}`
}

// ---- Typed fetch helpers --------------------------------------------------

interface WorldpayRequestOptions {
  mediaType: string
  body?: unknown
  method?: "GET" | "POST" | "PUT" | "DELETE"
  signal?: AbortSignal
}

export class WorldpayError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "WorldpayError"
    this.status = status
    this.body = body
  }
}

export async function worldpayRequest<T>(
  path: string,
  options: WorldpayRequestOptions
): Promise<T> {
  const { mediaType, body, method = "POST", signal } = options

  const headers: Record<string, string> = {
    Authorization: basicAuthHeader(),
    Accept: mediaType,
    "Content-Type": mediaType,
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  // If caller provided their own signal, forward aborts
  if (signal) {
    signal.addEventListener("abort", () => controller.abort())
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const responseBody = await response.json().catch(() => null)

    if (!response.ok) {
      throw new WorldpayError(
        `Worldpay API error: ${response.status}`,
        response.status,
        responseBody
      )
    }

    return responseBody as T
  } finally {
    clearTimeout(timeout)
  }
}

// ---- Typed API methods ----------------------------------------------------

/** Tokens API request */
export interface CreateTokenRequest {
  tokenType: "card" | "ach"
  cardNumber?: string
  expiryMonth?: number
  expiryYear?: number
  name?: string
  cvc?: string
  accountNumber?: string
  routingNumber?: string
}

export interface TokenResponse {
  token: string
  tokenExpiryDateTime?: string
  cardBrand?: string
  maskedCardNumber?: string
  tokenType?: string
}

export async function createToken(
  request: CreateTokenRequest
): Promise<TokenResponse> {
  return worldpayRequest<TokenResponse>("/tokens", {
    mediaType: MediaTypes.TOKENS,
    body: request,
  })
}

/** Card Payments API request */
export interface CardPaymentRequest {
  token: string
  amount: number
  currency: string
  entity?: string
  payfacSchemeId?: string
  subMerchant?: {
    name: string
    reference: string
    address?: {
      address1?: string
      city?: string
      state?: string
      postalCode?: string
      countryCode?: string
    }
  }
  merchantReference?: string
}

export interface CardPaymentResponse {
  outcome?: string
  transactionReference?: string
  paymentInstrument?: {
    type?: string
    cardBrand?: string
    maskedCardNumber?: string
  }
  _links?: Record<string, { href: string }>
}

export async function createCardPayment(
  request: CardPaymentRequest
): Promise<CardPaymentResponse> {
  return worldpayRequest<CardPaymentResponse>("/payments", {
    mediaType: MediaTypes.CARD_PAYMENTS,
    body: request,
  })
}
