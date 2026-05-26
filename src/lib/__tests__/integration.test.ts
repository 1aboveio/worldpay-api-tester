import { describe, it, expect, vi, beforeEach } from "vitest";
import { createIdempotencyCache } from "../idempotency-cache";
import { createIdempotencyMiddleware } from "../idempotency-middleware";
import { decideRetryAction } from "../retry-policy";
import { recoverFromTimeout } from "../timeout-recovery";
import type { WorldpayEventsClient } from "../timeout-recovery";
import type { IdempotencyCache, PaymentIntentStatus } from "../types";

/**
 * Simulated authorize handler — mimics the real POST /cardPayments/... flow.
 */
type AuthorizeHandler = () => Promise<{
  statusCode: number;
  body: unknown;
}>;

interface PaymentIntentRecord {
  id: string;
  status: PaymentIntentStatus;
  linkData: string;
  amount: number;
  currency: string;
}

/**
 * Orchestrator that ties together:
 * - Idempotency-Key middleware
 * - Retry policy
 * - Timeout recovery via GET /payments/events
 */
async function processPayment(
  cache: IdempotencyCache,
  eventsClient: WorldpayEventsClient,
  params: {
    idempotencyKey: string;
    merchantId: string;
  },
  authorizeHandler: AuthorizeHandler,
): Promise<{ statusCode: number; body: unknown; paymentIntent: PaymentIntentRecord }> {
  const middleware = createIdempotencyMiddleware(cache);

  // The full payment flow
  const result = await middleware.process(
    params.idempotencyKey,
    params.merchantId,
    async () => {
      try {
        return await authorizeHandler();
      } catch (err: unknown) {
        // Classify error for retry decision
        const isTimeout =
          err instanceof Error &&
          (err.name === "TimeoutError" || err.message?.includes("timeout"));
        const isNetworkError = err instanceof Error && err.name === "FetchError";

        // Errors from HTTP responses may carry a statusCode
        const errStatusCode =
          err && typeof err === "object" && "statusCode" in err
            ? (err as Record<string, unknown>).statusCode as number
            : 0;

        const retryCtx = {
          statusCode: errStatusCode,
          isTimeout,
          isNetworkError: isNetworkError || isTimeout,
          endpoint: "/cardPayments/customerInitiatedTransactions",
          isDDC: false,
        };

        const decision = decideRetryAction(retryCtx);

        if (decision.action === "mark_unknown_and_recover") {
          // Mark PaymentIntent as unknown
          const pi: PaymentIntentRecord = {
            id: "pi_auto_" + Date.now(),
            status: "unknown",
            linkData: "https://try.access.worldpay.com/payments/events/evt_timeout",
            amount: 250,
            currency: "GBP",
          };

          // Attempt recovery via GET /payments/events
          const recovery = await recoverFromTimeout(eventsClient, pi);

          if (recovery.safeToRetry) {
            // Retry the authorize
            try {
              return await authorizeHandler();
            } catch {
              return {
                statusCode: 500,
                body: { error: "retry_failed" },
              };
            }
          }

          return {
            statusCode: 200,
            body: {
              id: pi.id,
              status: recovery.externalStatus,
              recovered: true,
              recoveryAction: recovery.action,
            },
          };
        }

        if (decision.action === "return_error") {
          return {
            statusCode: 502,
            body: { error: "upstream_error", reason: decision.reason },
          };
        }

        // degrade_continue — not applicable for authorize
        return {
          statusCode: 500,
          body: { error: "unhandled" },
        };
      }
    },
  );

  return {
    ...result,
    paymentIntent: {
      id: "pi_processed",
      status: "succeeded",
      linkData: "",
      amount: 250,
      currency: "GBP",
    },
  };
}

