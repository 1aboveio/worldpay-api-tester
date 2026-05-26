/**
 * Core types for idempotency and timeout recovery.
 */

/** Record of a previous API response, keyed by idempotency key + merchant. */
export interface IdempotencyRecord {
  key: string;
  merchantId: string;
  statusCode: number;
  responseBody: unknown;
  createdAt: Date;
}

/** In-memory LRU cache for idempotency records. */
export interface IdempotencyCache {
  get(key: string, merchantId: string): IdempotencyRecord | null;
  set(key: string, merchantId: string, statusCode: number, responseBody: unknown): void;
  delete(key: string, merchantId: string): void;
  /** Evict entries older than TTL. Called before get/set or periodically. */
  evictExpired(): void;
  readonly size: number;
}

/** Options for the idempotency cache. */
export interface IdempotencyCacheOptions {
  /** Maximum number of entries. Default 10_000. */
  maxEntries: number;
  /** TTL in milliseconds. Default 24 hours. */
  ttlMs: number;
}

/** Result of an idempotency check. */
export interface IdempotencyCheckResult {
  /** Whether this is a cached replay. */
  replay: boolean;
  /** The cached response, if replay=true. */
  cached?: {
    statusCode: number;
    body: unknown;
  };
}

/** Payment intent status including the internal "unknown" state. */
export type PaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_capture"
  | "processing"
  | "succeeded"
  | "payment_failed"
  | "canceled"
  | "unknown"; // internal only — mapped to "processing" externally

/** Result of timeout recovery via GET /payments/events. */
export interface TimeoutRecoveryResult {
  /** Final status to return to caller. */
  externalStatus: "processing" | "succeeded" | "requires_capture" | "payment_failed" | "canceled";
  /** Internal status. */
  internalStatus: PaymentIntentStatus;
  /** Whether a retry of the original authorize is safe. */
  safeToRetry: boolean;
  /** Raw event data from Worldpay, if available. */
  eventData?: unknown;
  /** Action taken. */
  action: "recovered_via_events" | "retry_authorize" | "no_recovery_possible" | "degraded_continue";
}

/** Retry decision for a Worldpay API error. */
export type RetryDecision =
  | { action: "no_retry"; reason: string }
  | { action: "mark_unknown_and_recover"; reason: string }
  | { action: "return_error"; reason: string }
  | { action: "degrade_continue"; reason: string };

/** Context for retry decisions. */
export interface RetryContext {
  statusCode: number;
  isTimeout: boolean;
  isNetworkError: boolean;
  endpoint: string;
  isDDC: boolean;
}
