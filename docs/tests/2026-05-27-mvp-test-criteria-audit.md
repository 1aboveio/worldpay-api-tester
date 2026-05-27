# Test Criteria Audit: PayFac Payment Gateway MVP — Final

## Date: 2026-05-27 | Tests: 301 total

| Level | Count | Tool |
|-------|-------|------|
| Unit/Integration | 239 | vitest (13 files) |
| API E2E | 55 | curl + jq |
| Browser E2E | 7 | Playwright (2 spec files) |

## Journey Coverage

| # | Journey | Status | Level |
|---|---------|:---:|-------|
| J1 | Card payment (raw card → authorize) | ✅ Covered | Integration + API E2E |
| J2 | Stored token payment | ✅ Covered | Integration + API E2E |
| J3 | 3DS payment (DDC → challenge) | ✅ Covered | Integration |
| J4 | Manual capture + cancel | ✅ Covered | Integration |
| J5 | MIT recurring (CIT → MIT) | ✅ Covered | Integration + API E2E |
| J6 | Refund (pay → refund) | ✅ Covered | Integration + API E2E |
| J7 | Payment query (list + detail) | ✅ Covered | Integration + API E2E |
| J8 | Statement reconciliation | ✅ Covered | Integration + API E2E |
| J9 | Tokenize card (pm_xxx) | ✅ Covered | Integration + API E2E |
| J10 | Invalid auth / errors | ✅ Covered | Integration + API E2E |
| J11 | Login → dashboard → stats | ✅ Covered | Unit + Browser E2E |
| J12 | Login → payments | ✅ Covered | Unit |
| J13 | Login → payment methods | ✅ Covered | Unit |
| J14 | Login → refunds | ✅ Covered | Unit |
| J15 | Login → settings → API keys | ✅ Covered | Unit |
| J16 | Register fmmpay → admin | ✅ Covered | Integration + API E2E |
| J17 | Admin dashboard | ✅ Covered | Unit + Browser E2E |
| J18 | Merchants list → detail | ✅ Covered | Unit |
| J19 | FraudSight toggle effect | ✅ Covered | Integration |
| J20 | Admin payments list | ✅ Covered | Unit |
| J21 | Impersonate merchant | ✅ Covered | Integration + API E2E |
| J22 | Return to platform | ✅ Covered | Integration + API E2E |
| J23 | Register non-fmmpay → merchant | ✅ Covered | Integration + API E2E |
| J24 | Merchant only own data | ✅ Covered | Unit + Integration |
| J25 | Multi-merchant switching | ✅ Covered | Integration + API E2E |

**All 25 journeys covered.** ✅

## Merge Gates

- [x] Unit: 239/239 passing (vitest)
- [x] Coverage: 83.75% statements (threshold 80%)
- [x] Browser E2E: 7/7 passing (Playwright)
- [x] API E2E: 55/55 passing (curl, CI green)
- [x] CI: GitHub Actions workflow passing (unit + browser E2E)

## Remaining Gaps (non-blocking)

| Gap | Reason |
|-----|--------|
| Payment response < 6 seconds | Needs real Worldpay sandbox credentials |
| Liability shift flag assertion | Minor — 3DS status is asserted, flag is implicit |
| Real Worldpay E2E | Needs sandbox credentials for actual authorize flow |
