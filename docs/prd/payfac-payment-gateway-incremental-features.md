# PRD: PayFac Payment Gateway — Incremental Features

> **Parent PRD**: [PayFac Payment Gateway MVP](./payfac-payment-gateway-mvp-prd.md)  
> **Status**: Delivered | **Date**: 2026-05-27

## Problem Statement

The MVP covered the sub-merchant REST API (payment intents, tokenization, 3DS, MIT, refunds, queries, statements) but lacked:
- An admin portal for platform operators and merchants
- Email domain-based access control
- Comprehensive end-to-end testing (browser-level)
- CI coverage gates

## Solution

Add a dual-role admin portal with Better Auth + shadcn/ui, restrict access to company email domain via env var, implement browser E2E with Playwright, and enforce coverage thresholds in CI.

## User Stories

### Portal Authentication
1. As a platform operator, I want to register and log in using my company email, so that access is restricted to authorized personnel.
2. As a platform operator, I want non-company emails to be rejected at both login and registration, so that unauthorized users cannot access the portal.
3. As a platform operator, I want the allowed email domain to be configurable via environment variable (`ALLOWED_EMAIL_DOMAIN`), so that it can be changed per deployment without code changes.

### Dashboard
4. As a platform admin, I want to see a dashboard with aggregate stats (total merchants, payments today, success rate) across all merchants, so that I can monitor platform health at a glance.
5. As a merchant, I want to see my own dashboard scoped to my merchant with payments today, total payments, and refunds, so that I understand my business performance.
6. As a platform admin, I want the dashboard to render with proper styling using shadcn/ui components (Card, Table, Badge), so that the UI is consistent and professional.
7. As a merchant, I want the dashboard's "Total Merchants" card hidden since it's not relevant to my view.

### Portal Pages
8. As a platform admin, I want to see a list of all merchants with name, entity, status badges, and FraudSight configuration, so that I can manage the platform.
9. As a platform admin, I want to click into a merchant detail page to view and toggle their FraudSight settings (enabled, high-risk action, exemption), so that I can configure fraud protection per merchant.
10. As a platform admin, I want to view all payments across merchants with filters, so that I can investigate transactions.
11. As a merchant, I want to view my payment methods (stored cards), refunds, statements, and API keys scoped to my merchant, so that I can self-serve.
12. As a platform admin, I want to impersonate any merchant by switching my active context, and return to platform overview, so that I can troubleshoot from the merchant's perspective.
13. As a user with multiple linked merchants, I want to switch between them via a sidebar dropdown, so that I can manage all stores from one login.

### Portal UI Standards
14. As a user, I want the login and register pages to use shadcn/ui Card, Input, Button, and Label components with proper composition (CardHeader/CardTitle/CardContent/CardFooter), so that the UI follows design system conventions.
15. As a user, I want the portal to apply Tailwind CSS semantic tokens (bg-background, text-muted-foreground, bg-primary) correctly, so that the theme is consistent.

### Browser E2E Testing
16. As a developer, I want Playwright browser tests that verify login page rendering without console errors, so that JavaScript bundle issues are caught before deploy.
17. As a developer, I want browser tests that verify static assets (CSS/JS chunks) return HTTP 200 not 404, so that styling breakage is caught before deploy.
18. As a developer, I want browser tests that verify shadcn CSS is actually applied (non-transparent background on card, non-zero border on input), so that visual regression is caught before deploy.
19. As a developer, I want browser tests that verify form interaction (typing email, clicking submit), so that client-side JavaScript works.

### CI Coverage Gates
20. As a developer, I want vitest coverage thresholds enforced in CI (80% statements, 70% branches, 80% functions on business logic), so that coverage doesn't regress.
21. As a developer, I want browser E2E to run automatically on push/PR alongside unit tests with a Postgres service container, so that the full test suite gates every change.

## Implementation Decisions

### Email Domain Restriction
- `ALLOWED_EMAIL_DOMAIN` env var (default `fmmpay.com`) controls which emails can login/register
- `isFmmpayEmail()` function in auth-actions checks `email.endsWith(@${domain})`
- Both `loginAction` and `registerAction` return `ACCESS_DENIED` error for non-matching emails
- Registration always assigns `platform_admin` role (merchant role removed since only internal users can register)
- Register page UI text updated: "Only @fmmpay.com accounts are permitted"

### Portal Layout
- Login and Register pages moved outside `(portal)` route group to avoid auth guard infinite redirect
- Portal layout uses `getSession()` for auth guard; redirects to `/login` if no session
- Fake session removed from auth-server.ts; production session enrichment via Better Auth + UserMerchant
- Zod schemas (loginSchema, registerSchema, ActionResult type) extracted to `auth-schemas.ts` — `auth-actions.ts` (`"use server"` file) only exports async functions

### shadcn/ui
- Components installed: Card, Button, Input, Label via `npx shadcn add`
- `components.json` in gateway app root
- `globals.css` with CSS variables imported in root layout
- Login page: CardHeader → CardTitle "PayFac Portal", CardDescription "Sign in to your account", CardContent with Input + Label fields, CardFooter with register link
- Register page: same Card composition, email hint text updated

### Browser E2E
- Playwright with Chromium, 7 tests across 2 spec files
- `login.spec.ts`: console error check, asset 404 check, CSS styling applied, heading visibility, button enabled, form input, error on invalid login
- `portal.spec.ts`: page load without console errors, page load without 404 assets
- `playwright.config.ts`: baseURL `localhost:3003`, webServer auto-start (local only, skipped in CI)
- CI: server started manually with Postgres service container, Playwright runs against it

### Coverage
- vitest `@vitest/coverage-v8` provider, thresholds: 80% statements, 70% branches, 80% functions
- Scope: `src/lib/**/*.ts` (business logic only, excludes UI components tested by browser E2E)
- Coverage report generated via `vitest run --coverage`, fails CI if below threshold
- Additional lib tests (`coverage-gap.test.ts`) for utils, worldpay, middleware, auth-server

### Statement Route
- Wired to real auth (was throwing stub) — `resolveMerchantFromApiKey` → resolves merchant
- Added statement E2E tests: date range validation (31 days max), to-before-from rejection

### FraudSight Integration Test
- Added `payment-intents.test.ts` test: highRisk + actionOnHighRisk block → payment_failed with failure_code high_risk
- Validates FraudSight config actually affects payment flow

## Out of Scope
- Non-fmmpay email registration (removed — only internal users)
- Mobile-responsive portal design (desktop-first)
- Real-time dashboard updates (static SSR)
- Webhook configuration UI
- Merchant onboarding flow (API-key only, no self-service signup)

## Known Gaps
- Logout action has no automated test
- Browser E2E doesn't test full registration → login → dashboard journey (only server-rendered page checks)
- Statement E2E intermittently fails in local podman (race condition with DB readiness) — passes in CI
