export interface WpCallOptions {
  method?: string
  body?: unknown
}

/**
 * Worldpay HTTP client facade.
 * In production, this makes real HTTPS calls to Worldpay Access.
 * In tests, this is mocked to return deterministic responses.
 */
export type WpCallFn = (path: string, mediaType: string, options?: WpCallOptions) => Promise<unknown>

/**
 * Tokenization service facade.
 * In production, this calls Worldpay POST /tokens.
 * In tests, this is mocked.
 */
export type CreateTokenFn = (
  cardDetails: {
    number: string
    expiryMonth: number
    expiryYear: number
    cvc: string
    cardholderName?: string
    billingAddress?: Record<string, unknown>
  },
  entity: string,
) => Promise<{ tokenHref: string; brand: string; last4: string; expiryMonth: number; expiryYear: number }>

/**
 * Tokenization from a Worldpay Access Checkout hosted-fields session.
 * In production, this calls POST /tokens with paymentInstrument
 * `{ type: "card/checkout", sessionHref }`. In tests, this is mocked.
 */
export type CreateTokenFromSessionFn = (
  sessionHref: string,
  entity: string,
) => Promise<{ tokenHref: string; brand: string; last4: string }>

/**
 * Resolve merchant from API key.
 * Looks up merchant + entity + payFac config.
 */
export type ResolveMerchantFn = (apiKey: string) => Promise<{
  merchantId: string
  entity: string
  payFacConfig: {
    schemeId: string
    subMerchant: {
      reference: string
      name: string
      address: Record<string, unknown>
    }
  }
}>
