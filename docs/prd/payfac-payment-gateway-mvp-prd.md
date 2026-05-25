# PayFac Payment Gateway — 一期 MVP PRD

> **文档状态**：Ready for Development  
> **版本**：v1.0  
> **目标交付**：6 周  
> **上游**：Worldpay Access Platform  
> **下游**：电商子商户 (E-commerce Sub-merchants)  
> **参考设计**：[架构设计文档](../design/payfac-payment-gateway-mvp-design.md)

---

## 目录

1. [产品概述](#1-产品概述)
2. [用户故事](#2-用户故事)
3. [API 参考](#3-api-参考)
4. [核心业务流程](#4-核心业务流程)
5. [分支流程](#5-分支流程)
6. [错误处理](#6-错误处理)
7. [开发检查清单](#7-开发检查清单)

---

## 1. 产品概述

### 1.1 一句话描述

为电商子商户提供 Stripe 风格的统一支付 API，上游对接 Worldpay Access，网关自动处理 PayFac 合规注入、Token 化、3DS 认证、风控评估。

### 1.2 MVP 范围

```
✅ 卡支付 (CIT)            ✅ 3DS v2 认证           ✅ FraudSight 风控
✅ Token 化 & 复用          ✅ MIT 循环扣款           ✅ 自动请款 / 手动请款
✅ 退款                    ✅ 交易查询               ✅ 对账
```

### 1.3 核心 API 一览

```
POST   /v1/payment_intents                    创建支付 (一键确认)
GET    /v1/payment_intents/{id}                查询支付
POST   /v1/payment_intents/{id}/confirm        确认支付
POST   /v1/payment_intents/{id}/device_data    回传 DDC 结果
POST   /v1/payment_intents/{id}/capture        手动请款
POST   /v1/payment_intents/{id}/cancel         取消授权

POST   /v1/payment_methods                    创建 Token
GET    /v1/payment_methods/{id}               查询 Token

POST   /v1/refunds                            创建退款

GET    /v1/statements                         对账单
```

---

## 2. 用户故事

### 2.1 子商户 — 电商开发者

#### US-01: 接受卡支付 (Happy Path)

> **As a** 电商开发者  
> **I want to** 用一行 API 调用完成卡支付  
> **So that** 用户可以在我网站上用信用卡付款

**Acceptance Criteria**:

- [ ] `POST /v1/payment_intents` 传入金额、币种、卡号、`confirm: true`
- [ ] 返回 `status: "succeeded"`
- [ ] 银行卡扣款成功，我的账户增加对应余额
- [ ] 整个流程（从请求到返回）不超过 6 秒 (无 3DS challenge 场景)

**优先级**: P0

---

#### US-02: 3DS 安全认证

> **As a** 电商开发者  
> **I want to** 在支付时自动完成 3DS 认证  
> **So that** 我获得 liability shift 保护，chargeback 由发卡行承担

**Acceptance Criteria**:

- [ ] 支付请求中 `three_d_secure.enabled: true` (默认)
- [ ] 如果 3DS 需要 challenge，返回 `status: "requires_action"` + challenge URL
- [ ] 我展示 challenge 页面给用户，用户完成后支付自动继续
- [ ] 支付成功后返回 `three_d_secure.status: "authenticated"`，确认 liability shift

**优先级**: P0

---

#### US-03: 保存卡信息用于后续扣款

> **As a** 电商开发者  
> **I want to** 保存用户的卡信息 (token 化)  
> **So that** 下次可以直接扣款，用户无需重新输入

**Acceptance Criteria**:

- [ ] `POST /v1/payment_methods` 传入卡号，返回 `pm_xxx`
- [ ] 返回脱敏卡信息：brand、last4、expiry
- [ ] 卡号明文不出现在响应中
- [ ] `POST /v1/payment_intents` 可传入 `payment_method.type: "card_token"` 使用已保存的卡

**优先级**: P1

---

#### US-04: 订阅 / 循环扣款 (MIT)

> **As a** 电商开发者  
> **I want to** 用已保存的卡对用户进行按月扣款  
> **So that** 我的订阅业务可以自动化收款

**Acceptance Criteria**:

- [ ] 首次 CIT 支付传入 `setup_future_usage: "off_session"`
- [ ] 后续 MIT 扣款使用相同的 `pm_xxx`，不传 `three_d_secure`
- [ ] MIT 扣款无需用户在线，后台自动完成
- [ ] MIT 扣款无 3DS 流程、无 FraudSight 评估

**优先级**: P0

---

#### US-05: 退款

> **As a** 电商开发者  
> **I want to** 对已完成的支付发起退款  
> **So that** 我可以处理用户退货 / 争议

**Acceptance Criteria**:

- [ ] `POST /v1/refunds` 传入 `payment_intent` ID 和 `amount`
- [ ] 全额退款：`amount` = 原支付金额
- [ ] 部分退款：`amount` < 原支付金额
- [ ] 返回 `status: "succeeded"` + refund ID

**优先级**: P0

---

#### US-06: 对账

> **As a** 电商财务  
> **I want to** 每日拉取对账单  
> **So that** 我可以核对 Worldpay 结算金额与内部订单系统

**Acceptance Criteria**:

- [ ] `GET /v1/statements` 支持按日期范围查询
- [ ] 返回每笔借贷明细：金额、币种、类型、交易引用
- [ ] 查询结果分页

**优先级**: P1

---

### 2.2 PayFac 管理员

#### US-07: 子商户风控开关

> **As a** PayFac 风控管理员  
> **I want to** 按子商户粒度开关 FraudSight 风控  
> **So that** 我可以对高风险商户启用风控，对信任商户关闭以减少延迟

**Acceptance Criteria**:

- [ ] 后台配置：`fraudsight.enabled: true/false`
- [ ] `false` 时跳过高风险拒绝，所有支付直接放行
- [ ] 配置变更实时生效（或 < 5 分钟）

**优先级**: P1

---

## 3. API 参考

### 3.1 认证

所有请求使用 API Key：

```bash
Authorization: Bearer sk_live_YOUR_API_KEY
```

每个子商户拥有独立 API Key。测试环境示例：

```bash
# 测试环境
curl -H "Authorization: Bearer sk_test_YOUR_TEST_KEY" \
     -H "Content-Type: application/json" \
     https://gateway.payfac.com/v1/payment_intents
```

### 3.2 创建 PaymentIntent（统一支付）

```bash
POST /v1/payment_intents
Idempotency-Key: order-12345-2026-05-25-001
```

#### 请求 — 直接传卡号

```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card",
    "card": {
      "number": "4444333322221111",
      "expiry_month": 5,
      "expiry_year": 2035,
      "cvc": "123",
      "cardholder_name": "John Doe",
      "billing_address": {
        "line1": "221B Baker Street",
        "city": "London",
        "postal_code": "NW1 6XE",
        "country": "GB"
      }
    }
  },
  "confirm": true,
  "description": "Order #12345",
  "statement_descriptor": "MYSHOP.CO",
  "three_d_secure": {
    "enabled": true,
    "return_url": "https://myshop.com/checkout/complete"
  },
  "customer": {
    "email": "john@example.com",
    "ip_address": "192.168.1.1"
  }
}
```

#### 请求 — 使用已保存的 Token

```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card_token",
    "token": "pm_abc123def456"
  },
  "confirm": true,
  "three_d_secure": {
    "enabled": true,
    "return_url": "https://myshop.com/checkout/complete"
  }
}
```

#### 请求 — MIT 循环扣款

```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card_token",
    "token": "pm_abc123def456"
  },
  "confirm": true
}
```

#### 响应 — 成功

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "object": "payment_intent",
  "amount": 250,
  "currency": "gbp",
  "status": "succeeded",
  "capture_method": "automatic",
  "three_d_secure": { "status": "authenticated" },
  "payment_method_details": {
    "type": "card",
    "card": {
      "brand": "visa",
      "last4": "1111",
      "expiry_month": 5,
      "expiry_year": 2035,
      "funding": "credit",
      "country": "GB"
    }
  },
  "created": "2026-05-25T08:00:00Z"
}
```

#### 响应 — 需 DDC

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_device_data",
  "next_action": {
    "type": "device_data_collection",
    "device_data_collection": {
      "ddc_url": "https://secure.worldpay.com/rp/api/ddc.html",
      "ddc_jwt": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
    }
  }
}
```

#### 响应 — 需 3DS Challenge

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_action",
  "next_action": {
    "type": "three_d_secure_challenge",
    "three_d_secure_challenge": {
      "challenge_url": "https://issuer-bank.com/acs/challenge",
      "challenge_jwt": "eyJhbGciOiJIUzI1NiJ9...",
      "challenge_payload": "{...}"
    }
  }
}
```

#### 响应 — 3DS 不可用 (无 liability shift)

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "succeeded",
  "three_d_secure": { "status": "not_enrolled" }
}
```

#### 状态流转参考

```
CREATED              → POST 创建, confirm: false
PROCESSING           → 中间状态 (Tokenize / FraudSight / DDC / Authenticate / Authorize)
REQUIRES_DEVICE_DATA → 需前端运行 DDC
REQUIRES_ACTION      → 需前端完成 3DS Challenge
REQUIRES_CAPTURE     → 已授权, 等待手动请款 (capture_method: manual)
SUCCEEDED            → 终态: 支付成功
CANCELED             → 终态: 已取消
PAYMENT_FAILED       → 终态: 支付失败
```

### 3.3 创建 PaymentMethod (Tokenize)

```bash
POST /v1/payment_methods
```

```json
{
  "type": "card",
  "card": {
    "number": "4444333322221111",
    "expiry_month": 5,
    "expiry_year": 2035,
    "cvc": "123",
    "cardholder_name": "John Doe",
    "billing_address": {
      "line1": "221B Baker Street",
      "city": "London",
      "postal_code": "NW1 6XE",
      "country": "GB"
    }
  }
}
```

**响应**:

```json
{
  "id": "pm_abc123def456",
  "object": "payment_method",
  "type": "card",
  "card": {
    "brand": "visa",
    "last4": "1111",
    "expiry_month": 5,
    "expiry_year": 2035,
    "funding": "credit",
    "country": "GB"
  },
  "created": "2026-05-25T08:00:00Z"
}
```

### 3.4 手动请款

```bash
POST /v1/payment_intents/{id}/capture
```

```json
{
  "amount_to_capture": 250
}
```

### 3.5 取消授权

```bash
POST /v1/payment_intents/{id}/cancel
```

### 3.6 退款

```bash
POST /v1/refunds
```

```json
{
  "payment_intent": "pi_K1a2b3c4d5e6",
  "amount": 250,
  "reason": "duplicate"
}
```

**响应**:

```json
{
  "id": "rf_xyz789",
  "object": "refund",
  "payment_intent": "pi_K1a2b3c4d5e6",
  "amount": 250,
  "currency": "gbp",
  "status": "succeeded",
  "created": "2026-05-25T09:00:00Z"
}
```

### 3.7 支付列表

```bash
GET /v1/payment_intents?limit=10&created_since=2026-05-20T00:00:00Z
```

### 3.8 对账单

```bash
GET /v1/statements?from=2026-05-20T00:00:00Z&to=2026-05-25T23:59:59Z&page=1
```

---

## 4. 核心业务流程

### 4.1 支付主流程 (CIT + 3DS + Auto Capture)

```
触发条件:
  POST /v1/payment_intents
  payment_method.type = "card" | "card_token"
  confirm = true
  three_d_secure.enabled = true | (不传, 默认 true)
  capture_method = "automatic" | (不传, 默认 automatic)

流程:
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ① 参数校验                                                                  │
│     · API Key → merchantId → worldpayEntity                                 │
│     · currency 转大写                                                        │
│     · 幂等检查 (Idempotency-Key)                                             │
│                                                                             │
│  ② Tokenize (若 type = "card")                                              │
│     POST /tokens { cardNumber, cardExpiryDate, cardHolderName,              │
│                    billingAddress, merchant.entity }                        │
│     → 存储 token href + card summary                                        │
│                                                                             │
│  ③ FraudSight 评估                                                           │
│     POST /fraudsight/assessment { transactionReference,                     │
│       merchant.entity, instruction: { value, paymentInstrument },           │
│       riskData: { account.email, transaction.firstName, ... },              │
│       deviceData: { ipAddress } }                                           │
│     → 提取 riskProfile.href                                                 │
│     · outcome = highRisk + action_on_high_risk = block → PAYMENT_FAILED     │
│                                                                             │
│  ④ DDC 设备指纹 (若 3DS enabled)                                             │
│     POST /verifications/customers/3ds/deviceDataInitialize                  │
│       { transactionReference, merchant.entity,                              │
│         paymentInstrument: { type: "card/tokenized", href: "..." } }        │
│     → 返回 { ddc_url, ddc_jwt }                                            │
│     → 若前端未预取 → 返回 status: "requires_device_data"                    │
│     → 若已有 collectionReference → 跳过, 进入 ⑤                             │
│                                                                             │
│  ⑤ 3DS Authenticate                                                         │
│     POST /verifications/customers/3ds/authenticate                          │
│       { transactionReference, merchant.entity,                              │
│         instruction: { value, paymentInstrument },                          │
│         deviceData: { acceptHeader, userAgentHeader, collectionRef },       │
│         challenge: { returnUrl: "https://gateway.payfac.com/v1/3ds/callback"│
│                       ?pi_id=xxx" } }                                       │
│     → outcome = authenticated    → 进入 ⑥                                   │
│     → outcome = challenged       → 返回 status: "requires_action"          │
│     → outcome = notEnrolled      → 进入 ⑥ (无 liability shift)              │
│     → outcome = unavailable      → 进入 ⑥ (无 liability shift)              │
│                                                                             │
│  ⑥ CIT Authorize + Auto Capture                                             │
│     POST /cardPayments/customerInitiatedTransactions                        │
│       { transactionReference,                                               │
│         merchant: { entity, paymentFacilitator: { schemeId, subMerchant } },│
│         instruction: {                                                      │
│           requestAutoSettlement: { enabled: true },                          │
│           narrative: { line1 },                                             │
│           value: { amount, currency },                                      │
│           paymentInstrument: { type: "card/token", href: "..." },           │
│           customerAgreement: { type: "cardOnFile", ... }  ← 若 setup_future │
│         },                                                                  │
│         channel: "ecom",                                                    │
│         authentication: { threeDS: { version, eci, authValue, txId } },      │
│         riskProfile: "https://...riskProfile/..." }                          │
│     → outcome = authorized / Sent for Settlement → SUCCEEDED                │
│     → outcome = refused → PAYMENT_FAILED                                    │
│                                                                             │
│  ⑦ 存储结果                                                                  │
│     · worldpayPaymentId, scheme.reference (MIT 用)                           │
│     · issuerAuthorizationCode, card summary                                  │
│     · 返回 PaymentIntent 响应                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 后端伪代码

```typescript
// PaymentIntentService.ts

async function createAndConfirm(params: CreatePaymentIntentParams) {
  // ① 幂等检查
  const idempotencyKey = headers['idempotency-key'];
  if (idempotencyKey) {
    const cached = await cache.get(idempotencyKey);
    if (cached) return cached;
  }

  // ② 商户认证 & entity 查询
  const merchant = await authenticateApiKey(headers['authorization']);
  const wpEntity = merchant.worldpayEntity;

  // ③ 币种规范化
  const currency = params.currency.toUpperCase();

  // ④ Tokenize (如果是 raw card)
  let tokenHref: string;
  if (params.payment_method.type === 'card') {
    const tokenResp = await worldpay.post('/tokens', {
      paymentInstrument: {
        type: 'card/front',
        cardNumber: params.payment_method.card.number,
        cardExpiryDate: { month: params.payment_method.card.expiry_month,
                          year: params.payment_method.card.expiry_year },
        cardHolderName: params.payment_method.card.cardholder_name,
        billingAddress: mapBillingAddress(params.payment_method.card.billing_address),
      },
      merchant: { entity: wpEntity },
    }, { mediaType: TOKENS_V3_MEDIA_TYPE });
    tokenHref = tokenResp._links['tokens:token'].href;
  } else {
    tokenHref = await getTokenHref(params.payment_method.token);
  }

  // ⑤ FraudSight (子商户不可见)
  const fraudResp = await worldpay.post('/fraudsight/assessment', {
    transactionReference: generateRef(),
    merchant: { entity: wpEntity },
    instruction: {
      value: { amount: params.amount, currency },
      paymentInstrument: { type: 'card/tokenized', href: tokenHref },
    },
    riskData: {
      account: { email: params.customer?.email },
      transaction: { firstName: params.customer?.firstName, ... },
    },
    deviceData: { ipAddress: params.customer?.ip_address },
  }, { mediaType: FRAUDSIGHT_MEDIA_TYPE });

  if (fraudResp.outcome === 'highRisk' && merchant.fraudsight.actionOnHighRisk === 'block') {
    return { status: 'payment_failed', failure_code: 'high_risk' };
  }
  const riskProfileHref = fraudResp.riskProfile.href;

  // ⑥ 3DS (若启用)
  let threeDSResult = null;
  const threeDSEnabled = params.three_d_secure?.enabled !== false; // 默认 true
  if (threeDSEnabled) {
    // ⑥a DDC Init
    const ddcResp = await worldpay.post('/verifications/customers/3ds/deviceDataInitialize', {
      transactionReference: generateRef(),
      merchant: { entity: wpEntity },
      paymentInstrument: { type: 'card/tokenized', href: tokenHref },
    }, { mediaType: THREEDS_MEDIA_TYPE });

    const collRef = params.device_data?.collection_reference;
    if (!collRef) {
      // 前端没预取 DDC → 返回 requires_device_data
      return {
        status: 'requires_device_data',
        next_action: {
          type: 'device_data_collection',
          device_data_collection: {
            ddc_url: ddcResp.deviceDataCollection.url,
            ddc_jwt: ddcResp.deviceDataCollection.jwt,
          },
        },
      };
    }

    // ⑥b Authenticate
    const authResp = await worldpay.post('/verifications/customers/3ds/authenticate', {
      transactionReference: generateRef(),
      merchant: { entity: wpEntity },
      instruction: {
        value: { amount: params.amount, currency },
        paymentInstrument: { type: 'card/tokenized', href: tokenHref },
      },
      deviceData: {
        acceptHeader: params.device_data?.accept_header ?? '*/*',
        userAgentHeader: params.device_data?.user_agent ?? '',
        collectionReference: collRef,
      },
      challenge: {
        returnUrl: `https://gateway.payfac.com/v1/3ds/callback?pi_id=${piId}`,
      },
    }, { mediaType: THREEDS_MEDIA_TYPE });

    if (authResp.outcome === 'challenged') {
      await storeChallengeSession(piId, {
        challengeReference: authResp.challenge.reference,
        merchantReturnUrl: params.three_d_secure.return_url,
      });
      return {
        status: 'requires_action',
        next_action: {
          type: 'three_d_secure_challenge',
          three_d_secure_challenge: {
            challenge_url: authResp.challenge.url,
            challenge_jwt: authResp.challenge.jwt,
            challenge_payload: authResp.challenge.payload,
          },
        },
      };
    }

    if (authResp.outcome === 'authenticationFailed') {
      return { status: 'payment_failed', failure_code: '3ds_failed' };
    }

    threeDSResult = authResp.authentication;
  }

  // ⑦ CIT Authorize (含自动请款)
  const citResp = await worldpay.post('/cardPayments/customerInitiatedTransactions', {
    transactionReference: generateRef(),
    merchant: {
      entity: wpEntity,
      paymentFacilitator: {
        schemeId: merchant.payfacSchemeId,
        subMerchant: {
          reference: merchant.subMerchantRef,
          name: merchant.subMerchantName,
          address: merchant.subMerchantAddress,
        },
      },
    },
    instruction: {
      requestAutoSettlement: {
        enabled: params.capture_method !== 'manual',
      },
      narrative: { line1: (params.statement_descriptor ?? params.description ?? '').substring(0, 24) },
      value: { amount: params.amount, currency },
      paymentInstrument: { type: 'card/token', href: tokenHref },
      ...(params.setup_future_usage === 'off_session' && {
        customerAgreement: { type: 'cardOnFile', storedCardUsage: 'first' },
      }),
    },
    channel: 'ecom',
    ...(threeDSResult && {
      authentication: {
        threeDS: {
          version: threeDSResult.version,
          eci: threeDSResult.eci,
          authenticationValue: threeDSResult.authenticationValue,
          transactionId: threeDSResult.transactionId,
        },
      },
    }),
    riskProfile: riskProfileHref,
  }, { mediaType: CARD_PAYMENTS_V7_MEDIA_TYPE });

  if (citResp.outcome === 'refused') {
    return {
      id: piId, status: 'payment_failed',
      failure_code: citResp.refusalCode,
      failure_message: citResp.refusalDescription,
    };
  }

  // ⑧ 存储结果
  await storePayment({
    piId,
    merchantId: merchant.id,
    worldpayPaymentId: citResp.paymentId,
    schemeReference: citResp.scheme?.reference,         // MIT 用
    linkData: citResp._links,                           // 后续操作 URL
    status: 'succeeded' | 'requires_capture',
    threeDSStatus: threeDSResult ? 'authenticated' : 'not_requested',
    amount: params.amount, currency,
  });

  // ⑨ 缓存幂等响应
  if (idempotencyKey) {
    await cache.set(idempotencyKey, response, 86400);   // 24h
  }

  return { id: piId, status: 'succeeded', ... };
}
```

### 4.3 3DS Challenge 回调流程

```
触发条件:
  Issuer ACS 完成 challenge → 302 redirect 到 Gateway

URL: GET https://gateway.payfac.com/v1/3ds/callback?pi_id=xxx

流程:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ① 从 session store 取出 { challengeReference, merchantReturnUrl }   │
│                                                                     │
│  ② POST /verifications/customers/3ds/verification                   │
│     { transactionReference, merchant.entity,                        │
│       challenge: { reference: challengeReference } }                 │
│                                                                     │
│  ③ 获取 authentication 结果 → 执行 CIT authorize (同 §4.1 步骤⑥)      │
│                                                                     │
│  ④ 302 redirect → merchantReturnUrl?status=succeeded|failed          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**回调伪代码**:

```typescript
// 3DSCallbackController.ts

async function handle3DSCallback(piId: string) {
  const session = await getChallengeSession(piId);
  if (!session) return error(404, 'Session expired');

  // ② Verify
  const verifyResp = await worldpay.post('/verifications/customers/3ds/verification', {
    transactionReference: generateRef(),
    merchant: { entity: getMerchantEntity(piId) },
    challenge: { reference: session.challengeReference },
  }, { mediaType: THREEDS_MEDIA_TYPE });

  if (verifyResp.outcome !== 'authenticated') {
    await updatePaymentStatus(piId, 'payment_failed');
    return redirect(`${session.merchantReturnUrl}?status=failed`);
  }

  // ③ Authorize
  const authResult = await authorizeWith3DS(piId, verifyResp.authentication);

  // ④ Redirect
  const redirectUrl = authResult.status === 'succeeded'
    ? `${session.merchantReturnUrl}?status=succeeded`
    : `${session.merchantReturnUrl}?status=failed`;
  return redirect(redirectUrl);
}
```

### 4.4 MIT 循环扣款流程

```
触发条件:
  POST /v1/payment_intents
  payment_method.type = "card_token"
  无 three_d_secure 字段
  该 token 对应的 CIT 有 setup_future_usage 记录

流程:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ① 查询 token → worldpayTokenHref                                   │
│  ② 查询 CIT 记录 → schemeReference                                   │
│  ③ POST /cardPayments/merchantInitiatedTransactions                  │
│     { transactionReference,                                          │
│       merchant: { entity, paymentFacilitator },                      │
│       instruction: {                                                 │
│         requestAutoSettlement: { enabled: true },                     │
│         value: { amount, currency },                                 │
│         paymentInstrument: { type: "card/token", href: "..." },      │
│         customerAgreement: { type: "cardOnFile",                     │
│                              storedCardUsage: "subsequent" }          │
│       },                                                             │
│       channel: "ecom",                                               │
│       schemeTransactionReference: "{CIT 的 scheme.reference}"         │
│     }                                                                │
│  ④ 无 3DS、无 FraudSight、无 DDC                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 分支流程

### 5.1 参数控制的分支矩阵

```
                    ┌─────────────────────────────────────────────┐
                    │         POST /v1/payment_intents            │
                    └────────────────────┬────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
     type = "card"               type = "card_token"         type = "card_token"
     three_d_secure: true        three_d_secure: true        (no three_d_secure)
     setup_future: (none)        setup_future: (none)        setup_future 前置 ✓
              │                          │                          │
              ▼                          ▼                          ▼
     ┌────────────────┐         ┌────────────────┐         ┌────────────────┐
     │ CIT + Tokenize  │         │ CIT (existing)  │         │ MIT (off_session)│
     │ + FraudSight    │         │ + FraudSight    │         │ No FraudSight    │
     │ + DDC           │         │ + DDC           │         │ No DDC           │
     │ + 3DS           │         │ + 3DS           │         │ No 3DS           │
     │ + Auto Capture  │         │ + Auto Capture  │         │ + Auto Capture   │
     └────────────────┘         └────────────────┘         └────────────────┘

              ┌──────────────────────────┬──────────────────────────┐
              │                          │                          │
     capture_method:            capture_method:            capture_method:
     automatic (default)        manual                    automatic|manual
              │                          │                          │
              ▼                          ▼                          ▼
     requestAutoSettlement:     requestAutoSettlement:     (同 CIT)
     { enabled: true }          { enabled: false }
     → SUCCEEDED                → REQUIRES_CAPTURE
                                  → [手动调 /capture]
                                  → SUCCEEDED
```

### 5.2 3DS 分支

```
                    three_d_secure.enabled?
                         │
              ┌──────────┴──────────┐
              │ true (default)       │ false
              ▼                      ▼
     DDC Init + Authenticate        跳过 DDC + 3DS
              │                     直通 Authorize
              │                     (无 liability shift)
     ┌────────┼────────┬────────┐
     │        │        │        │
authenticated challenged notEnrolled unavailable
     │        │        │        │
     ▼        ▼        ▼        ▼
  继续授权  返回      继续授权   继续授权
  (liability REQUIRES (无        (无
   shift)   _ACTION   liability  liability
                      shift)     shift)
```

### 5.3 退款分支

```
POST /v1/refunds { payment_intent, amount }
         │
    ┌────┴────┐
    │         │
amount ===    amount <
original      original
    │         │
    ▼         ▼
POST         POST
.../refunds/ .../refunds/
full/        partials/
{linkData}   {linkData}
    │         │
    └────┬────┘
         ▼
    status: "succeeded"
```

### 5.4 超时恢复分支

```
Gateway → Worldpay 超时
         │
         ▼
  标记 PaymentIntent: "unknown"
         │
         ▼
  GET /payments/events/{linkData}
         │
    ┌────┼────┬────────┐
    │    │    │        │
authorized refused 404  error
    │    │    │        │
    ▼    ▼    ▼        ▼
  成功   失败  安全    重试
  继续   标记  重试    (指数退避)
         │    授权     max 3 次
         │
         ▼
    异步对账兜底
    (T+1 via /paymentQueries)
```

---

## 6. 错误处理

### 6.1 错误码映射

| Gateway 错误码 | HTTP | 含义 | Worldpay 原始错误 | 处理 |
|---------------|------|------|------------------|------|
| `invalid_api_key` | 401 | API Key 无效 | — | — |
| `merchant_not_found` | 403 | 商户不存在 / 已停用 | — | — |
| `idempotency_conflict` | 200 | 幂等冲突 (返回缓存) | — | 返回原响应 |
| `card_declined` | 200 | 卡被拒绝 | `outcome: "refused"` | 返回 refusal_code |
| `card_expired` | 200 | 卡已过期 | Token API 422 | — |
| `invalid_card_number` | 400 | 卡号无效 | Token API 422 | — |
| `insufficient_funds` | 200 | 余额不足 | refusal_code 51 | — |
| `3ds_required` | 200 | 需 3DS | `status: "requires_action"` | — |
| `3ds_failed` | 200 | 3DS 认证失败 | `outcome: "authenticationFailed"` | — |
| `high_risk` | 200 | 风控拦截 | FraudSight `highRisk` | — |
| `duplicate_transaction` | 200 | 重复交易 | Idempotency-Key 冲突 | — |
| `invalid_amount` | 400 | 金额无效 | Worldpay validation | — |
| `capture_exceeded` | 400 | 请款金额超出授权 | — | — |
| `already_captured` | 400 | 已请款 | — | — |
| `already_refunded` | 400 | 已退款 | — | — |
| `status_invalid` | 400 | 当前状态不允许此操作 | — | — |
| `gateway_timeout` | 504 | Gateway 超时 | — | §5.4 恢复流程 |
| `upstream_unavailable` | 502 | Worldpay 不可用 | 5xx | 告警 + 异步恢复 |
| `internal_error` | 500 | 网关内部错误 | — | 告警 |

### 6.2 标准错误响应

```json
{
  "error": {
    "code": "card_declined",
    "message": "The card was declined by the issuer",
    "decline_code": "5",
    "payment_intent_id": "pi_K1a2b3c4d5e6"
  }
}
```

### 6.3 重试策略

| 场景 | 策略 | 最大次数 | 间隔 |
|------|------|---------|------|
| Worldpay 5xx | 不重试, 走异步恢复 | — | — |
| 网络超时 | GET /payments/events 恢复 | 1 | — |
| 幂等冲突 | 自动返回缓存 | — | — |
| Worldpay 4xx | 不重试 | — | — |
| DDC 超时 | 降级: 不带 DDC 继续 | — | — |

---

## 7. 开发检查清单

### 7.1 基础设施

- [ ] Worldpay 凭证存储 (Secret Manager / Vault)
- [ ] 子商户 API Key 管理 (生成、轮换、吊销)
- [ ] 幂等缓存 (Redis, 24h TTL)
- [ ] 支付数据库 (PostgreSQL: payment_intents, payment_methods, refunds, merchants)
- [ ] 3DS Challenge session 存储 (Redis, 15min TTL)
- [ ] Worldpay entity → 子商户映射配置

### 7.2 API 端点

- [ ] `POST /v1/payment_intents` — 创建 & 确认支付
- [ ] `GET /v1/payment_intents/{id}` — 查询支付
- [ ] `POST /v1/payment_intents/{id}/device_data` — DDC 回传
- [ ] `POST /v1/payment_intents/{id}/capture` — 手动请款
- [ ] `POST /v1/payment_intents/{id}/cancel` — 取消授权
- [ ] `POST /v1/payment_methods` — 创建 Token
- [ ] `GET /v1/payment_methods/{id}` — 查询 Token
- [ ] `POST /v1/refunds` — 退款
- [ ] `GET /v1/3ds/callback` — 3DS Challenge 回调
- [ ] `GET /v1/statements` — 对账

### 7.3 Worldpay 集成

- [ ] Card Payments v7 — CIT + MIT
- [ ] 3DS v2 — deviceDataInitialize + authenticate + verification
- [ ] FraudSight v1 — assessment
- [ ] Tokens v3 — create + get
- [ ] Payment Queries v1 — list + single
- [ ] Statements 2025-01-01
- [ ] PayFac `paymentFacilitator` 自动注入

### 7.4 关键非功能需求

- [ ] 幂等性 (Idempotency-Key, 24h TTL)
- [ ] 超时恢复 (GET /payments/events)
- [ ] 卡号明文不落盘
- [ ] Worldpay token href 加密存储
- [ ] 所有 Worldpay 调用有超时 (10s)
- [ ] 日志: 每笔支付完整 trace (request → Worldpay → response)
- [ ] 告警: Worldpay 5xx, 超时率 > 1%, FraudSight highRisk 率异常

### 7.5 测试用例

- [ ] CIT 支付成功 (frictionless 3DS)
- [ ] CIT 支付成功 (3DS disabled)
- [ ] CIT 支付失败 (card declined)
- [ ] CIT + DDC 流程
- [ ] CIT + 3DS Challenge 流程
- [ ] MIT 循环扣款
- [ ] MIT 无 CIT 前置 → 拒绝
- [ ] 退款 (全额)
- [ ] 退款 (部分)
- [ ] Idempotency-Key 重复请求
- [ ] 网络超时恢复
- [ ] FraudSight highRisk → block
- [ ] 3DS notEnrolled → 继续 (无 liability shift)

---

## 附录 A: 环境变量

```bash
# Worldpay 凭证
WORLDPAY_USERNAME=your_worldpay_username
WORLDPAY_PASSWORD=your_worldpay_password

# Worldpay 环境
WORLDPAY_BASE_URL=https://try.access.worldpay.com

# PayFac 全局配置
WORLDPAY_PAYFAC_SCHEME_ID=12345
WORLDPAY_PAYFAC_ENTITY_PREFIX=your_entity

# 数据库
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Gateway 自身
GATEWAY_BASE_URL=https://gateway.payfac.com
PORT=8080
```

## 附录 B: Curl 测试命令

```bash
# ① 直接卡支付
curl -X POST https://gateway.payfac.com/v1/payment_intents \
  -H "Authorization: Bearer sk_test_YOUR_TEST_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "amount": 250,
    "currency": "gbp",
    "payment_method": {
      "type": "card",
      "card": {
        "number": "4444333322221111",
        "expiry_month": 5, "expiry_year": 2035,
        "cvc": "123",
        "cardholder_name": "Test User",
        "billing_address": {
          "line1": "1 Test St", "city": "London",
          "postal_code": "SW1A 1AA", "country": "GB"
        }
      }
    },
    "confirm": true,
    "three_d_secure": { "enabled": false, "return_url": "https://example.com/done" }
  }'

# ② Token 化卡号
curl -X POST https://gateway.payfac.com/v1/payment_methods \
  -H "Authorization: Bearer sk_test_YOUR_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "card",
    "card": {
      "number": "4444333322221111",
      "expiry_month": 5, "expiry_year": 2035, "cvc": "123",
      "cardholder_name": "Test User"
    }
  }'

# ③ 查询支付
curl https://gateway.payfac.com/v1/payment_intents/pi_K1a2b3c4d5e6 \
  -H "Authorization: Bearer sk_test_YOUR_TEST_KEY"

# ④ 退款
curl -X POST https://gateway.payfac.com/v1/refunds \
  -H "Authorization: Bearer sk_test_YOUR_TEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"payment_intent": "pi_K1a2b3c4d5e6", "amount": 250}'
```
