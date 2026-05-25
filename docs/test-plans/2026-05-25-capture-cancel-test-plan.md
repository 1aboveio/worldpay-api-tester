# Test Plan: Manual Capture & Cancel

## Source Document
- Input: GitHub Issue [#7](https://github.com/1aboveio/worldpay-api-tester/issues/7) — "7. Manual Capture & Cancel — Two-step auth-then-capture flow"
- Version/date: 2026-05-25
- Author/owner: N/A

## Scope
- In scope: POST /api/v1/payment_intents/{id}/capture (full + partial), POST /api/v1/payment_intents/{id}/cancel
- Out of scope: Refunds, 3DS, MIT payments, confirm:false flow
- Assumptions: CIT core (#3) is implemented; PaymentIntent.status === "requires_capture" when capture_method is "manual"; linkData stores Worldpay HATEOAS _links; wpCall() and resolveMerchant() are dependency-injectable

## Acceptance Criteria

- AC1: POST /api/v1/payment_intents/{id}/capture (no body) → full capture → { status: "succeeded" }
- AC2: POST /api/v1/payment_intents/{id}/capture with { amount_to_capture: 150 } → partial capture → { status: "succeeded" }
- AC3: POST /api/v1/payment_intents/{id}/cancel → { status: "canceled" }
- AC4: CIT with capture_method: "manual" returns { status: "requires_capture" } (covered in #3 tests)
- AC5: Capture on already-succeeded PI returns 400 { error: { code: "already_captured" } }
- AC6: Cancel on already-canceled PI returns 400 { error: { code: "already_canceled" } }
- AC7: Partial capture exceeding original amount returns 400 { error: { code: "capture_exceeded" } }
- AC8: Capture/cancel use stored HATEOAS URLs, not manually constructed paths
- AC9: Capture/cancel on PI belonging to different merchant returns 404
- AC10: Idempotency-Key support for capture and cancel
- AC11: Worldpay refusal forwarded with refusal code in body (200)

## Test Matrix

| Scenario | Acceptance Criteria | Test Level | Mock/Fake Policy | Setup/Input | Assertions | Required Evidence |
|---|---|---|---|---|---|---|
| Full capture → succeeded | AC1 | Integration | Mock wpCall + resolveMerchant; real DAL | PI in requires_capture, no body, POST /capture | 200, status=succeeded, settle URL called, DB updated | CI test |
| Partial capture → succeeded | AC2 | Integration | Mock wpCall + resolveMerchant; real DAL | PI in requires_capture, amount_to_capture=150 | 200, status=succeeded, partialSettle URL called with value object | CI test |
| Cancel → canceled | AC3 | Integration | Mock wpCall + resolveMerchant; real DAL | PI in requires_capture, POST /cancel | 200, status=canceled, cancel URL called, DB updated | CI test |
| Already captured → 400 | AC5 | API | Mock resolveMerchant; real DAL | PI in succeeded state | 400, error.code=already_captured | CI test |
| Already canceled → 400 | AC6 | API | Mock resolveMerchant; real DAL | PI in canceled state | 400, error.code=already_canceled | CI test |
| Capture exceeded → 400 | AC7 | API | Mock resolveMerchant; real DAL | PI amount=250, amount_to_capture=300 | 400, error.code=capture_exceeded | CI test |
| Zero/negative capture → 400 | AC7 | API | Mock resolveMerchant; real DAL | PI amount=250, amount_to_capture=0/-1 | 400, error.code=capture_exceeded | CI test |
| Invalid status → 400 | AC5/AC6 | API | Mock resolveMerchant; real DAL | PI in processing/canceled (for capture) or processing/succeeded (for cancel) | 400, error.code=status_invalid | CI test |
| Wrong merchant → 404 | AC9 | API | Mock resolveMerchant; real DAL | PI with different merchantId | 404, error.code=not_found | CI test |
| HATEOAS URL usage | AC8 | Integration | Mock wpCall; verify path; real DAL | PI with linkData | wpCall called with exact stored HATEOAS URL, no constructed paths | CI test |
| Capture media type | — | Integration | Mock wpCall; real DAL | PI in requires_capture | wpCall called with "payments-v7" media type | CI test |
| Cancel media type | — | Integration | Mock wpCall; real DAL | PI in requires_capture | wpCall called with "payments-v7" media type | CI test |
| Idempotency-Key capture | AC10 | API | Mock resolveMerchant; real DAL | PI already succeeded + Idempotency-Key header | 200, returns current succeeded state | CI test |
| Idempotency-Key cancel | AC10 | API | Mock resolveMerchant; real DAL | PI already canceled + Idempotency-Key header | 200, returns current canceled state | CI test |
| Worldpay refusal (capture) | AC11 | Integration | Mock wpCall returns refusal; real DAL | PI in requires_capture | 200, status=requires_capture (unchanged), failure_code/message in body | CI test |
| Worldpay refusal (cancel) | AC11 | Integration | Mock wpCall returns refusal; real DAL | PI in requires_capture | 200, status=requires_capture (unchanged), failure_code/message in body | CI test |
| Auth error → 401 | — | API | Mock resolveMerchant throws | Invalid API key | 401, error.code=authentication_error | CI test |

## Mock And Integration Policy
- Mock acceptable: wpCall() (Worldpay HTTP client), resolveMerchant() (API key lookup) — both are external system boundaries
- Integration required: DAL (real Prisma mock), Zod validation, API route handler, status transition logic, HATEOAS URL routing
- External dependency strategy: Mock wpCall with deterministic responses; no real Worldpay calls
- Mock-only exceptions: None — all critical behavior is integration-tested with real DAL

## Required Automated Tests
- Integration: All 17 scenarios above (real DAL, mocked Worldpay)
- API: Validation and error handling tests (Zod schemas tested through route handler)

## Coverage Mapping
| PRD Requirement | Acceptance Criteria | Test Case/File | Status |
|---|---|---|---|
| REQ-CAP-01: Full capture | AC1 | POST capture (no body) → succeeded | Required |
| REQ-CAP-02: Partial capture | AC2 | POST capture {amount_to_capture} → succeeded | Required |
| REQ-CAP-03: Cancel authorization | AC3 | POST cancel → canceled | Required |
| REQ-CAP-04: Already captured error | AC5 | Capture on succeeded → already_captured | Required |
| REQ-CAP-05: Already canceled error | AC6 | Cancel on canceled → already_canceled | Required |
| REQ-CAP-06: Capture exceeded | AC7 | Amount > authorized → capture_exceeded | Required |
| REQ-CAP-07: Status invalid | AC5/AC6 | Wrong status → status_invalid | Required |
| REQ-CAP-08: HATEOAS URL usage | AC8 | Settle/cancel via stored URLs | Required |
| REQ-CAP-09: Merchant isolation | AC9 | Wrong merchant → 404 | Required |
| REQ-CAP-10: Idempotency | AC10 | Idempotency-Key → reuse result | Required |
| REQ-CAP-11: Worldpay refusal | AC11 | Refusal → 200 + forward code | Required |

## Behavior-First Validation
- ACs describe externally observable behavior, not internal functions or private methods.
- Test matrix scenarios validate outcomes, durable state, contracts, side effects, permissions, and failure behavior.
- Unit tests are scoped to public behavior, pure decision logic, or stable public contracts.
- Mock-only coverage does not bypass the core behavior under test.
- Status: PASS

## Reviewer Checklist
- Every AC maps to an automated test or approved exception.
- Tests assert behavior/state, not implementation details only.
- No tests are skipped/weakened to make CI pass.
- Mocks/fakes do not bypass the core behavior being validated.
- Mock-only coverage is rejected for stateful workflow, money movement, auth, idempotency, concurrency, event/outbox, or orchestrator recovery behavior unless explicitly approved.
- Failure, retry, duplicate, permission, and concurrency cases are covered where relevant.
- Test evidence is attached: CI link, command output, logs, screenshots, or traces.

## Open Questions
- None