describe("Integration: Idempotency + Timeout Recovery", () => {
  let cache: IdempotencyCache;
  let eventsClient: WorldpayEventsClient;

  beforeEach(() => {
    cache = createIdempotencyCache({ maxEntries: 100, ttlMs: 24 * 60 * 60 * 1000 });
    eventsClient = {
      getPaymentEvents: vi.fn(),
    };
  });

  it("duplicate Idempotency-Key returns cached response (happy path)", async () => {
    const authHandler = vi.fn().mockResolvedValue({
      statusCode: 201,
      body: { id: "pi_1", outcome: "authorized", status: "succeeded" },
    });

    const params = { idempotencyKey: "ik_abc123", merchantId: "merchant_a" };

    // First call
    const r1 = await processPayment(cache, eventsClient, params, authHandler);
    expect(r1.statusCode).toBe(201);
    expect(authHandler).toHaveBeenCalledTimes(1);

    // Second call — duplicate
    authHandler.mockClear();
    const r2 = await processPayment(cache, eventsClient, params, authHandler);
    expect(authHandler).not.toHaveBeenCalled();
    expect(r2.statusCode).toBe(200);
    expect(r2.body).toEqual({ id: "pi_1", outcome: "authorized", status: "succeeded" });
  });

  it("different API keys with same idempotency key treated independently", async () => {
    const handlerA = vi.fn().mockResolvedValue({
      statusCode: 201, body: { id: "pi_a" },
    });
    const handlerB = vi.fn().mockResolvedValue({
      statusCode: 201, body: { id: "pi_b" },
    });

    await processPayment(cache, eventsClient, { idempotencyKey: "ik_123", merchantId: "merchant_a" }, handlerA);
    await processPayment(cache, eventsClient, { idempotencyKey: "ik_123", merchantId: "merchant_b" }, handlerB);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it("expired idempotency key (> 24h) treated as new request", async () => {
    const shortCache = createIdempotencyCache({ maxEntries: 100, ttlMs: 5 });
    const handler = vi.fn().mockResolvedValue({
      statusCode: 201, body: { id: "pi_1" },
    });

    const params = { idempotencyKey: "ik_old", merchantId: "m" };

    // First call — cache it
    await processPayment(shortCache, eventsClient, params, handler);
    expect(handler).toHaveBeenCalledTimes(1);

    // Wait for TTL
    await new Promise((r) => setTimeout(r, 10));

    // Second call — should re-execute
    handler.mockClear();
    const r2 = await processPayment(shortCache, eventsClient, params, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(r2.statusCode).toBe(201);
  });

  it("timeout during authorize → recover via /events → succeeded", async () => {
    const authHandler = vi.fn().mockImplementation(async () => {
      const err = new Error("The request timed out");
      err.name = "TimeoutError";
      throw err;
    });

    (eventsClient.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [{ type: "AUTHORIZED", paymentId: "pi_test" }],
        },
      },
    });

    const params = { idempotencyKey: "ik_timeout_1", merchantId: "merchant_a" };
    const result = await processPayment(cache, eventsClient, params, authHandler);

    // authHandler called once (timeout), getPaymentEvents once (recovery)
    // AUTHORIZED → safeToRetry=false → return recovered status directly
    expect(authHandler).toHaveBeenCalledTimes(1);
    expect(eventsClient.getPaymentEvents).toHaveBeenCalledTimes(1);
    expect((result.body as Record<string, unknown>).status).toBe("succeeded");
    expect((result.body as Record<string, unknown>).recovered).toBe(true);
  });

  it("/events returns 404 → retry authorize (no duplicate charge)", async () => {
    let callCount = 0;
    const authHandler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error("timeout");
        err.name = "TimeoutError";
        throw err;
      }
      return {
        statusCode: 201,
        body: { id: "pi_retry", outcome: "authorized" },
      };
    });

    (eventsClient.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 404,
      body: { errorName: "notFound" },
    });

    const params = { idempotencyKey: "ik_timeout_2", merchantId: "merchant_a" };
    const result = await processPayment(cache, eventsClient, params, authHandler);

    // 404 → safe to retry → authorize called again (2nd time succeeds)
    expect(authHandler).toHaveBeenCalledTimes(2);
    expect(eventsClient.getPaymentEvents).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(201);
    expect(result.body).toEqual({ id: "pi_retry", outcome: "authorized" });
  });

  it("/events returns refused → payment_failed", async () => {
    const authHandler = vi.fn().mockImplementation(async () => {
      const err = new Error("timeout");
      err.name = "TimeoutError";
      throw err;
    });

    (eventsClient.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [{ type: "REFUSED", paymentId: "pi_test" }],
        },
      },
    });

    const params = { idempotencyKey: "ik_refused", merchantId: "merchant_a" };
    const result = await processPayment(cache, eventsClient, params, authHandler);

    expect(eventsClient.getPaymentEvents).toHaveBeenCalledTimes(1);
    expect(result.statusCode).toBe(200);
    expect((result.body as Record<string, unknown>).status).toBe("payment_failed");
    expect((result.body as Record<string, unknown>).recovered).toBe(true);
  });

  it("Worldpay 5xx → mark unknown → recovery recovers correct state", async () => {
    // Simulate: authorize call gets 5xx (not a timeout, actual HTTP response)
    const authHandler = vi.fn().mockImplementation(async () => {
      // 5xx from Worldpay — thrown as error with statusCode
      const err = Object.assign(new Error("HTTP 503 Service Unavailable"), {
        name: "FetchError",
        statusCode: 503,
      });
      throw err;
    });

    (eventsClient.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [{ type: "AUTHORIZED", paymentId: "pi_test" }],
        },
      },
    });

    const params = { idempotencyKey: "ik_5xx", merchantId: "merchant_a" };
    const result = await processPayment(cache, eventsClient, params, authHandler);

    expect(eventsClient.getPaymentEvents).toHaveBeenCalledTimes(1);
    // AUTHORIZED → succeeded
    expect((result.body as Record<string, unknown>).status).toBe("succeeded");
  });
});
