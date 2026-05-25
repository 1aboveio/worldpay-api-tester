# Test Plan: CIT Core Payment — Omni PaymentIntent Create + Confirm + Auto-Capture

## Source Document
- Input: GitHub Issue [#3](https://github.com/1aboveio/worldpay-api-tester/issues/3) — "3. CIT Card Payment — Core (no 3DS)"
- Version/date: 2026-05-25
- Author/owner: N/A

## Scope
- In scope: POST /api/v1/payment_intents (create+confirm CIT), GET /api/v1/payment_intents/{id}
- Out of scope: 3DS (not implemented in this slice), MIT, refunds, capture/cancel endpoints, idempotency persistence, confirm:false flow
- Assumptions: Merchant, ApiKey, PaymentMethod models exist from #1/#2; wpCall() helper and createToken() service exist; no real Worldpay HTTP calls in tests — all mocked

## Acceptance Criteria

- AC1: POST /api/v1/payment_intents with type:"card", valid card, confirm:true, capture_method:"automatic" returns 200 { status:"succeeded" }
- AC2: POST /api/v1/payment_intents with type:"card_token", valid pm_xxx, confirm:true returns 200 { status:"succeeded" }
- AC3: POST /api/v1/payment_intents with capture_method:"manual" returns 200 { status:"requires_capture" }
- AC4: Worldpay CIT request includes PayFac paymentFacilitator block with correct schemeId + subMerchant
- AC5: FraudSight assessment runs on every CIT payment; highRisk + block → payment_failed with failure_code:"high_risk"
- AC6: RiskProfile href is injected into CIT authorize request
- AC7: GET /api/v1/payment_intents/{id} returns stored PI with status and masked card
- AC8: Invalid amount/currency returns 400 with validation error
- AC9: setup_future_usage:"off_session" stores scheme.reference for later MIT use
- AC10: Description and metadata are stored locally, never sent to Worldpay
- AC11: Worldpay refusal returns payment_failed with refusal code
- AC12: Currency normalization: lowercase input → uppercase sent to Worldpay
- AC13: statement_descriptor → instruction.narrative.line1 (truncated 24 chars)

## Test Matrix

| Scenario | Acceptance Criteria | Test Level | Mock/Fake Policy | Setup/Input | Assertions | Required Evidence |
|---|---|---|---|---|---|---|
| Card CIT happy path → succeeded | AC1, AC4, AC6, AC12 | Integration | Mock wpCall + createToken; real DAL + Zod | type:card, amount:250, currency:"gbp", capture_method:"automatic" | status=succeeded, PI saved in DB, PayFac injected in CIT request, currency uppercase, riskProfile present | CI test |
| Card_token CIT → succeeded | AC2 | Integration | Mock wpCall; real DAL | type:card_token, token:"pm_abc", amount:100, currency:"usd" | status=succeeded, token href fetched from DB | CI test |
| Manual capture → requires_capture | AC3 | Integration | Mock wpCall; real DAL | type:card, capture_method:"manual" | status=requires_capture, requestAutoSettlement=false | CI test |
| FraudSight highRisk+block → payment_failed | AC5 | Integration | Mock wpCall returns highRisk+block; real DAL | type:card, normal input | status=payment_failed, failure_code=high_risk, no CIT authorize called | CI test |
| Worldpay refusal → payment_failed | AC11 | Integration | Mock wpCall authorize returns refused; real DAL | type:card, normal input | status=payment_failed, failure_code matches refusal | CI test |
| PayFac block injected in CIT request | AC4 | Integration | Mock wpCall; capture request payload; real DAL | type:card | CIT body has merchant.paymentFacilitator with schemeId + subMerchant | CI test |
| Invalid amount → 400 | AC8 | API | Mock nothing (validation fails before external calls) | amount:-1 or amount:0 | 400, error.code=validation_error | CI test |
| Invalid currency → 400 | AC8 | API | Mock nothing | currency:"ABCD" or currency:"" | 400, error.code=validation_error | CI test |
| setup_future_usage stores schemeReference | AC9 | Integration | Mock wpCall, real DAL | type:card, setup_future_usage:"off_session" | PI.schemeReference populated, customerAgreement in CIT body | CI test |
| GET returns correct PI with masked card | AC7 | Integration | Real DAL; PI created in DB | GET /{id} | 200, id matches, card.last4 shown, full card not in response | CI test |
| Description/metadata stored locally | AC10 | Integration | Mock wpCall; real DAL | description:"Order 123", metadata:{order_id:"456"} | PI.description and PI.metadata in DB, not in CIT request body | CI test |
| Statement descriptor truncated | AC13 | Integration | Mock wpCall; capture request | statement_descriptor:"This is a very long descriptor text" | CIT body has narrative.line1 truncated to 24 chars | CI test |

## Mock And Integration Policy
- Mock acceptable: wpCall() (Worldpay HTTP client), createToken() (tokenization service) — both are external system boundaries
- Integration required: DAL (real Prisma), Zod validation, API route handler, currency normalization, PayFac injection logic
- External dependency strategy: Mock wpCall with deterministic responses; no real Worldpay calls
- Mock-only exceptions: None — all critical behavior is integration-tested with real DAL

## Required Automated Tests
- Integration: All 12 scenarios above (real DAL, mocked Worldpay)
- API: Validation error tests (Zod schemas tested through route handler)

## Coverage Mapping
| PRD Requirement | Acceptance Criteria | Test Case/File | Status |
|---|---|---|---|
| REQ-CIT-01: Card CIT payment | AC1, AC4, AC6, AC12 | POST card → succeeded, PayFac injection, riskProfile, currency upcase | Required |
| REQ-CIT-02: Card token CIT payment | AC2 | POST card_token → succeeded | Required |
| REQ-CIT-03: Manual capture | AC3 | POST manual → requires_capture | Required |
| REQ-CIT-04: FraudSight blocking | AC5 | FraudSight highRisk+block → payment_failed | Required |
| REQ-CIT-05: Worldpay refusal | AC11 | Refusal → payment_failed + code | Required |
| REQ-CIT-06: Validation | AC8 | Invalid amount/currency → 400 | Required |
| REQ-CIT-07: Future usage | AC9 | setup_future_usage → schemeReference stored | Required |
| REQ-CIT-08: GET payment intent | AC7 | GET /{id} → PI + masked card | Required |
| REQ-CIT-09: Local-only fields | AC10 | description/metadata local, not sent to WP | Required |
| REQ-CIT-10: Statement descriptor | AC13 | narrative.line1 truncated | Required |

## Behavior-First Validation
- ACs describe externally observable behavior, not internal functions or private methods.
- Test matrix scenarios validate outcomes, durable state, contracts, side effects, permissions, and failure behavior.
- Unit tests are scoped to public behavior, pure decision logic, or stable public contracts; they are not function-by-function implementation coverage.
- Mock-only coverage does not bypass the core behavior under test.
- Any internal-function test requirement has an explicit justification that the unit is the public contract or the smallest stable behavior boundary.
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
