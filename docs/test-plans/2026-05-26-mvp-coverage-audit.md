# Test Plan: PayFac Payment Gateway MVP — Coverage Audit

## Source Document
- Input: [PRD: PayFac Payment Gateway MVP](../prd/payfac-payment-gateway-mvp-prd.md)
- Version: v1.0

## Existing Tests: 165 total (18 files)

| Test File | Tests | User Story |
|-----------|-------|------------|
| `payment-intents.test.ts` | 22 | US-01, US-04 |
| `payment-methods.test.ts` | 24 | US-03 |
| `capture-cancel.test.ts` | 27 | US-01 |
| `queries-statements.test.ts` | 32 | US-06 |
| `portal-auth.test.ts` | 23 | US-07 |
| `portal-integration.test.ts` | 26 | US-07 |
| `payment-intents-3ds.test.ts` | 11 | US-02 |
| `callback.test.ts` (3ds) | 6 | US-02 |
| `device-data.test.ts` (3ds) | 5 | US-02 |
| `route.test.ts` | 3 | US-01 |
| `auth.test.ts` | 5 | (infra) |
| `worldpay-client.test.ts` | 3 | (infra) |
| `validators.test.ts` | 14 | (infra) |
| `idempotency-*.test.ts` (4 files) | 30 | (infra) |
| `retry-policy.test.ts` | 9 | (infra) |
| `timeout-recovery.test.ts` | 7 | (infra) |
| `integration.test.ts` | 7 | (infra) |

## Acceptance Criteria Review

### US-01: Accept card payment (Happy Path) — P0
| AC | Status | Evidence |
|----|--------|----------|
| POST /v1/payment_intents with card → status "succeeded" | Covered | `payment-intents.test.ts::card CIT happy path → succeeded` |
| POST /v1/payment_intents with card_token → status "succeeded" | Covered | `payment-intents.test.ts::card token CIT → succeeded` |
| Auto-capture on `capture_method: automatic` | Covered | `payment-intents.test.ts::auto-capture` |
| Manual capture → requires_capture | Covered | `capture-cancel.test.ts::Full capture → succeeded`, `Partial capture` |
| Cancel authorization | Covered | `capture-cancel.test.ts::Cancel → canceled` |
| Response < 6 seconds (no 3DS) | Not tested | No performance test |
| PayFac auto-injection | Covered | `payment-intents.test.ts::PayFac injected` |
| Statement descriptor truncation | Covered | `payment-intents.test.ts::Narrative truncation` |

**Coverage: Covered** ✓

### US-02: 3DS security authentication — P0
| AC | Status | Evidence |
|----|--------|----------|
| three_d_secure.enabled: true (default) | Covered | `payment-intents-3ds.test.ts` |
| DDC required → requires_device_data | Covered | `device-data.test.ts` |
| Challenge required → requires_action | Covered | `callback.test.ts` |
| Frictionless → authenticated | Covered | `payment-intents-3ds.test.ts` |
| notEnrolled → no liability shift | Covered | `payment-intents-3ds.test.ts` |
| authenticationFailed → payment_failed | Covered | `payment-intents-3ds.test.ts` |
| three_d_secure.enabled: false → skip 3DS | Covered | `payment-intents-3ds.test.ts` |
| Challenge callback → verify → authorize → redirect | Covered | `callback.test.ts` |
| Liability shift tracked in response | Partial | Tests assert threeDSStatus but not liability shift flag |

**Coverage: Covered** ✓ (minor gap on liability shift flag)

### US-03: Save card info (tokenization) — P1
| AC | Status | Evidence |
|----|--------|----------|
| POST /v1/payment_methods → pm_xxx | Covered | `payment-methods.test.ts::returns 201` |
| Masked card response (brand, last4, expiry) | Covered | `payment-methods.test.ts::masked info` |
| Card number never in response | Covered | `payment-methods.test.ts::security tests` |
| Token href encrypted at rest | Covered | `payment-methods.test.ts::encryption tests` |
| GET /v1/payment_methods/{id} | Covered | `payment-methods.test.ts::GET returns` |
| Idempotent: same card → same pm_xxx | Covered | `payment-methods.test.ts::idempotency` |
| Invalid card → 400 | Covered | `payment-methods.test.ts::invalid card` |
| Expired card → 400 | Covered | `payment-methods.test.ts::expired card` |

**Coverage: Covered** ✓

