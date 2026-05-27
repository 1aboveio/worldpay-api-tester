# Test Criteria Audit: PayFac Payment Gateway MVP

## Source
- Input: [PRD](../prd/payfac-payment-gateway-mvp-prd.md) + [Design](../design/payfac-payment-gateway-mvp-design.md)
- Date: 2026-05-27
- Test suite: 238 unit/integration (vitest) + 7 browser E2E (Playwright) + 53 API E2E (curl)

## Test Level Definitions Used
| Level | Tool | Verifies |
|-------|------|---------|
| Unit | vitest (mock DAO) | Pure logic, validation, error handling |
| Integration | vitest (mock DB) | State transitions, DAL, auth flow |
| API E2E | curl + jq | HTTP contract, auth, response shape |
| Browser E2E | Playwright | Page rendering, CSS, JS, console errors, form interaction |
| Journey E2E | Playwright + real DB | Cross-page flows, session persistence |

## Per-Journey Audit

### Sub-merchant API (10 journeys)

#### J1: Card payment (raw card → tokenize → authorize)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| API returns status on valid card | Covered | Integration | `payment-intents.test.ts` (22 tests) |
| PayFac info auto-injected | Covered | Integration | Same file |
| Invalid card → 400 | Covered | Integration | `payment-methods.test.ts` |
| Card number never in response | Covered | API E2E | `e2e-test.sh` |
| Statement descriptor truncation | Covered | Integration | `payment-intents.test.ts` |
| Response < 6 seconds | **Missing** | Performance | No perf test |
| Invalid API key → 401 | Covered | API E2E | `e2e-test.sh` |

#### J2: Stored token payment (pm_xxx → authorize)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Payment with card_token → succeeded | Covered | Integration | `payment-intents.test.ts` |
| Masked card in response | Covered | Integration | Same file |
| Token payment E2E | **Partial** | API E2E | `e2e-test.sh` (only checks `payment_failed` due to no WP creds) |

#### J3: 3DS payment (DDC → authenticate → challenge)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| DDC init → requires_device_data | Covered | Integration | `tests/three-ds/device-data.test.ts` |
| Authenticate → requires_action | Covered | Integration | `tests/three-ds/callback.test.ts` |
| Frictionless → authenticated | Covered | Integration | `tests/three-ds/payment-intents-3ds.test.ts` |
| Liability shift in response | **Partial** | Integration | Tests check status but not liability flag |
| 3DS E2E | **Partial** | API E2E | `e2e-test.sh` (only checks `payment_failed`) |

#### J4: Manual capture + cancel
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Manual capture → requires_capture | Covered | Integration | `capture-cancel.test.ts` (27 tests) |
| Full capture → succeeded | Covered | Integration | Same file |
| Partial capture → succeeded | Covered | Integration | Same file |
| Cancel → canceled | Covered | Integration | Same file |
| HATEOAS links used | Covered | Integration | Same file |

#### J5: MIT recurring (CIT setup → MIT charge)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| CIT stores schemeReference | Covered | Integration | `payment-intents.test.ts` |
| MIT detection: no three_d_secure → MIT | Covered | Integration | `payment-intents.test.ts` (6 MIT tests) |
| MIT skips FraudSight/3DS | Covered | Integration | Same file |
| MIT without prior CIT → 400 | Covered | Integration | Same file |
| Multiple MIT against same token | Covered | Integration | Same file |
| MIT manual capture | Covered | Integration | Same file |
| MIT E2E | **Missing** | Journey E2E | No end-to-end MIT flow test |

#### J6: Refund (pay → refund full/partial)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Full refund → succeeded | Covered | Integration | `refunds.test.ts` (11 tests) |
| Partial refund → succeeded | Covered | Integration | Same file |
| already_refunded → 400 | Covered | Integration | Same file |
| refund_exceeds_balance → 400 | Covered | Integration | Same file |
| cross-merchant → 404 | Covered | Integration | Same file |
| idempotency | Covered | Integration | Same file |
| Refund E2E | **Missing** | Journey E2E | No end-to-end pay→refund test |

#### J7: Payment query (list + detail)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| List scoped + paginated | Covered | Integration | `queries-statements.test.ts` (32 tests) |
| Detail with 3DS + link_data | Covered | Integration | Same file |
| has_more logic | Covered | Integration | Same file |
| Query E2E | Covered | API E2E | `e2e-test.sh` |

#### J8: Statement reconciliation
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Date range validation | Covered | Integration | `queries-statements.test.ts` |
| Range > 31 days → 400 | Covered | Integration | Same file |
| Pagination | Covered | Integration | Same file |
| Statement E2E | **Missing** | API E2E | No E2E test |

#### J9: Tokenize card (pm_xxx)
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| POST → pm_xxx | Covered | Integration | `payment-methods.test.ts` (24 tests) |
| Masked response | Covered | Integration | Same file |
| Encryption at rest | Covered | Integration | Same file |
| Idempotency | Covered | Integration | Same file |
| Tokenize E2E | Covered | API E2E | `e2e-test.sh` |

#### J10: Invalid auth / errors
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Missing API key → 401 | Covered | API E2E | `e2e-test.sh` |
| Invalid API key → 401 | Covered | API E2E | Same file |
| Validation errors → 400 | Covered | Integration | `route.test.ts` |

### Merchant Portal (5 journeys)

