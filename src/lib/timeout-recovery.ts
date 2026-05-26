import type { PaymentIntentStatus, TimeoutRecoveryResult } from "./types";

/**
 * Minimal Worldpay client interface for events endpoint.
 * In production this is the full API client; for testing we mock this contract.
 */
export interface WorldpayEventsClient {
  getPaymentEvents(linkData: string): Promise<{
    status: number;
    body: unknown;
  }>;
}

interface PaymentIntentSnapshot {
  id: string;
  status: PaymentIntentStatus;
  linkData: string;
  amount: number;
  currency: string;
}

/**
 * Recover payment state after a gateway timeout by calling GET /payments/events.
 *
 * Flow:
 * 1. PaymentIntent already marked "unknown"
 * 2. GET /payments/events/{linkData}
 * 3. Match outcome:
 *    - authorized → succeeded
 *    - sentForSettlement → requires_capture
 *    - refused → payment_failed
 *    - 404 → safe to retry authorize
 *    - 5xx/unreachable → no recovery possible, stays unknown
 */
export async function recoverFromTimeout(
  client: WorldpayEventsClient,
  paymentIntent: PaymentIntentSnapshot,
): Promise<TimeoutRecoveryResult> {
  // Guard: no linkData → cannot recover
  if (!paymentIntent.linkData) {
    return {
      externalStatus: "processing",
      internalStatus: "unknown",
      safeToRetry: false,
      action: "no_recovery_possible",
    };
  }

  try {
    const { status, body } = await client.getPaymentEvents(paymentIntent.linkData);

    // 404 → transaction not found at Worldpay, safe to retry authorize
    if (status === 404) {
      return {
        externalStatus: "processing",
        internalStatus: "unknown",
        safeToRetry: true,
        eventData: body,
        action: "retry_authorize",
      };
    }

    // 5xx → events endpoint itself unavailable
    if (status >= 500) {
      return {
        externalStatus: "processing",
        internalStatus: "unknown",
        safeToRetry: false,
        eventData: body,
        action: "no_recovery_possible",
      };
    }

    // Parse events response
    const events = extractEvents(body);
    if (!events || events.length === 0) {
      return {
        externalStatus: "processing",
        internalStatus: "unknown",
        safeToRetry: false,
        eventData: body,
        action: "no_recovery_possible",
      };
    }

    const lastEvent = events[events.length - 1];
    const eventType = normalizeEventType(lastEvent.type);

    switch (eventType) {
      case "AUTHORIZED":
        return {
          externalStatus: "succeeded",
          internalStatus: "succeeded",
          safeToRetry: false,
          eventData: body,
          action: "recovered_via_events",
        };

      case "SENT_FOR_SETTLEMENT":
        return {
          externalStatus: "requires_capture",
          internalStatus: "requires_capture",
          safeToRetry: false,
          eventData: body,
          action: "recovered_via_events",
        };

      case "REFUSED":
        return {
          externalStatus: "payment_failed",
          internalStatus: "payment_failed",
          safeToRetry: false,
          eventData: body,
          action: "recovered_via_events",
        };

      case "CANCELLED":
        return {
          externalStatus: "canceled",
          internalStatus: "canceled",
          safeToRetry: false,
          eventData: body,
          action: "recovered_via_events",
        };

      default:
        return {
          externalStatus: "processing",
          internalStatus: "unknown",
          safeToRetry: false,
          eventData: body,
          action: "no_recovery_possible",
        };
    }
  } catch {
    return {
      externalStatus: "processing",
      internalStatus: "unknown",
      safeToRetry: false,
      action: "no_recovery_possible",
    };
  }
}

interface RawEvent {
  type?: string;
  paymentId?: string;
}

function extractEvents(body: unknown): RawEvent[] | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const embedded = b._embedded as Record<string, unknown> | undefined;
  if (!embedded) return null;
  const events = embedded.events;
  if (!Array.isArray(events)) return null;
  return events as RawEvent[];
}

function normalizeEventType(type: unknown): string {
  if (typeof type !== "string") return "";
  return type.toUpperCase().replace(/[^A-Z_]/g, "_");
}
