import { describe, it, expect } from "vitest";
import { decideRetryAction } from "../retry-policy";
import type { RetryContext } from "../types";

describe("RetryPolicy", () => {
  it('returns "mark_unknown_and_recover" for Worldpay 5xx', () => {
    const ctx: RetryContext = {
      statusCode: 500,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    const decision = decideRetryAction(ctx);
    expect(decision.action).toBe("mark_unknown_and_recover");
  });

  it('returns "mark_unknown_and_recover" for Worldpay 502', () => {
    const ctx: RetryContext = {
      statusCode: 502,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("mark_unknown_and_recover");
  });

  it('returns "mark_unknown_and_recover" for Worldpay 503', () => {
    const ctx: RetryContext = {
      statusCode: 503,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("mark_unknown_and_recover");
  });

  it('returns "mark_unknown_and_recover" for network timeout', () => {
    const ctx: RetryContext = {
      statusCode: 0,
      isTimeout: true,
      isNetworkError: true,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("mark_unknown_and_recover");
  });

  it('returns "return_error" for 4xx errors', () => {
    const ctx: RetryContext = {
      statusCode: 400,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("return_error");
  });

  it('returns "return_error" for 401', () => {
    const ctx: RetryContext = {
      statusCode: 401,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("return_error");
  });

  it('returns "return_error" for 404', () => {
    const ctx: RetryContext = {
      statusCode: 404,
      isTimeout: false,
      isNetworkError: false,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("return_error");
  });

  it('returns "degrade_continue" for DDC timeout', () => {
    const ctx: RetryContext = {
      statusCode: 0,
      isTimeout: true,
      isNetworkError: true,
      endpoint: "/ddc/sessions",
      isDDC: true,
    };
    expect(decideRetryAction(ctx).action).toBe("degrade_continue");
  });

  it('returns "return_error" for non-timeout network errors (non-DDC)', () => {
    const ctx: RetryContext = {
      statusCode: 0,
      isTimeout: false,
      isNetworkError: true,
      endpoint: "/cardPayments/customerInitiatedTransactions",
      isDDC: false,
    };
    expect(decideRetryAction(ctx).action).toBe("return_error");
  });
});
