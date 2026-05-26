/**
 * Worldpay API Tester — Idempotency & Timeout Recovery Module
 *
 * Provides:
 * - Idempotency-Key support with in-memory LRU cache
 * - Timeout recovery via GET /payments/events HATEOAS links
 * - Retry policy decision engine
 *
 * Usage:
 *   import { createIdempotencyCache, createIdempotencyMiddleware } from "./lib";
 *
 *   const cache = createIdempotencyCache({ maxEntries: 10_000, ttlMs: 86_400_000 });
 *   const middleware = createIdempotencyMiddleware(cache);
 *
 *   const result = await middleware.process(
 *     req.headers["idempotency-key"],
 *     apiKey,
 *     () => worldpay.authorize(payload)
 *   );
 */

// Types
export type {
  IdempotencyRecord,
  IdempotencyCache,
  IdempotencyCacheOptions,
  IdempotencyCheckResult,
  PaymentIntentStatus,
  TimeoutRecoveryResult,
  RetryDecision,
  RetryContext,
} from "./types";

// Idempotency cache
export { createIdempotencyCache } from "./idempotency-cache";

// Idempotency middleware
export { createIdempotencyMiddleware } from "./idempotency-middleware";
export type { HandlerResult, ApiHandler } from "./idempotency-middleware";

// Retry policy
export { decideRetryAction } from "./retry-policy";

// Timeout recovery
export { recoverFromTimeout } from "./timeout-recovery";
export type { WorldpayEventsClient } from "./timeout-recovery";
