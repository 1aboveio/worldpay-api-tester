import { describe, it, expect, beforeEach, vi } from "vitest";
import { createIdempotencyMiddleware } from "../idempotency-middleware";
import { createIdempotencyCache } from "../idempotency-cache";
import type { IdempotencyCache } from "../types";

describe("IdempotencyMiddleware", () => {
  let cache: IdempotencyCache;
  let middleware: ReturnType<typeof createIdempotencyMiddleware>;

  beforeEach(() => {
    cache = createIdempotencyCache({ maxEntries: 100, ttlMs: 24 * 60 * 60 * 1000 });
    middleware = createIdempotencyMiddleware(cache);
  });

  it("calls handler and caches result on first request", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: "pi_1", status: "succeeded" } });

    const result = await middleware.process("key-1", "merchant-a", handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(201);
    expect(result.body).toEqual({ id: "pi_1", status: "succeeded" });

    // Verify cached
    const cached = cache.get("key-1", "merchant-a");
    expect(cached).not.toBeNull();
    expect(cached!.statusCode).toBe(201);
    expect(cached!.responseBody).toEqual({ id: "pi_1", status: "succeeded" });
  });

  it("returns cached response on duplicate idempotency key", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: "pi_1" } });

    // First call — execute handler
    await middleware.process("key-1", "merchant-a", handler);

    // Reset mock
    handler.mockClear();

    // Second call — should return cached, NOT call handler
    const result = await middleware.process("key-1", "merchant-a", handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(201);
    expect(result.body).toEqual({ id: "pi_1" });
  });

  it("treats same key + different merchants independently", async () => {
    const handlerA = vi.fn().mockResolvedValue({ statusCode: 200, body: { id: "pi_a" } });
    const handlerB = vi.fn().mockResolvedValue({ statusCode: 200, body: { id: "pi_b" } });

    await middleware.process("key-1", "merchant-a", handlerA);
    await middleware.process("key-1", "merchant-b", handlerB);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);

    // Now replay merchant-a
    handlerA.mockClear();
    const result = await middleware.process("key-1", "merchant-a", handlerA);
    expect(handlerA).not.toHaveBeenCalled();
    expect(result.body).toEqual({ id: "pi_a" });
  });

  it("skips idempotency when key is not provided", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: "pi_1" } });

    await middleware.process(null, "merchant-a", handler);
    await middleware.process(null, "merchant-a", handler);

    // Both calls should execute the handler
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("skips idempotency when key is empty string", async () => {
    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: {} });

    await middleware.process("", "merchant-a", handler);
    await middleware.process("", "merchant-a", handler);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("evicts expired entries before processing", async () => {
    const shortCache = createIdempotencyCache({ maxEntries: 100, ttlMs: 5 });
    const mw = createIdempotencyMiddleware(shortCache);

    const handler = vi.fn().mockResolvedValue({ statusCode: 201, body: { id: "pi_1" } });

    await mw.process("key-1", "merchant-a", handler);
    // Wait for expiry
    await new Promise((r) => setTimeout(r, 10));

    handler.mockClear();
    const result = await mw.process("key-1", "merchant-a", handler);

    expect(handler).toHaveBeenCalledTimes(1); // re-executed
    expect(result.body).toEqual({ id: "pi_1" });
  });
});
