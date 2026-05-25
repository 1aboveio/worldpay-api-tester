import { describe, it, expect, vi, beforeEach } from "vitest";
import { recoverFromTimeout } from "../timeout-recovery";
import type { PaymentIntentStatus } from "../types";

// Mock Worldpay client for events endpoint
interface WorldpayClient {
  getPaymentEvents: (linkData: string) => Promise<{
    status: number;
    body: unknown;
  }>;
}

describe("TimeoutRecovery", () => {
  let client: WorldpayClient;

  beforeEach(() => {
    client = {
      getPaymentEvents: vi.fn(),
    };
  });

  const basePaymentIntent = {
    id: "pi_test123",
    status: "unknown" as PaymentIntentStatus,
    linkData: "https://try.access.worldpay.com/payments/events/evt_abc123",
    amount: 250,
    currency: "GBP",
  };

  it("recovers to succeeded when /events returns authorized", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [
            { type: "AUTHORIZED", paymentId: "pi_test123" },
          ],
        },
      },
    });

    const result = await recoverFromTimeout(client, basePaymentIntent);

    expect(client.getPaymentEvents).toHaveBeenCalledWith(basePaymentIntent.linkData);
    expect(result.internalStatus).toBe("succeeded");
    expect(result.externalStatus).toBe("succeeded");
    expect(result.action).toBe("recovered_via_events");
    expect(result.safeToRetry).toBe(false);
    expect(result.eventData).toBeDefined();
  });

  it("recovers to requires_capture when /events returns sentForSettlement", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [
            { type: "SENT_FOR_SETTLEMENT", paymentId: "pi_test123" },
          ],
        },
      },
    });

    const result = await recoverFromTimeout(client, basePaymentIntent);

    expect(result.internalStatus).toBe("requires_capture");
    expect(result.externalStatus).toBe("requires_capture");
    expect(result.action).toBe("recovered_via_events");
  });

  it("recovers to payment_failed when /events returns refused", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      body: {
        _embedded: {
          events: [
            { type: "REFUSED", paymentId: "pi_test123" },
          ],
        },
      },
    });

    const result = await recoverFromTimeout(client, basePaymentIntent);

    expect(result.internalStatus).toBe("payment_failed");
    expect(result.externalStatus).toBe("payment_failed");
    expect(result.action).toBe("recovered_via_events");
    expect(result.safeToRetry).toBe(false);
  });

  it("safeToRetry=true when /events returns 404 (transaction not found)", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 404,
      body: { errorName: "notFound" },
    });

    const result = await recoverFromTimeout(client, basePaymentIntent);

    expect(client.getPaymentEvents).toHaveBeenCalledWith(basePaymentIntent.linkData);
    expect(result.action).toBe("retry_authorize");
    expect(result.safeToRetry).toBe(true);
    expect(result.internalStatus).toBe("unknown");
    expect(result.externalStatus).toBe("processing");
  });

  it("returns processing when /events is unavailable (5xx)", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 500,
      body: { errorName: "internalError" },
    });

    const result = await recoverFromTimeout(client, basePaymentIntent);

    expect(result.action).toBe("no_recovery_possible");
    expect(result.safeToRetry).toBe(false);
    expect(result.internalStatus).toBe("unknown");
    expect(result.externalStatus).toBe("processing");
  });

  it("maps unknown internal status to processing externally", async () => {
    (client.getPaymentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 500,
      body: {},
    });

    const result = await recoverFromTimeout(client, {
      ...basePaymentIntent,
      status: "unknown",
    });

    expect(result.internalStatus).toBe("unknown");
    expect(result.externalStatus).toBe("processing");
  });

  it("handles missing linkData gracefully", async () => {
    const result = await recoverFromTimeout(client, {
      ...basePaymentIntent,
      linkData: "",
    });

    expect(result.action).toBe("no_recovery_possible");
    expect(result.safeToRetry).toBe(false);
    expect(client.getPaymentEvents).not.toHaveBeenCalled();
  });
});
