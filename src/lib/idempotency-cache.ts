import type { IdempotencyCache, IdempotencyCacheOptions, IdempotencyRecord } from "./types";

export function createIdempotencyCache(options: IdempotencyCacheOptions): IdempotencyCache {
  const { maxEntries, ttlMs } = options;
  // Map: "merchantId::key" → entry
  const store = new Map<string, { record: IdempotencyRecord; lastAccess: number }>();
  let accessCounter = 0;

  function makeCompositeKey(key: string, merchantId: string): string {
    return `${merchantId}::${key}`;
  }

  function evictIfFull(): void {
    if (store.size < maxEntries) return;
    // Find the entry with the lowest lastAccess (LRU)
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;
    for (const [k, v] of store) {
      if (v.lastAccess < oldestAccess) {
        oldestAccess = v.lastAccess;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      store.delete(oldestKey);
    }
  }

  return {
    get(key: string, merchantId: string): IdempotencyRecord | null {
      const ck = makeCompositeKey(key, merchantId);
      const entry = store.get(ck);
      if (!entry) return null;

      // Check expiry
      const age = Date.now() - entry.record.createdAt.getTime();
      if (age >= ttlMs) {
        store.delete(ck);
        return null;
      }

      // Update LRU access
      accessCounter++;
      entry.lastAccess = accessCounter;
      return entry.record;
    },

    set(key: string, merchantId: string, statusCode: number, responseBody: unknown): void {
      evictIfFull();
      const ck = makeCompositeKey(key, merchantId);
      const record: IdempotencyRecord = {
        key,
        merchantId,
        statusCode,
        responseBody,
        createdAt: new Date(),
      };
      accessCounter++;
      store.set(ck, { record, lastAccess: accessCounter });
    },

    delete(key: string, merchantId: string): void {
      const ck = makeCompositeKey(key, merchantId);
      store.delete(ck);
    },

    evictExpired(): void {
      const now = Date.now();
      for (const [k, v] of store) {
        const age = now - v.record.createdAt.getTime();
        if (age >= ttlMs) {
          store.delete(k);
        }
      }
    },

    get size(): number {
      return store.size;
    },
  };
}
