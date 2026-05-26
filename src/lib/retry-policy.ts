import type { RetryContext, RetryDecision } from "./types";

/**
 * Decide what to do when a Worldpay API call fails.
 *
 * Policy:
 * - Worldpay 5xx → do not retry, mark unknown, recover via /events
 * - Network timeout → mark unknown, recover via /events
 * - Worldpay 4xx → do not retry, return error
 * - DDC timeout → degrade, continue without DDC
 */
export function decideRetryAction(ctx: RetryContext): RetryDecision {
  // DDC timeout — degrade
  if (ctx.isDDC && ctx.isTimeout) {
    return { action: "degrade_continue", reason: "DDC timeout — continuing without DDC" };
  }

  // Network timeout on payment endpoints — mark unknown, recover
  if (ctx.isTimeout && ctx.isNetworkError) {
    return {
      action: "mark_unknown_and_recover",
      reason: "Network timeout — marking unknown, recovering via GET /payments/events",
    };
  }

  // Worldpay 5xx — mark unknown, recover via /events
  if (ctx.statusCode >= 500 && ctx.statusCode < 600) {
    return {
      action: "mark_unknown_and_recover",
      reason: `Worldpay ${ctx.statusCode} — marking unknown, recovering via GET /payments/events`,
    };
  }

  // Worldpay 4xx — return error, do not retry
  if (ctx.statusCode >= 400 && ctx.statusCode < 500) {
    return {
      action: "return_error",
      reason: `Worldpay ${ctx.statusCode} — client error, returning to caller`,
    };
  }

  // Default: return error
  return { action: "return_error", reason: `Unhandled error (status=${ctx.statusCode})` };
}
