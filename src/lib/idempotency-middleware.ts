import type { IdempotencyCache } from "./types";

export interface HandlerResult {
  statusCode: number;
  body: unknown;
}

export type ApiHandler = () => Promise<HandlerResult>;

export function createIdempotencyMiddleware(cache: IdempotencyCache) {
  /**
   * Per-key promise queue to prevent TOCTOU race conditions.
   * When a request gets a cache miss, it stores a pending promise here immediately.
   * Concurrent requests with the same key await that promise instead of executing,
   * eliminating the gap between cache.get() and cache.set().
   */
  const pending = new Map<string, Promise<HandlerResult>>();

  function compositeKey(key: string, merchantId: string): string {
    return `${merchantId}::${key}`;
  }

  return {
    /**
     * Process a request with idempotency-key support.
     *
     * On idempotent collision (cache hit or concurrent in-flight request),
     * returns HTTP 200 with the original status code preserved in the body.
     */
    async process(
      idempotencyKey: string | null,
      merchantId: string,
      handler: ApiHandler,
    ): Promise<HandlerResult> {
      if (!idempotencyKey) {
        return handler();
      }

      cache.evictExpired();

      const cached = cache.get(idempotencyKey, merchantId);
      if (cached) {
        return { statusCode: 200, body: cached.responseBody };
      }

      const ck = compositeKey(idempotencyKey, merchantId);

      const existing = pending.get(ck);
      if (existing) {
        const result = await existing;
        return { statusCode: 200, body: result.body };
      }

      const promise = handler()
        .then((result) => {
          cache.set(idempotencyKey, merchantId, result.statusCode, result.body);
          return result;
        })
        .finally(() => {
          pending.delete(ck);
        });

      pending.set(ck, promise);
      return promise;
    },
  };
}