### US-04: Subscription/MIT recurring payments — P0
| AC | Status | Evidence |
|----|--------|----------|
| CIT with setup_future_usage: "off_session" stores scheme.reference | Covered | `payment-intents.test.ts::stores schemeReference` |
| MIT: card_token without three_d_secure → MIT authorize | **Missing** | No test for MIT flow |
| MIT skips FraudSight, DDC, 3DS | **Missing** | No MIT flow code |
| MIT: customerAgreement with storedCardUsage: "subsequent" | **Missing** | No MIT flow code |
| MIT requires prior CIT | **Missing** | No MIT validation tests |
| Multiple MIT payments against same token | **Missing** | No tests |
| MIT with deleted token → 400 | **Missing** | No tests |

**Coverage: Missing** ❌ — The MIT handler (`handleMitPayment`) was removed during PR review cleanup. Only `setup_future_usage` storage is tested. The entire MIT payment flow has no tests.

### US-05: Refunds — P0
| AC | Status | Evidence |
|----|--------|----------|
| POST /v1/refunds → refund succeeded | **Missing** | No API-level refund route tests |
| Full refund (amount = original) | **Missing** | No tests |
| Partial refund (amount < original) | **Missing** | No tests |
| GET /v1/refunds/{id} | **Missing** | No tests |
| Cumulative refund tracking | **Missing** | No tests |
| already_refunded → 400 | **Missing** | No tests |
| refund_exceeds_balance → 400 | **Missing** | No tests |
| DAL-level refund creation (portal) | Covered | `portal-integration.test.ts::refund creates a refund record` |

**Coverage: Missing** ❌ — No API-level refund route tests exist. Only DAL-level portal tests.

### US-06: Reconciliation/Statements — P1
| AC | Status | Evidence |
|----|--------|----------|
| GET /v1/payment_intents list (scoped, paginated) | Covered | `queries-statements.test.ts` |
| GET /v1/payment_intents/{id} with full detail | Covered | `queries-statements.test.ts` |
| GET /v1/statements date range | Covered | `queries-statements.test.ts` |
| Date range > 31 days → 400 | Covered | `queries-statements.test.ts` |
| Pagination (has_more) | Covered | `queries-statements.test.ts` |

**Coverage: Covered** ✓

### US-07: Sub-merchant fraud toggle — P1
| AC | Status | Evidence |
|----|--------|----------|
| fraudsight.enabled toggle | Covered | `portal-auth.test.ts::FraudSight config toggle` |
| fraudsight.action_on_high_risk selector | Covered | `portal-integration.test.ts::FraudSight config` |
| fraudsight.exemption config | Covered | `portal-integration.test.ts::preserves existing keys` |
| Config changes take effect | **Missing** | No integration test verifying config affects payment flow |
| Merchant scoping (only own config) | Covered | `portal-auth.test.ts::tenant isolation` |

**Coverage: Partial** ⚠️

## No E2E Coverage

Zero end-to-end tests. Every test is unit/integration with mocked external deps.

## Summary

| User Story | Status | Tests |
|------------|--------|-------|
| US-01 Card Payment | ✅ Covered | 52 |
| US-02 3DS v2 | ✅ Covered | 22 |
| US-03 Tokenization | ✅ Covered | 24 |
| US-04 MIT Payments | ❌ Missing | 1 (setup only) |
| US-05 Refunds | ❌ Missing | 2 (DAL only) |
| US-06 Reconciliation | ✅ Covered | 32 |
| US-07 FraudSight Toggle | ⚠️ Partial | 49 (portal) |

## Required Follow-up Tests

### P0: US-04 MIT Payments (estimated 8 tests)
- MIT happy path: card_token without three_d_secure → MIT authorize → succeeded
- MIT skips FraudSight, DDC, 3DS (verify no calls)
- MIT: customerAgreement with storedCardUsage "subsequent" + schemeReference
- MIT without prior CIT → 400 mit_requires_cit
- MIT with CIT lacking setup_future_usage → 400 mit_not_setup
- Multiple MIT payments against same token
- MIT with deleted/invalid token → 400
- MIT with manual capture → requires_capture

### P0: US-05 Refunds (estimated 10 tests)
- POST /v1/refunds full refund → succeeded
- POST /v1/refunds partial refund → succeeded
- GET /v1/refunds/{id} → returns refund
- Full refund without amount → refunds full remaining
- Double full refund → 400 already_refunded
- Cumulative partials exceeding → 400 refund_exceeds_balance
- Refund on non-succeeded PI → 400 status_invalid
- Refund on different merchant PI → 404
- Idempotency-Key prevents duplicate refunds
- Refund amount validation (0, negative, > original)

### P1: E2E Smoke Tests (estimated 3 tests)
- CIT payment → confirmed by GET /{id}
- Tokenize + pay with token → confirmed by GET /{id}
- Refund flow: pay → refund → verify

### P1: US-07 Config Effect (estimated 2 tests)
- fraudsight.enabled: false → skips FraudSight assessment
- fraudsight.action_on_high_risk: flag → payment proceeds despite high risk
