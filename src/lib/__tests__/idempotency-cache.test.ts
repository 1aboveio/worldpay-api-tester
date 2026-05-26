import { describe, it, expect, beforeEach } from "vitest";
import { createIdempotencyCache } from "../idempotency-cache";

describe("IdempotencyCache", () => {
  let cache: ReturnType<typeof createIdempotencyCache>;

  beforeEach(() => {
    cache = createIdempotencyCache({ maxEntries: 100, ttlMs: 60_000 });
  });

  it("returns null for a key that has not been set", () => {
    expect(cache.get("key-1", "merchant-a")).toBeNull();
  });

  it("returns the cached record after set", () => {
    const body = { id: "pi_123", status: "succeeded" };
    cache.set("key-1", "merchant-a", 200, body);

    const record = cache.get("key-1", "merchant-a");
    expect(record).not.toBeNull();
    expect(record!.key).toBe("key-1");
    expect(record!.merchantId).toBe("merchant-a");
    expect(record!.statusCode).toBe(200);
    expect(record!.responseBody).toEqual(body);
  });

  it("treats different merchants with same key independently", () => {
    const bodyA = { id: "pi_a" };
    const bodyB = { id: "pi_b" };

    cache.set("key-1", "merchant-a", 200, bodyA);
    cache.set("key-1", "merchant-b", 201, bodyB);

    const recA = cache.get("key-1", "merchant-a");
    const recB = cache.get("key-1", "merchant-b");

    expect(recA!.responseBody).toEqual(bodyA);
    expect(recB!.responseBody).toEqual(bodyB);
  });

  it("evicts entries older than TTL", async () => {
    cache = createIdempotencyCache({ maxEntries: 100, ttlMs: 10 }); // 10ms TTL
    cache.set("key-1", "merchant-a", 200, { id: "pi_1" });

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 20));

    // The entry should be evicted (treated as new request)
    cache.evictExpired();
    expect(cache.get("key-1", "merchant-a")).toBeNull();
  });

  it("replaces existing entry on set with same key", () => {
    cache.set("key-1", "merchant-a", 200, { id: "pi_1" });
    cache.set("key-1", "merchant-a", 201, { id: "pi_1_updated" });

    const record = cache.get("key-1", "merchant-a");
    expect(record!.statusCode).toBe(201);
    expect(record!.responseBody).toEqual({ id: "pi_1_updated" });
  });

  it("evicts oldest entry when maxEntries exceeded (LRU)", () => {
    cache = createIdempotencyCache({ maxEntries: 3, ttlMs: 60_000 });

    cache.set("key-1", "m", 200, {});
    cache.set("key-2", "m", 200, {});
    cache.set("key-3", "m", 200, {});
    // This should evict key-1 (oldest)
    cache.set("key-4", "m", 200, {});

    expect(cache.get("key-1", "m")).toBeNull();
    expect(cache.get("key-2", "m")).not.toBeNull();
    expect(cache.get("key-3", "m")).not.toBeNull();
    expect(cache.get("key-4", "m")).not.toBeNull();
  });

  it("reports correct size", () => {
    expect(cache.size).toBe(0);
    cache.set("k1", "m", 200, {});
    cache.set("k2", "m", 200, {});
    expect(cache.size).toBe(2);
  });

  it("delete removes an entry", () => {
    cache.set("key-1", "m", 200, {});
    cache.delete("key-1", "m");
    expect(cache.get("key-1", "m")).toBeNull();
    expect(cache.size).toBe(0);
  });

  it("evictExpired prior to get returns null for expired key", async () => {
    cache = createIdempotencyCache({ maxEntries: 100, ttlMs: 5 });
    cache.set("key-1", "m", 200, {});
    await new Promise((r) => setTimeout(r, 10));
    cache.evictExpired();
    expect(cache.get("key-1", "m")).toBeNull();
  });
});
