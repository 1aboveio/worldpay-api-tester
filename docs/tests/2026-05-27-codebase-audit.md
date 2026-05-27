# Test Criteria Audit: PayFac Payment Gateway MVP — 2026-05-27

## Source
- Input: [PRD](../prd/payfac-payment-gateway-mvp-prd.md) + [Design](../design/payfac-payment-gateway-mvp-design.md)
- Test suite: 239 unit/integration + 55 API E2E + 7 browser E2E = **301 total**

## Per-Feature Audit

### Feature 1: API Key Auth
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Missing API key → 401 | Covered | Integration + API E2E | `route.test.ts`, `e2e-test.sh` |
| Invalid API key → 401 | Covered | Integration + API E2E | Same |
| Valid key resolves merchant + entity | Covered | Integration + API E2E | `payment-intents.test.ts`, E2E |
| Merchant inactive → 401 | Covered | Integration | `middleware.test.ts` (gap-test) |

✅ Covered

### Feature 2: Tokenization (POST/GET /v1/payment_methods)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| POST valid card → pm_xxx + masked info | Covered | Integration | `payment-methods.test.ts` (24 tests) |
| Card number never in response | Covered | Integration + API E2E | Same + `e2e-test.sh` |
| Token href encrypted at rest | Covered | Integration | Same |
| GET /{id} → masked card | Covered | Integration | Same |
| Idempotency (same card → same pm_xxx) | Covered | Integration | Same |
| Invalid card → 400 | Covered | Integration | Same |
| Expired card → 400 | Covered | Integration | Same |
| Cross-merchant → 404 | Covered | Integration | Same |

✅ Covered

### Feature 3: CIT Card Payment (POST /v1/payment_intents)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Card payment → status succeeded | Covered | Integration | `payment-intents.test.ts` (22 tests) |
| Card_token payment → succeeded | Covered | Integration | Same |
| PayFac auto-injected | Covered | Integration | Same |
| FraudSight assessment called | Covered | Integration | Same (AC1) |
| highRisk + block → payment_failed | Covered | Integration | Same (FraudSight test added) |
| riskProfile injected into CIT authorize | Covered | Integration | Same (AC6) |
| Auto-capture (automatic) | Covered | Integration | `capture-cancel.test.ts` |
| Manual capture → requires_capture | Covered | Integration | Same |
| Currency normalization | Covered | Integration | `payment-intents.test.ts` |
| Statement descriptor truncation | Covered | Integration | Same |
| setup_future_usage stores schemeReference | Covered | Integration | Same |
| Validation errors → 400 | Covered | Integration | `route.test.ts` |

✅ Covered

### Feature 4: 3DS v2
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| DDC init → requires_device_data | Covered | Integration | `tests/three-ds/device-data.test.ts` |
| Authenticate frictionless → authenticated | Covered | Integration | `tests/three-ds/payment-intents-3ds.test.ts` |
| Authenticate challenged → requires_action | Covered | Integration | `tests/three-ds/callback.test.ts` |
| notEnrolled/unavailable → no liability shift | Covered | Integration | Same |
| authenticationFailed → payment_failed | Covered | Integration | Same |
| 3DS disabled → skip | Covered | Integration | Same |
| Challenge callback → verify → authorize | Covered | Integration | Same |
| Liability shift flag in response | **Partial** | Integration | Status asserted, not shift flag |

⚠️ Partial (minor gap on liability shift flag)

### Feature 5: MIT Recurring Payments
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| CIT stores schemeReference | Covered | Integration | `payment-intents.test.ts` |
| MIT detection (no three_d_secure) | Covered | Integration | Same (6 MIT tests) |
| MIT skips FraudSight, DDC, 3DS | Covered | Integration | Same |
| MIT without prior CIT → 400 | Covered | Integration | Same |
| MIT lacking setup_future_usage → 400 | Covered | Integration | Same |
| Multiple MIT against same token | Covered | Integration | Same |
| MIT manual capture → requires_capture | Covered | Integration | Same |
| MIT E2E | Covered | API E2E | `e2e-test.sh` (US-09) |

✅ Covered

### Feature 6: Capture & Cancel
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Full capture → succeeded | Covered | Integration | `capture-cancel.test.ts` (27 tests) |
| Partial capture → succeeded | Covered | Integration | Same |
| Cancel → canceled | Covered | Integration | Same |
| already_captured → 400 | Covered | Integration | Same |
| already_canceled → 400 | Covered | Integration | Same |
| capture_exceeded → 400 | Covered | Integration | Same |
| Cross-merchant → 404 | Covered | Integration | Same |
| HATEOAS links used (not constructed) | Covered | Integration | Same |

✅ Covered

### Feature 7: Refunds
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Full refund → succeeded | Covered | Integration | `refunds.test.ts` (11 tests) |
| Partial refund → succeeded | Covered | Integration | Same |
| already_refunded → 400 | Covered | Integration | Same |
| refund_exceeds_balance → 400 | Covered | Integration | Same |
| status_invalid → 400 | Covered | Integration | Same |
| Cross-merchant → 404 | Covered | Integration | Same |
| Idempotency | Covered | Integration | Same |
| Amount validation (0/negative) | Covered | Integration | Same |
| Refund E2E | Covered | API E2E | `e2e-test.sh` (conditional) |

