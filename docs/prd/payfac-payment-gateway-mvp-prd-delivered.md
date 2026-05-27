# PRD: PayFac Payment Gateway MVP

> **Status**: Delivered | **Date**: 2026-05-27 | **Tests**: 301 (239 unit + 55 API E2E + 7 browser E2E)

## Problem Statement

E-commerce sub-merchants need a Stripe-compatible payment API to accept card payments, manage recurring billing, handle 3DS authentication, process refunds, and reconcile statements. Instead of integrating directly with Worldpay's complex API, they need a unified gateway that handles tokenization, fraud screening, 3DS orchestration, and PayFac compliance injection transparently.

Platform operators need a portal to manage merchants, configure fraud settings, and view payment activity.

## Solution

A PayFac Payment Gateway that sits between sub-merchants and Worldpay Access Platform, exposing a Stripe-style REST API (`/v1/payment_intents`, `/v1/payment_methods`, `/v1/refunds`, `/v1/statements`) and a dual-role admin portal (platform admin + merchant self-service) built with Next.js 16, Better Auth, and shadcn/ui.

## User Stories

### Sub-merchant API

1. As an e-commerce developer, I want to accept card payments with a single API call, so that customers can pay on my website.
2. As a developer, I want to store card information (tokenize) for later use, so that returning customers don't need to re-enter card details.
3. As a developer, I want to process 3DS-authenticated payments automatically, so that I get liability shift protection against chargebacks.
4. As a subscription business, I want to charge stored cards off-session (MIT), so that I can automate recurring billing.
5. As a business, I want to capture authorized payments manually and cancel unused authorizations, so that I control when funds are settled.
6. As a business, I want to refund payments fully or partially, so that I can handle returns and disputes.
7. As a finance team member, I want to query payment history and pull daily statements, so that I can reconcile with Worldpay settlements.
8. As a developer, I want the API to be idempotent and recoverable, so that network failures don't cause double charges.
9. As a developer, I want clear error codes and messages, so that I can handle failures gracefully in my integration.

### Platform Admin Portal

10. As a PayFac operator, I want to log in and see all merchants with their status, so that I can monitor the platform.
11. As a PayFac operator, I want to toggle FraudSight per merchant (high-risk blocking, exemption settings), so that I can tune fraud protection per merchant risk profile.
12. As a PayFac operator, I want to view all payments across merchants with filters, so that I can investigate issues.
13. As a PayFac operator, I want to impersonate any merchant (switch to their view), so that I can troubleshoot from their perspective.
14. As a PayFac operator, I want to create my account via email/password registration restricted to company email domain, so that access is controlled.

### Merchant Self-Service Portal

15. As a merchant, I want to log in and see my own dashboard with payment stats, so that I understand my business performance.
16. As a merchant, I want to view my payment history, stored cards, refunds, and statements scoped to my account, so that I can manage my finances.
17. As a merchant, I want to view and regenerate my API keys, so that I can integrate securely.
18. As a merchant managing multiple stores, I want to switch between my linked merchants, so that I can manage all stores from one account.

## Implementation Decisions

### Architecture
- **Monorepo**: Turborepo + pnpm workspaces with packages: `database`, `dal`, `ui` (shadcn), `gateway-core`, `validators`, `worldpay-client`, `typescript-config`, `eslint-config`
- **App**: `apps/gateway` — Next.js 16 App Router with TypeScript strict
- **Database**: PostgreSQL via Prisma v7 with `@prisma/adapter-pg`
- **Auth**: Two domains — API Key (Bearer token) for sub-merchant REST API, Better Auth (email/password + session cookie) for portal
- **Deployment**: Cloud Run via Cloud Build, with GitHub Actions for CI

### API Design
- Stripe-compatible REST: `POST /v1/payment_intents` (omni endpoint supporting card, card_token, and MIT), `POST /v1/payment_methods`, `POST /v1/refunds`, `GET /v1/statements`
- Zod validation at all API boundaries
- Consistent error shape: `{ error: { code, message } }`
- Idempotency via `Idempotency-Key` header (24h TTL, per API key scope)
- PayFac compliance: `paymentFacilitator` block auto-injected from merchant config

