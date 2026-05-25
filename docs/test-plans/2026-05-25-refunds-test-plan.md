# Refunds API Test Plan

**Date:** 2026-05-25  
**Feature:** POST /api/v1/refunds + GET /api/v1/refunds/{id}  
**Status:** Implemented, all passing

## Architecture

Tests exercise observable behavior through public API endpoints. External dependencies (wpCall, resolveMerchant) are mocked via vitest module mocks. The DAL uses the in-memory mock store (`@repo/database` → `__mocks__/database.ts`).

## Acceptance Criteria

| # | Criteria | Status |
|---|----------|--------|
| AC1 | `POST /api/v1/refunds { payment_intent, reason }` on succeeded PI → `{ id: "rf_xxx", status: "succeeded" }` | PASS |
| AC2 | `POST /api/v1/refunds { payment_intent, amount: 100 }` → partial refund | PASS |
| AC3 | `GET /api/v1/refunds/{id}` returns stored refund data | PASS |
| AC4 | Omitting amount → refunds full remaining capturable amount | PASS |
| AC5 | Double full refund → 400 `already_refunded` | PASS |
| AC6 | Cumulative partial exceeding original → 400 `refund_exceeds_balance` | PASS |
| AC7 | Refund on non-succeeded PI → 400 `status_invalid` | PASS |
| AC8 | Refund uses HATEOAS URL from PaymentIntent.linkData | PASS |
| AC9 | PI not found or wrong merchant → 404 `payment_intent_not_found` | PASS |
| AC10 | Idempotency-Key prevents duplicate refund creation | PASS |

## Edge Cases & Error Coverage

| Error Condition | HTTP | Code | Status |
|-----------------|------|------|--------|
| Missing payment_intent | 400 | validation_error | PASS |
| Invalid reason enum | 400 | validation_error | PASS |
| Invalid API key | 401 | authentication_error | PASS |
| PI not succeeded | 400 | status_invalid | PASS |
| PI not found | 404 | payment_intent_not_found | PASS |
| PI different merchant | 404 | payment_intent_not_found | PASS |
| Already fully refunded | 400 | already_refunded | PASS |
| Cumulative exceeds original | 400 | refund_exceeds_balance | PASS |
| Single refund exceeds original | 400 | refund_exceeds_balance | PASS |
| Worldpay call fails | 500 | refund_failed | PASS |

## Cumulative Refund Tracking

- Refunds are tracked per PaymentIntent via `getRefundsByPaymentIntent`
- Total refunded = sum of all existing refund amounts
- When amount is omitted, the refund amount = original - totalRefunded
- Exact match with original amount is allowed (100% refund)

## HATEOAS Link Selection

| Scenario | Link Used |
|----------|-----------|
| No existing refunds + no amount OR amount === original | `cardPayments:refund` |
| Amount < original | `cardPayments:partialRefund` |
| Previous refunds exist (remaining < original) | `cardPayments:partialRefund` |

## Idempotency

- Key extracted from `Idempotency-Key` request header
- On duplicate key: return existing refund with same id and status
- Key stored on Refund record via `idempotencyKey` field

## Mock Policy

- `wpCall`: Mocked — returns `{ outcome: "refunded", refund: { id: "wp_ref_abc" } }`
- `resolveMerchant`: Mocked — returns test merchant on valid key, throws on invalid
- `@repo/database`: Aliased to in-memory mock store simulating Prisma behavior
