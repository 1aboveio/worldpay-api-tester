import type { IdempotencyCache } from "./types";

export interface HandlerResult {
  statusCode: number;
  body: unknown;
}

export type ApiHandler = () => Promise<HandlerResult>;

export function createIdempotencyMiddleware(cache: IdempotencyCache) {
  return {
    /**
     * Process a request with idempotency-key support.
     *
     * @param idempotencyKey - The Idempotency-Key header value (null/empty = skip)
     * @param merchantId - API key / merchant identifier for scope
     * @param handler - The actual API handler to call on cache miss
     * @returns The response (from cache or handler)
     */
    async process(
      idempotencyKey: string | null,
      merchantId: string,
      handler: ApiHandler,
    ): Promise<HandlerResult> {
      // Skip if no idempotency key
      if (!idempotencyKey) {
        return handler();
      }

      // Evict expired entries first
      cache.evictExpired();

      // Check cache
      const cached = cache.get(idempotencyKey, merchantId);
      if (cached) {
        return {
          statusCode: cached.statusCode,
          body: cached.responseBody,
        };
      }

      // Execute handler and cache result
      const result = await handler();
      cache.set(idempotencyKey, merchantId, result.statusCode, result.body);
      return result;
    },
  };
}
