# Test Plan: Admin Portal — Better Auth dual-role dashboard

## Source Document
- Input: GitHub Issue [#10](https://github.com/1aboveio/worldpay-api-tester/issues/10) — "Admin Portal — Better Auth dual-role dashboard with @fmmpay.com platform detection + merchant switching"
- Version/date: 2026-05-25
- Author/owner: N/A

## Scope
- In scope: Better Auth email/password auth flow (login/register), session enrichment with UserMerchant, merchant switching, role-based sidebar, platform admin pages (dashboard, merchants list/detail, payments, statements), merchant-scoped pages (dashboard, payments, payment detail, payment methods, refunds, statements, settings), FraudSight config toggles, role-based access control
- Out of scope: OAuth/Feishu login, 3DS flows, actual Worldpay API calls, real payment processing, idempotency, webhooks, email verification flows
- Assumptions: Prisma models (Merchant, ApiKey, PaymentMethod, PaymentIntent, Refund, Statement) exist from #1/#2/#3/#8/#9; Better Auth base models (user, session, account, verification) auto-managed; @repo/ui shadcn components exist; mock database expanded accordingly

## Acceptance Criteria

### Auth
- AC1: User can register with email/password at /portal/register; @fmmpay.com email → platform_admin UserMerchant for all existing merchants
- AC2: User can register with non-fmmpay email → merchant UserMerchant for assigned merchant
- AC3: User can login at /portal/login with valid email/password
- AC4: Invalid credentials → error message, no redirect
- AC5: Session persists across page navigations (cookie-based)
- AC6: Protected routes (/portal/*) redirect unauthenticated users to /portal/login
- AC7: Session context available via useSession() hook with enriched UserMerchant data

### Merchant Switching
- AC8: Single-merchant user auto-selects their only merchant; no switcher UI needed
- AC9: Multi-merchant user sees Select/DropdownMenu switcher with all linked merchants
- AC10: Switching merchants updates activeMerchantId and rescopes all data queries
- AC11: Platform admin switcher shows "Platform Overview" + all merchants
- AC12: Platform admin impersonating merchant → role context switches to "merchant"
- AC13: Platform admin can return to "Platform Overview" from impersonation mode

### Role-Based Navigation
- AC14: Platform admin sidebar shows: Dashboard, Merchants, Payments, Statements
- AC15: Merchant sidebar shows: Dashboard, Payments, Payment Methods, Refunds, Statements, Settings
- AC16: Sidebar shows merchant switcher in header area
- AC17: Cross-role access → 403 (e.g., merchant user trying to access /portal/merchants)

### Platform Admin Pages
- AC18: /portal/dashboard shows aggregate stats (total merchants, volume today, success rate)
- AC19: /portal/merchants shows Table of all merchants with name, entity, API key (masked), status, FraudSight badge
- AC20: /portal/merchants/[id] shows merchant info card + FraudSight config card
- AC21: FraudSight Switch toggle calls Server Action → DB updated → toast confirmation
- AC22: /portal/payments shows all payments Table with merchant filter, status badges, pagination
- AC23: /portal/statements shows statements Table with date range filter

### Merchant Pages
- AC24: /portal/dashboard shows scoped stats (own payments today, success rate, refunds)
- AC25: /portal/payments shows own payments with filters (status, date range)
- AC26: /portal/payments/[id] shows payment detail + capture/refund buttons
- AC27: /portal/payment-methods shows stored cards Table + add-card Dialog
- AC28: /portal/refunds shows own refunds Table
- AC29: /portal/statements shows own statements scoped to merchant entity
- AC30: /portal/settings shows API key (masked, copyable, regeneratable)

### Cross-Cutting
- AC31: All forms validate with Zod before Server Action execution
- AC32: All mutations show toast feedback via sonner
- AC33: Loading states use Skeleton components
- AC34: Empty states use Empty component
- AC35: Wrong merchant data access → 403/404 (tenant isolation)

## Test Matrix

| Scenario | AC | Test Level | Mock/Fake Policy | Setup/Input | Assertions |
|---|---|---|---|---|---|
| fmmpay registration → platform_admin | AC1 | Integration | Mock DB (UserMerchant) | POST /portal/register fmmpay email | UserMerchant rows for all merchants, role=platform_admin |
| Non-fmmpay registration → merchant | AC2 | Integration | Mock DB | POST /portal/register non-fmmpay email | UserMerchant row for assigned merchant, role=merchant |
| Valid login → session | AC3 | Integration | Mock DB | POST /portal/login valid creds | Session created, redirect, UserMerchant enriched |
| Invalid login → error | AC4 | Integration | Mock DB | POST /portal/login bad password | Error message, no session |
| Protected route redirect | AC6 | Integration | Mock DB | GET /portal/dashboard no session | Redirect to /portal/login |
| Session enrichment | AC7 | Integration | Mock DB | Login as platform admin | getSession() returns activeRole=platform_admin, isPlatformAdmin=true |
| Single merchant auto-select | AC8 | Integration | Mock DB | Login as merchant with 1 merchant | activeMerchantId auto-set |
| Multi-merchant switch rescope | AC9, AC10 | Integration | Mock DB | switchMerchant(merchantId) | activeMerchantId updated, data rescoped |
| Platform admin impersonation | AC11, AC12 | Integration | Mock DB | Platform admin switches to merchant | activeRole=merchant, activeMerchantId set |
| Platform admin return | AC13 | Integration | Mock DB | Impersonating → "Return to Platform" | activeRole=platform_admin, activeMerchantId=null |
| Role-based sidebar (admin) | AC14 | Integration | Mock DB | Platform admin session | Sidebar shows admin items |
| Role-based sidebar (merchant) | AC15 | Integration | Mock DB | Merchant session | Sidebar shows merchant items |
| Cross-role access denied | AC17 | Integration | Mock DB | Merchant user GET /portal/merchants | 403 or redirect |
| Admin dashboard stats | AC18 | Integration | Mock DB | Platform admin GET /portal/dashboard | Stat cards with aggregate data |
| FraudSight toggle update | AC21 | Integration | Mock DB | POST FraudSight toggle | DB updated, toast shown |
| Merchant dashboard scoped | AC24 | Integration | Mock DB | Merchant GET /portal/dashboard | Stats scoped to own merchant |
| Merchant cannot see other merchants data | AC35 | Integration | Mock DB | Merchant tries GET other merchant's PI | 403/404 |
| API key masked display | AC30 | Integration | Mock DB | GET /portal/settings | API key shown with mask |

## Mock And Integration Policy
- Mock acceptable: External Worldpay API calls (not applicable to portal)
- Integration required: DAL operations (real mock DB), auth flows, session enrichment, role-based access, route handlers
- External dependency strategy: All tests use in-memory mock DB (expanded to support User, UserMerchant, Refund models). No external HTTP calls.
- Mock-only exceptions: None — all portal behavior is tested against mock DB

## Required Automated Tests
- Integration: Auth flow, session enrichment, merchant switching, role-based access, page rendering (all ACs above)
- Unit: Zod validation schemas, utility functions

## Coverage Mapping
| Issue Requirement | AC | Test File | Status |
|---|---|---|---|
| Auth: login/register | AC1-AC7 | portal-auth.test.ts | Required |
| Merchant switching | AC8-AC13 | portal-merchant-switching.test.ts | Required |
| Role-based nav + access | AC14-AC17, AC35 | portal-rbac.test.ts | Required |
| Platform admin pages | AC18-AC23 | portal-admin-pages.test.ts | Required |
| Merchant pages | AC24-AC30 | portal-merchant-pages.test.ts | Required |
| Cross-cutting | AC31-AC34 | portal-cross-cutting.test.ts | Required |

## Behavior-First Validation
- ACs describe externally observable behavior (login, role assignment, page rendering, data scoping)
- Test matrix scenarios validate outcomes, durable state, contracts, side effects, permissions, and failure behavior
- Unit tests are scoped to public behavior (Zod schemas, DAL functions)
- Mock-only coverage does not bypass the core behavior under test
- Status: PASS

## Reviewer Checklist
- Every AC maps to an automated test or approved exception
- Tests assert behavior/state, not implementation details only
- Mocks/fakes do not bypass the core behavior being validated
- Auth isolation, role checks, and tenant scoping are covered

## Open Questions
- None
