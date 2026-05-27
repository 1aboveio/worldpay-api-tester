# Browser E2E Test Plan: PayFac Payment Gateway Portal

## Source
- Static asset 404 bug (CSS/JS chunks not served in standalone output)
- Audit finding: 53 curl-based E2E tests exist but zero browser tests

## Test Levels Required

| Level | Tool | What it catches | Current state |
|-------|------|----------------|---------------|
| Unit | vitest | DAL logic, route handlers, page component structure | ✅ 222 passing |
| API Integration | curl + jq | HTTP status, JSON shape, auth guards | ✅ 53 passing |
| **Browser E2E** | Playwright | Visual rendering, CSS loading, JS execution, form interaction, navigation | ❌ Missing |
| Visual regression | Playwright screenshots | CSS breakage, layout shifts | ❌ Missing |

## Browser E2E Test Scenarios

### 1. Static Asset Loading (catches the CSS 404 bug)
- [ ] `/_next/static/chunks/*.css` returns 200, not 404
- [ ] `/_next/static/chunks/*.js` returns 200, not 404
- [ ] Browser console has zero errors after page load
- [ ] Page has non-zero CSS coverage (styles actually applied)

### 2. Login Page Rendering
- [ ] Navigate to `/login` — page loads without console errors
- [ ] `bg-background` CSS class is applied to body
- [ ] `rounded-lg` CSS class is applied to the card
- [ ] Input fields have border styling (`border-input` class present)
- [ ] Button has background color (`bg-primary` class present)
- [ ] Page title "PayFac Portal" is visible
- [ ] "Sign in" button text is visible
- [ ] Screenshot comparison: page has non-white background, visible card with shadow

### 3. Login Form Interaction
- [ ] Type email into email input
- [ ] Type password into password input
- [ ] Click "Sign in" button
- [ ] Form submits without JavaScript error
- [ ] Error message displays on invalid credentials
- [ ] Successful login redirects to dashboard

### 4. Dashboard Rendering (authenticated)
- [ ] Dashboard loads with "Platform overview" heading
- [ ] Stat cards render with non-zero values
- [ ] Sidebar navigation is visible
- [ ] "Merchants" link in sidebar navigates correctly
- [ ] Merchant switching dropdown is functional

### 5. Responsive Layout
- [ ] Page renders at mobile viewport (375px)
- [ ] Page renders at tablet viewport (768px)
- [ ] Page renders at desktop viewport (1280px)
- [ ] No horizontal overflow at any viewport

### 6. Navigation Flow
- [ ] Login → Dashboard → Merchants → back
- [ ] Login → Dashboard → Payments → Payment detail
- [ ] Login → Dashboard → Settings → API key visible

## What curl-based E2E Cannot Test

| Scenario | curl can? | Browser needed? |
|----------|:---:|:---:|
| HTTP status code | ✅ | — |
| JSON response shape | ✅ | — |
| Text in HTML | ✅ | — |
| CSS class in HTML markup | ✅ grep | ❌ applied? |
| CSS actually rendering | ❌ | ✅ must |
| JS executing without error | ❌ | ✅ must |
| Form interaction (type, click) | ❌ | ✅ must |
| Visual layout | ❌ | ✅ must |
| Console errors | ❌ | ✅ must |
| Network waterfall (asset 404s) | ❌ | ✅ must |

## Implementation Plan

1. Install Playwright + browsers locally
2. Create `e2e/browser/login.spec.ts` — login page rendering + form interaction
3. Create `e2e/browser/dashboard.spec.ts` — dashboard rendering + navigation
4. Create `e2e/browser/assets.spec.ts` — static asset loading + console errors
5. Create `e2e/browser/auth-flow.spec.ts` — full registration → login → dashboard flow
6. Run against local server, fix failures
7. Add to CI (GitHub Actions or Cloud Build)

## Merge Gate

Before merging any UI change, the browser E2E suite must pass:
- Zero console errors on all pages
- All static assets return 200
- Form interaction works
- Screenshots match baseline (or diff is approved)