#### J11: Login → dashboard → own stats
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Login page renders | Covered | Browser E2E | `login.spec.ts` (7 tests) |
| Form inputs work | Covered | Browser E2E | Same file |
| No console errors | Covered | Browser E2E | Same file |
| CSS assets load | Covered | Browser E2E | Same file |
| Login → dashboard flow | **Missing** | Journey E2E | No cross-page login flow |
| Dashboard scoping | Covered | Unit | `dashboard-pages.test.ts` |

#### J12: Login → payments → own payments
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Payments page renders | Covered | Unit | `portal-pages.test.ts` |
| Scoped to merchant | Covered | Unit | Same file |
| Payments page in browser | **Missing** | Browser E2E | No Playwright test |

#### J13: Login → payment methods → stored cards
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Payment methods renders | Covered | Unit | `portal-pages.test.ts` |
| In browser | **Missing** | Browser E2E | No Playwright test |

#### J14: Login → refunds → own refunds
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Refunds page renders | Covered | Unit | `portal-pages.test.ts` |
| In browser | **Missing** | Browser E2E | No Playwright test |

#### J15: Login → settings → API keys
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Settings page renders | Covered | Unit | `portal-pages.test.ts` |
| API key masked | Covered | Unit | Same file |
| In browser | **Missing** | Browser E2E | No Playwright test |

### Platform Admin Portal (10 journeys)

#### J16: Register fmmpay → platform_admin
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| fmmpay → platform_admin role | Covered | Integration | `portal-auth.test.ts` |
| All merchants linked | Covered | Integration | Same file |
| Registration E2E | **Partial** | API E2E | `e2e-test.sh` (registers but doesn't test role result) |

#### J17: Login → dashboard → all stats
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Admin dashboard renders | Covered | Unit | `dashboard-pages.test.ts` |
| Aggregate stats | Covered | Unit | Same file |
| In browser | **Missing** | Browser E2E | No Playwright admin dashboard test |

#### J18: Login → merchants list → detail
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Merchant list renders | Covered | Unit | `portal-pages.test.ts` |
| Merchant detail renders | Covered | Unit | Same file |

#### J19: Toggle FraudSight per merchant
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Toggle enabled flag | Covered | Integration | `portal-auth.test.ts` |
| Preserve existing keys | Covered | Integration | Same file |
| Effect on payment flow | **Missing** | Integration | No test verifying config affects payments |

#### J20: Login → payments → all payments
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Admin payments list renders | Covered | Unit | `portal-pages.test.ts` |
| Merchant filter | Covered | Unit | Same file |

#### J21: Impersonate merchant
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Switch to merchant | Covered | Integration | `portal-auth.test.ts` |
| E2E impersonation | Covered | API E2E | `e2e-test.sh` (cookie manipulation) |

#### J22: Return to platform
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Return to platform | Covered | Integration | `portal-auth.test.ts` |
| Audit log | Covered | Integration | `portal-integration.test.ts` |
| E2E return | Covered | API E2E | `e2e-test.sh` |

#### J23: Register non-fmmpay → merchant
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Non-fmmpay → merchant | Covered | Integration | `portal-auth.test.ts` |
| E2E | Covered | API E2E | `e2e-test.sh` |

#### J24: Login merchant → only own data
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Dashboard scoped | Covered | Unit | `dashboard-pages.test.ts` |
| Payments scoped | Covered | Unit | `portal-pages.test.ts` |
| Cross-tenant isolation | Covered | Integration | `portal-auth.test.ts` |

#### J25: Multi-merchant switching
| AC | Status | Level | Evidence |
|----|--------|-------|----------|
| Multiple merchants visible | Covered | Integration | `portal-auth.test.ts` |
| Switch between them | Covered | Integration | Same file |
| E2E switching | Covered | API E2E | `e2e-test.sh` |

## Summary

| Category | Covered | Partial | Missing | Total |
|----------|:------:|:------:|:------:|:-----:|
| Sub-merchant API (J1-J10) | 6 | 3 | 1 | 10 |
| Merchant Portal (J11-J15) | 1 | 0 | 4 | 5 |
| Platform Admin (J16-J25) | 6 | 1 | 3 | 10 |
| **Total** | **13** | **4** | **8** | **25** |

### Gap Priorities

**P0 — Missing (8 gaps):**
| Gap | Journey | Needed Level |
|-----|---------|-------------|
| J6: Refund E2E (pay→refund→verify) | J6 | Journey E2E |
| J5: MIT E2E (CIT setup→MIT→verify) | J5 | Journey E2E |
| J19: FraudSight config affects payments | J19 | Integration |
| J11: Login→dashboard Journey E2E | J11 | Journey E2E |
| J12-J15: Payments/PaymentMethods/Refunds/Settings browser E2E | J12-J15 | Browser E2E |
| J17: Admin dashboard browser E2E | J17 | Browser E2E |
| J1: Payment response time < 6s | J1 | Performance |
| J8: Statement E2E | J8 | API E2E |

**P1 — Partial (4 gaps):**
| Gap | Needed |
|-----|--------|
| J3: Liability shift flag in 3DS response | Integration assertion |
| J2: Token payment with real WP sandbox | API E2E (needs creds) |
| J16: Registration role verification in E2E | API E2E |
| J3: 3DS full flow with real WP sandbox | Journey E2E (needs creds) |

### Merge Gates (enforced)

- [x] Unit tests: 238/238 passing (vitest)
- [x] Coverage: 83.75% statements (threshold 80%)
- [x] Browser E2E: 7/7 passing (Playwright, CI green)
- [x] API E2E: 53/53 passing (curl)
- [ ] Journey E2E: 0 tests (gap — J5, J6, J11)
- [ ] Performance: 0 tests (gap — J1)
