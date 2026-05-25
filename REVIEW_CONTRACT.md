# Review Contract — 3DS v2 Full Flow

**Branch:** `feat/4-3ds-flow`  
**Issue:** https://github.com/1aboveio/worldpay-api-tester/issues/4  
**Base:** `dev/payfac-gateway-mvp`

---

## What was built

Extends the CIT payment flow with full 3DS v2 support: Device Data Collection (DDC), frictionless authentication, challenge/redirect flow, and callback verification.

### Architecture

```
packages/
├── dal/                  Prisma models + DAL modules
│   └── src/
│       ├── client.ts     Prisma client shim (dev/test only)
│       ├── three-ds/
│       │   ├── ddc-init.ts         POST /verifications/.../deviceDataInitialize
│       │   ├── authenticate.ts     POST /verifications/.../authenticate
│       │   ├── verify.ts           POST /verifications/.../verification
│       │   └── session-manager.ts  ThreeDSSession CRUD
│       └── payment-intent/
│           └── index.ts            PI queries + result storage
├── worldpay-client/      Worldpay HTTP client interface
│   └── src/
│       ├── index.ts      IWorldpayClient interface + types
│       └── client.ts     Real implementation (Basic Auth)
├── validators/           Zod v4 validation schemas
│   └── src/index.ts      createPaymentIntentSchema, deviceDataSubmitSchema
├── gateway-core/         Business logic orchestrator
│   └── src/index.ts      runThreeDSFlow, authorizeWithThreeDS, handleChallengeCallback
apps/
└── gateway/              Next.js 16 App Router
    └── src/app/api/v1/
        ├── payment_intents/route.ts           POST (extended with 3DS)
        ├── payment_intents/[id]/device_data/route.ts  POST (new)
        └── 3ds/callback/route.ts              GET (new)
tests/
├── setup.ts              Prisma mock + Worldpay mock setup
├── mocks/worldpay.ts     Configurable mock Worldpay client
├── validators.test.ts    12 tests — Zod validation
└── three-ds/
    ├── payment-intents-3ds.test.ts  11 tests — orchestrator flow
    ├── device-data.test.ts          4 tests — device_data endpoint
    └── callback.test.ts             3 tests — challenge callback
```

### New Prisma models

- **ThreeDSSession**: id, paymentIntentId (FK), challengeReference, merchantReturnUrl, ddcJwt, ddcUrl, collectionReference, status, createdAt
- **PaymentIntent** extended: threeDSStatus, threeDSVersion, threeDSEci, threeDSAuthValue, threeDSTransactionId
- **PaymentIntent** new statuses: `requires_device_data`, `requires_action`

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/payment_intents` | Extended: 3DS flow after FraudSight, before authorize |
| POST | `/api/v1/payment_intents/{id}/device_data` | Submit DDC collectionReference, triggers authenticate |
| GET | `/api/v1/3ds/callback` | Challenge callback → verify → authorize → 302 redirect |

### 3DS flow (when `three_d_secure.enabled: true`)

1. DDC Init → `requires_device_data` if no collectionReference
2. Authenticate with collectionReference
3. `authenticated` → inject threeDS into CIT authorize
4. `challenged` → return `requires_action` with challenge details
5. `notEnrolled` / `unavailable` → authorize without liability shift
6. `authenticationFailed` → `payment_failed`
7. Challenge callback: verify → authorize → 302 redirect to merchant URL

### 3DS disabled (`three_d_secure.enabled: false`)

- Skips all 3DS, goes straight to authorize
- `three_d_secure.status: "not_requested"`

---

## Test coverage — 30 tests, all passing

### Test file: `tests/three-ds/payment-intents-3ds.test.ts` (11 tests)

- [x] Frictionless authentication → `continue_to_authorize` with threeDS injection
- [x] 3DS auth version/eci/authValue/txId injected into CIT request
- [x] Succeeded with `threeDSStatus: "authenticated"`
- [x] DDC needed (no collectionReference) → `requires_device_data`
- [x] DDC Init called, Authenticate NOT called when DDC needed
- [x] Challenged → `requires_action` with challengeUrl/JWT/payload
- [x] notEnrolled → `continue_to_authorize`, no threeDS injection
- [x] unavailable → `continue_to_authorize`
- [x] authenticationFailed → `payment_failed` with `3ds_failed` code
- [x] ThreeDS disabled → skips DDC/Authenticate, no threeDS in CIT
- [x] CIT authorize refused → `payment_failed`

### Test file: `tests/three-ds/device-data.test.ts` (4 tests)

- [x] Device data submit triggers authenticate with collectionReference + headers
- [x] Challenged outcome → `requires_action`
- [x] notEnrolled outcome → `continue_to_authorize`
- [x] authenticationFailed → `payment_failed`

### Test file: `tests/three-ds/callback.test.ts` (3 tests)

- [x] Verify + authorize + redirect to merchant URL with `?status=succeeded`
- [x] ThreeDS auth from verify injected into CIT authorize
- [x] Failed verification → redirect with `?status=failed`, no authorize

### Test file: `tests/validators.test.ts` (12 tests)

- [x] Valid card payment parsing, card_token parsing
- [x] Rejections: missing number, invalid currency, zero amount
- [x] three_d_secure.return_url valid/invalid, setup_future_usage, capture_method
- [x] deviceDataSubmitSchema valid/invalid/empty

---

## Reviewer checklist

### Correctness
- [ ] `runThreeDSFlow` correctly orchestrates DDC Init → Authenticate flow
- [ ] `authorizeWithThreeDS` correctly injects threeDS block or omits it
- [ ] Challenge callback correctly handles verify → authorize → redirect
- [ ] All 3DS outcomes (authenticated, challenged, notEnrolled, unavailable, authenticationFailed) handled
- [ ] 3DS disabled path skips all 3DS calls

### Security
- [ ] API key validated for all endpoints
- [ ] Worldpay credentials not exposed in responses
- [ ] Session ID used for callback correlation, not guessable PI ID alone

### Testing
- [ ] Worldpay client fully mocked, no real HTTP calls in tests
- [ ] Prisma client shim allows tests to configure return values
- [ ] All acceptance criteria from #4 covered

### Code quality
- [ ] TypeScript strict mode, no `any` types
- [ ] Zod v4 validation on all inputs
- [ ] Proper error responses: `{ error: { code, message } }`
- [ ] No hardcoded secrets or URLs

---

## How to run tests

```bash
pnpm install
pnpm test          # vitest run — 30 tests
pnpm test:watch    # vitest watch mode
```
