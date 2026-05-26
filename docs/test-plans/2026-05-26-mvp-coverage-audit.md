# Test Coverage Audit: PayFac Payment Gateway MVP — Final

## Source Document
- Input: [PRD: PayFac Payment Gateway MVP](../prd/payfac-payment-gateway-mvp-prd.md)
- Version: v1.0
- Date: 2026-05-27

## Current State: 170 tests total

| Category | Count |
|----------|-------|
| Unit / Integration tests (vitest) | 165 |
| E2E tests (shell script) | 5 |

## Acceptance Criteria Review

### US-01: Accept card payment (Happy Path) — P0
| AC | Status | Evidence |
|----|--------|----------|
| POST /v1/payment_intents with card → status "succeeded" | Covered | `payment-intents.test.ts::card CIT happy path` |
| POST /v1/payment_intents with card_token → status "succeeded" | Covered | `payment-intents.test.ts::card token CIT` |
| Auto-capture on `capture_method: automatic` | Covered | `payment-intents.test.ts::auto-capture` |
| Manual capture → requires_capture | Covered | `capture-cancel.test.ts` (27 tests) |
| Cancel authorization | Covered | `capture-cancel.test.ts::Cancel → canceled` |
| PayFac auto-injection | Covered | `payment-intents.test.ts::PayFac injected` |
| Invalid API key → 401 | Covered | E2E + route.test.ts |
| Statement descriptor truncation | Covered | `payment-intents.test.ts::Narrative truncation` |
**Coverage: Covered** ✓ (52 tests)

### US-02: 3DS v2 — P0
| AC | Status | Evidence |
|----|--------|----------|
| three_d_secure.enabled: true (default) | Covered | `payment-intents-3ds.test.ts` |
| DDC required → requires_device_data | Covered | `device-data.test.ts` |
| Challenge → requires_action | Covered | `callback.test.ts` |
| Frictionless → authenticated | Covered | `payment-intents-3ds.test.ts` |
| notEnrolled/unavailable → no liability shift | Covered | `payment-intents-3ds.test.ts` |
| authenticationFailed → payment_failed | Covered | `payment-intents-3ds.test.ts` |
| 3DS disabled → skip | Covered | `payment-intents-3ds.test.ts` |
| Challenge callback flow | Covered | `callback.test.ts` (6 tests) |
**Coverage: Covered** ✓ (22 tests)

### US-03: Tokenization — P1
All ACs covered by `payment-methods.test.ts` (24 tests) + E2E token creation test.
**Coverage: Covered** ✓

### US-04: MIT Recurring Payments — P0
| AC | Status | Evidence |
|----|--------|----------|
| CIT with setup_future_usage stores schemeReference | Covered | `payment-intents.test.ts` |
| MIT detection: card_token without three_d_secure | **Missing** | Handler exists but no dedicated MIT test |
| MIT: customerAgreement, schemeReference, skips FraudSight/3DS | **Missing** | No tests |
| MIT requires prior CIT → 400 | **Missing** | No tests |
| MIT with deleted token → 400 | **Missing** | No tests |
| Multiple MIT against same token | **Missing** | No tests |
**Coverage: Partial** ⚠️ (handler exists, 0 dedicated MIT tests)

### US-05: Refunds — P0
| AC | Status | Evidence |
|----|--------|----------|
| POST /v1/refunds full refund | **Missing** | No API-level refund route tests |
| Partial refund | **Missing** | No tests |
| GET /v1/refunds/{id} | **Missing** | No tests |
| Cumulative tracking, already_refunded, refund_exceeds_balance | **Missing** | No tests |
| DAL-level (portal) | Covered | `portal-integration.test.ts` |
**Coverage: Partial** ⚠️ (2 DAL tests, 0 API-level)

### US-06: Reconciliation — P1
All ACs covered by `queries-statements.test.ts` (32 tests) + E2E query test.
**Coverage: Covered** ✓

### US-07: FraudSight Toggle — P1
| AC | Status | Evidence |
|----|--------|----------|
| fraudsight.enabled toggle | Covered | `portal-auth.test.ts` |
| action_on_high_risk, exemption config | Covered | `portal-integration.test.ts` |
| Config changes take effect on payment flow | **Missing** | No integration test |
**Coverage: Partial** ⚠️

### E2E Tests (NEW)
| Test | Status |
|------|--------|
| Invalid API key → 401 | ✅ |
| Card payment (auth + flow + response format) | ✅ |
| Payment query (list returns data) | ✅ |
| Tokenization (error handling, card number absent) | ✅ |
**Coverage: E2E smoke** ✓ (5 tests)

## Summary

| User Story | Status | Tests |
|------------|--------|-------|
| US-01 Card Payment | ✅ Covered | 52 unit + E2E |
| US-02 3DS v2 | ✅ Covered | 22 |
| US-03 Tokenization | ✅ Covered | 24 unit + E2E |
| US-04 MIT | ⚠️ Partial | Handler exists, 0 tests |
| US-05 Refunds | ⚠️ Partial | 2 DAL tests, 0 API-level |
| US-06 Reconciliation | ✅ Covered | 32 unit + E2E |
| US-07 FraudSight | ⚠️ Partial | 49 portal tests, no payment-flow test |

## Gaps (17 tests needed)

### US-04 MIT (8 tests)
- MIT happy path → succeeded
- MIT skips FraudSight, DDC, 3DS
- MIT: customerAgreement with storedCardUsage "subsequent"
- MIT without prior CIT → 400
- MIT lacking setup_future_usage → 400
- Multiple MIT against same token
- MIT with deleted token → 400
- MIT with manual capture → requires_capture

### US-05 Refunds (9 tests)
- POST /v1/refunds full → succeeded
- POST /v1/refunds partial → succeeded  
- GET /v1/refunds/{id}
- already_refunded → 400
- refund_exceeds_balance → 400
- status_invalid → 400
- Cross-merchant → 404
- Idempotency-Key
- Amount validation (0, negative, > original)