### Payment Flow
- Card payments: instant tokenize via Worldpay Tokens v3 → FraudSight assessment → optional 3DS (DDC → authenticate → challenge callback) → CIT authorize → auto/manual capture
- MIT: detected when card_token without `three_d_secure` field → lookup prior CIT → merchantInitiatedTransactions
- All HATEOAS: subsequent operations (capture, cancel, refund) use URLs from stored `_links`

### Portal
- shadcn/ui components: Card, Button, Input, Label for forms; Sidebar for navigation; Table, Badge, Switch, Select for data display
- Better Auth with email/password, session enrichment via UserMerchant join table
- Email domain restriction: `ALLOWED_EMAIL_DOMAIN` env var (default `fmmpay.com`)
- Impersonation: platform admin sets `activeMerchantId` cookie → data rescoped
- Route groups: `(portal)` for authenticated pages, login/register outside group (no auth guard)

### Schema
- Merchant (id, name, entity, payFacConfig JSON, status)
- ApiKey (id, keyHash, prefix, merchantId, isActive)
- PaymentMethod (id, merchantId, tokenHref encrypted, brand, last4, expiry)
- PaymentIntent (id, merchantId, amount, currency, status enum 12 states, captureMethod, linkData JSON, threeDSStatus, failureCode/Message)
- Refund (id, merchantId, paymentIntentId, amount, reason, status, idempotencyKey)
- User, Session, Account, Verification (Better Auth)
- UserMerchant (userId, merchantId, role), AuditLog
- Statement (id, merchantId, periodStart/End)

## Testing Decisions

### Test Strategy
- **Unit/Integration**: 239 tests across 13 vitest files — mock Worldpay client + real in-memory DB mock
- **API E2E**: 55 tests via curl + jq — real Postgres container + app container, no Worldpay sandbox
- **Browser E2E**: 7 tests via Playwright — Chromium, zero console errors, CSS asset 404 detection, form interaction
- **Coverage**: 83.75% on business logic (`src/lib/`), gated at 80% in CI
- **CI**: GitHub Actions with two jobs — unit+coverage, browser E2E with Postgres service container

### What makes a good test
- Tests validate externally observable behavior (HTTP status, response shape, state transitions, error codes), not internal functions
- Worldpay client mocked at system boundary; auth + DB exercised with real/mock data
- Negative paths covered: invalid auth, validation errors, cross-tenant access, duplicate requests
- Browser E2E catches CSS/JS 404s, console errors, and visual breakage that curl tests miss

### Tested modules
- `payment-intent-service.ts` (86% coverage) — CIT, MIT, FraudSight, capture, cancel, list, detail
- `auth.ts` (97%) — API key hashing, extraction, resolution
- `schemas.ts` (100%) — Zod validation schemas
- `statements-service.ts` (100%) — validation + Worldpay proxy
- `idempotency-*.ts` — cache, middleware, recovery
- `portal-auth.test.ts` + `portal-integration.test.ts` (49 tests) — UserMerchant, FraudSight, tenant isolation
- `portal-pages.test.ts` (34 tests) — page render tests for all portal routes
- `dashboard-pages.test.ts` (6 tests) — dashboard scoping
- `refunds.test.ts` (11 tests) — full API-level refund coverage
- `capture-cancel.test.ts` (27 tests) — HATEOAS, error states

## Out of Scope
- Apple Pay / Google Pay
- Network Tokens
- Split Payments / Account Payouts
- Webhook push notifications (query-based only)
- Real Worldpay sandbox E2E (needs sandbox credentials)
- Mobile-responsive design (desktop-first)
- Multi-language i18n
- Rate limiting / DDoS protection
- Audit log retention policies

## Known Gaps
- 2 statement E2E tests fail in local podman (race condition with DB readiness) — pass in CI with Postgres service container
- Liability shift flag not explicitly asserted in 3DS response (status is asserted)
- Logout action has no test
- Non-fmmpay email rejection has no test (behavior was recently added)
- Payment response time < 6s not tested (needs Worldpay sandbox)