✅ Covered

### Feature 8: Payment Queries & Statements
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| List scoped + paginated | Covered | Integration | `queries-statements.test.ts` (32 tests) |
| Detail with 3DS + link_data | Covered | Integration | Same |
| created_since filter | Covered | Integration | Same |
| has_more logic | Covered | Integration | Same |
| Statement date range | Covered | Integration + API E2E | Same + `e2e-test.sh` |
| Range > 31 days → 400 | Covered | API E2E | `e2e-test.sh` |
| to before from → 400 | Covered | API E2E | Same |
| Pagination | Covered | Integration | Same |

✅ Covered

### Feature 9: Idempotency & Recovery
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Idempotency-Key caches response | Covered | Unit | `src/lib/__tests__/idempotency-*.test.ts` |
| TTL expiry works | Covered | Unit | Same |
| LRU eviction | Covered | Unit | Same |
| Timeout → /events recovery | Covered | Unit | `timeout-recovery.test.ts` |
| 5xx → no retry, mark unknown | Covered | Unit | Same |
| 4xx → no retry | Covered | Unit | `retry-policy.test.ts` |

✅ Covered

### Feature 10: Portal Authentication (Better Auth)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Login page renders without console errors | Covered | Browser E2E | `login.spec.ts` |
| Login form inputs work | Covered | Browser E2E | Same |
| CSS assets load (no 404) | Covered | Browser E2E | `portal.spec.ts` |
| Register page renders | Covered | Browser E2E | Not tested — **Missing** |
| fmmpay email → platform_admin | Covered | Integration | `portal-auth.test.ts` |
| **Non-fmmpay email rejected** | **Missing** | Integration | NO test for ACCESS_DENIED |
| **ALLOWED_EMAIL_DOMAIN respected** | **Missing** | Integration | No test for env var behavior |
| Session enrichment (UserMerchant) | Covered | Integration | `portal-auth.test.ts` |
| Login redirect → dashboard | Covered | Unit | `dashboard-pages.test.ts` |
| Logout | **Missing** | Any | No test |

❌ 3 gaps: non-fmmpay rejection, ALLOWED_EMAIL_DOMAIN, logout

### Feature 11: Portal Dashboard
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Admin sees Platform overview | Covered | Unit | `dashboard-pages.test.ts` |
| Admin sees aggregate stats | Covered | Unit | Same |
| Merchant sees scoped stats | Covered | Unit | Same |
| Null session → no render | Covered | Unit | Same |
| Admin dashboard (browser) | Covered | Browser E2E | `portal.spec.ts` (page load) |

✅ Covered

### Feature 12: Portal Pages
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Merchants list renders | Covered | Unit | `portal-pages.test.ts` (34 tests) |
| Payments list renders (admin + merchant) | Covered | Unit | Same |
| Payment methods renders | Covered | Unit | Same |
| Refunds list renders | Covered | Unit | Same |
| Settings renders (API key masked) | Covered | Unit | Same |
| Statements renders | Covered | Unit | Same |
| Auth guard redirects (all pages) | Covered | Unit | Same |
| Empty states | Covered | Unit | Same |
| Merchant impersonation | Covered | Integration + API E2E | `portal-auth.test.ts` + `e2e-test.sh` |

✅ Covered

### Feature 13: FraudSight Config Toggle
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Toggle enabled flag | Covered | Integration | `portal-auth.test.ts` |
| Preserve existing keys | Covered | Integration | `portal-integration.test.ts` |
| highRisk + block → payment_failed | Covered | Integration | `payment-intents.test.ts` (FraudSight test) |

✅ Covered

## Gap Summary

| # | Gap | Severity | Test Level Needed |
|---|-----|:---:|---|
| 1 | Non-fmmpay email rejected by login | P0 | Integration |
| 2 | Non-fmmpay email rejected by register | P0 | Integration |
| 3 | ALLOWED_EMAIL_DOMAIN env var respected | P1 | Integration |
| 4 | Logout action tested | P1 | Integration |
| 5 | Register page browser E2E | P2 | Browser E2E |
| 6 | Liability shift flag in 3DS response | P2 | Integration (assertion) |

**Also: 2 tests test wrong behavior** — `portal-auth.test.ts` AC2 "assigns merchant role for non-fmmpay email" tests a feature that no longer exists (non-fmmpay registration was removed). These tests pass but validate dead behavior. Should be updated to test the new ACCESS_DENIED rejection.

## Merge Gates

- [x] Unit: 239/239 passing (vitest)
- [x] Coverage: 83.75% (threshold 80%)
- [x] Browser E2E: 7/7 passing (Playwright)
- [x] API E2E: 55/55 passing (curl)
- [x] CI: GitHub Actions green
- [ ] Email domain restriction: 0 tests (gap)
- [ ] Outdated tests: 2 tests validate removed behavior
