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
- [ ] SCA 豁免配置: `fraudsight.exemption.enabled` (默认 true), `fraudsight.exemption.capability` (默认 `authorizationAndAuthentication`)
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

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /v1/payment_intents` |
| 幂等 | `Idempotency-Key` header (24h TTL) |
| Auth | `Bearer sk_live_{key}` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | integer | ✅ | 最小货币单位 (250 = £2.50) |
| `currency` | string | ✅ | ISO 4217 (gbp, usd, ...) |
| `payment_method.type` | enum | ✅ | `"card"` \| `"card_token"` |
| `payment_method.card.number` | string | 条件 | 卡号, type=card 时必填 |
| `payment_method.card.expiry_month` | int | 条件 | 1-12 |
| `payment_method.card.expiry_year` | int | 条件 | 4 位年份 |
| `payment_method.card.cvc` | string | 条件 | 3-4 位 |
| `payment_method.card.cardholder_name` | string | 条件 | 持卡人姓名 |
| `payment_method.card.billing_address` | object | 条件 | line1, city, postal_code, country |
| `payment_method.token` | string | 条件 | type=card_token 时必填, pm_xxx |
| `confirm` | bool | — | `true` 立即支付 (默认) |
| `capture_method` | enum | — | `"automatic"` (默认) \| `"manual"` |
| `description` | string | — | 订单描述 (网关存储, 不传 WP) |
| `statement_descriptor` | string | — | 银行账单显示 (→ WP narrative.line1) |
| `three_d_secure.enabled` | bool | — | 默认 `true` |
| `three_d_secure.return_url` | string | 条件 | 3DS challenge 完成后回调 URL |
| `three_d_secure.challenge_preference` | enum | — | `noPreference`, `noChallengeRequested`, `challengeRequested`, `challengeMandated` |
| `customer.email` | string | 推荐 | 风控用 |
| `customer.ip_address` | string | 推荐 | 风控用 |
| `setup_future_usage` | enum | — | `"off_session"` 启用 MIT 后续扣款 |
| `metadata` | object | — | 自定义键值对 (网关本地存储) |

**请求 — 直接传卡号 (网关即时 tokenize)**:

```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card",
    "card": {
      "number": "4444333322221111",
      "expiry_month": 5, "expiry_year": 2035,
      "cvc": "123", "cardholder_name": "John Doe",
      "billing_address": { "line1": "221B Baker Street", "city": "London", "postal_code": "NW1 6XE", "country": "GB" }
    }
  },
  "confirm": true,
  "three_d_secure": { "enabled": true, "return_url": "https://myshop.com/checkout/complete" }  // 注: 此 return_url 是商户侧回调; 网关内部向 Worldpay 传 Gateway 自己的 /v1/3ds/callback,
  "customer": { "email": "john@example.com", "ip_address": "192.168.1.1" }
}
```

**请求 — 使用已保存 Token**:

```json
{
  "amount": 250, "currency": "gbp",
  "payment_method": { "type": "card_token", "token": "pm_abc123def456" },
  "confirm": true,
  "three_d_secure": { "enabled": true, "return_url": "https://myshop.com/checkout/complete" }  // 注: 此 return_url 是商户侧回调; 网关内部向 Worldpay 传 Gateway 自己的 /v1/3ds/callback
}
```

**请求 — MIT 循环扣款 (无 3DS)**:

```json
{
  "amount": 250, "currency": "gbp",
  "payment_method": { "type": "card_token", "token": "pm_abc123def456" },
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
      "challenge_payload": "{...}",
      "session_id": "3ds_sess_abc123"
    }
  }
}
```

> `session_id` 由 Gateway 生成，用于关联 challenge 回调。challenge 完成后 issuer 重定向到 Gateway `/v1/3ds/callback?pi_id=xxx&session_id=yyy`。

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

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /v1/payment_methods` |
| Auth | `Bearer sk_live_{key}` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | enum | ✅ | `"card"` |
| `card.number` | string | ✅ | 卡号 |
| `card.expiry_month` | int | ✅ | 1-12 |
| `card.expiry_year` | int | ✅ | 4 位年份 |
| `card.cvc` | string | ✅ | 3-4 位 |
| `card.cardholder_name` | string | 推荐 | 持卡人姓名 |
| `card.billing_address` | object | 推荐 | line1, city, postal_code, country |

**请求示例**:

```json
{
  "type": "card",
  "card": {
    "number": "4444333322221111",
    "expiry_month": 5, "expiry_year": 2035,
    "cvc": "123", "cardholder_name": "John Doe"
  }
}
```

**响应示例**:

```json
{
  "id": "pm_abc123def456", "object": "payment_method", "type": "card",
  "card": { "brand": "visa", "last4": "1111", "expiry_month": 5, "expiry_year": 2035, "funding": "credit" },
  "created": "2026-05-25T08:00:00Z"
}
```

### 3.4 手动请款

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /v1/payment_intents/{id}/capture` |
| 前置条件 | status = `requires_capture` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount_to_capture` | integer | — | 部分请款金额, 不传则全额 |

```json
{ "amount_to_capture": 250 }
```

### 3.5 取消授权

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /v1/payment_intents/{id}/cancel` |
| 前置条件 | status = `requires_capture` |

无请求体。

### 3.6 退款

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /v1/refunds` |
| 前置条件 | PaymentIntent status = `succeeded` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `payment_intent` | string | ✅ | pi_xxx |
| `amount` | integer | — | 退款金额, 不传则全额 |
| `reason` | string | — | `"duplicate"`, `"fraudulent"`, `"requested_by_customer"` |

**请求示例**:

```json
{ "payment_intent": "pi_K1a2b3c4d5e6", "amount": 250 }
```

**响应示例**:

```json
{
  "id": "rf_xyz789", "object": "refund",
  "payment_intent": "pi_K1a2b3c4d5e6",
  "amount": 250, "currency": "gbp",
  "status": "succeeded", "created": "2026-05-25T09:00:00Z"
}
```

### 3.7 支付列表

| 属性 | 值 |
|------|-----|
| Endpoint | `GET /v1/payment_intents` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | integer | — | 每页数量, 默认 10 |
| `created_since` | ISO 8601 | — | 起始时间 |

```bash
GET /v1/payment_intents?limit=10&created_since=2026-05-20T00:00:00Z
```

### 3.8 对账单

| 属性 | 值 |
|------|-----|
| Endpoint | `GET /v1/statements` |

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from` | ISO 8601 | ✅ | 起始时间 |
| `to` | ISO 8601 | ✅ | 结束时间 (范围 ≤ 31 天) |
| `page` | integer | — | 页码, 默认 1 |

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

## 7. Worldpay API 对接规范

> **面向**：Gateway 后端开发者。先决条件：Worldpay username / password / entity。

### 7.1 环境与认证

HTTP Basic Auth: `Basic ${base64(username:password)}`

| 环境 | Base URL |
|------|----------|
| 测试 | `https://try.access.worldpay.com` |
| 生产 | `https://access.worldpay.com` |

参考: [Worldpay Developer Portal](https://developer.worldpay.com/) | DNS 白名单 `*.access.worldpay.com`

### 7.2 HTTP 客户端封装

```typescript
const WP_BASE = process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com";

async function wpCall(method: string, path: string, mediaType: string,
                       body?: unknown, query?: Record<string,string>) {
  const url = new URL(path, WP_BASE);
  if (query) Object.entries(query).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), {
    method, headers: {
      Authorization: `Basic ${Buffer.from(
        `${process.env.WORLDPAY_USERNAME}:${process.env.WORLDPAY_PASSWORD}`
      ).toString("base64")}`,
      Accept: mediaType, ...(body && { "Content-Type": mediaType }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
```

### 7.3 Tokens v3 — Token 化

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /tokens` |
| Media Type | `application/vnd.worldpay.tokens-v3.hal+json` |
| 参考 | https://developer.worldpay.com/products/tokens |

**请求参数**:

| 参数 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `paymentInstrument.type` | string | ✅ | `"card/front"` |
| `paymentInstrument.cardNumber` | string | ✅ | 10-19 位 |
| `paymentInstrument.cardExpiryDate.month` | int | ✅ | 1-12 |
| `paymentInstrument.cardExpiryDate.year` | int | ✅ | 1-9999 |
| `paymentInstrument.cardHolderName` | string | ✅ | 1-255 |
| `paymentInstrument.billingAddress.address1` | string | ✅ | 1-80 |
| `paymentInstrument.billingAddress.postalCode` | string | ✅ | 1-15 |
| `paymentInstrument.billingAddress.city` | string | ✅ | 1-50 |
| `paymentInstrument.billingAddress.countryCode` | string | ✅ | 2 字符 ISO 3166-1 |
| `merchant.entity` | string | ✅ | 1-64 |
| `namespace` | string | — | 1-64, 不含空格/&/<, 最多 16 卡 |

**请求 JSON**:

```json
{
  "paymentInstrument": {
    "type": "card/front",
    "cardNumber": "4444333322221111",
    "cardExpiryDate": { "month": 5, "year": 2035 },
    "cardHolderName": "John Doe",
    "billingAddress": { "address1": "221B Baker Street", "city": "London", "postalCode": "NW1 6XE", "countryCode": "GB" }
  },
  "merchant": { "entity": "your_entity" }
}
```

**响应 JSON (201)**:

```json
{
  "tokenPaymentInstrument": { "type": "card/tokenized", "href": "https://try.access.worldpay.com/tokens/eyJr..." },
  "paymentInstrument": { "type": "card/masked", "cardNumber": "4444********1111", "bin": "444433", "brand": "VISA", "last4Digits": "1111" }
}
```

```typescript
async function createToken(card: {number,expiryMonth,expiryYear,holderName,billingAddress}, entity: string) {
  const { status, data } = await wpCall("POST", "/tokens",
    "application/vnd.worldpay.tokens-v3.hal+json", {
      paymentInstrument: {
        type: "card/front", cardNumber: card.number,
        cardExpiryDate: { month: card.expiryMonth, year: card.expiryYear },
        cardHolderName: card.holderName,
        billingAddress: { address1: card.billingAddress.line1,
          city: card.billingAddress.city, postalCode: card.billingAddress.postalCode,
          countryCode: card.billingAddress.country.toUpperCase() },
      }, merchant: { entity },
    });
  if (status === 201 || status === 200) {
    const d = data as any;
    return { tokenHref: d.tokenPaymentInstrument?.href, bin: d.paymentInstrument?.bin,
             last4: d.paymentInstrument?.last4Digits, brand: d.paymentInstrument?.brand };
  }
  if (status === 409) return { tokenHref: (data as any)._links["tokens:token"]?.href };
  throw new Error(`Token creation failed: HTTP ${status}`);
}
```

响应 (201):
```json
{"tokenPaymentInstrument":{"type":"card/tokenized","href":"https://try.access.worldpay.com/tokens/eyJr..."},
 "paymentInstrument":{"type":"card/masked","cardNumber":"4444********1111","bin":"444433","brand":"VISA","last4Digits":"1111"}}
```

### 7.4 Card Payments v7 — CIT 授权

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /cardPayments/customerInitiatedTransactions` |
| Media Type | `application/vnd.worldpay.payments-v7+json` |
| 参考 | https://developer.worldpay.com/products/card-payments |

**请求参数 (PayFac 必填)**:

| 参数 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `transactionReference` | string | ✅ | 1-64, 特殊字符有限 |
| `merchant.entity` | string | ✅ | 1-32 |
| `merchant.paymentFacilitator.schemeId` | string | ✅ | 1-11 位数字, **PayFac ID** |
| `merchant.paymentFacilitator.subMerchant.reference` | string | ✅ | 1-15, 字母数字 |
| `merchant.paymentFacilitator.subMerchant.name` | string | ✅ | 1-25 |
| `merchant.paymentFacilitator.subMerchant.address` | object | ✅ | street(≤50), postalCode(≤10), city(≤13), countryCode(2) |
| `instruction.value.amount` | int | ✅ | 最小单位 |
| `instruction.value.currency` | string | ✅ | 3 字符大写 ISO 4217 |
| `instruction.narrative.line1` | string | ✅ | 1-24 |
| `instruction.paymentInstrument.type` | string | ✅ | `"card/token"` |
| `instruction.paymentInstrument.href` | string | ✅ | Token href |
| `instruction.requestAutoSettlement.enabled` | bool | ✅ | auto-capture 开关 |
| `channel` | enum | ✅ | `"ecom"` \| `"moto"` |
| `authentication.threeDS` | object | — | 3DS 结果: version, eci, authenticationValue, transactionId |
| `riskProfile` | string | — | FraudSight riskProfile.href |
| `instruction.customerAgreement` | object | — | `{type:"cardOnFile",storedCardUsage:"first"}` 启用 MIT |

**请求 JSON (Token + 3DS + PayFac)**:

```json
{
  "transactionReference": "order-12345-abc",
  "merchant": {
    "entity": "your_entity",
    "paymentFacilitator": {
      "schemeId": "12345",
      "subMerchant": {
        "reference": "sub001", "name": "Sub Merchant",
        "address": { "street": "221B Baker Street", "postalCode": "SW1 1AA", "city": "London", "countryCode": "GB" }
      }
    }
  },
  "instruction": {
    "requestAutoSettlement": { "enabled": true },
    "narrative": { "line1": "MYSHOP.CO" },
    "value": { "amount": 250, "currency": "GBP" },
    "paymentInstrument": { "type": "card/token", "href": "https://try.access.worldpay.com/tokens/eyJr..." }
  },
  "channel": "ecom",
  "authentication": {
    "threeDS": { "version": "2.2.0", "eci": "05", "authenticationValue": "kBNHXUAy...", "transactionId": "b8fb4ecc-..." }
  },
  "riskProfile": "https://try.access.worldpay.com/riskProfile/eyJr..."
}
```

**响应 JSON (authorized)**:

```json
{
  "outcome": "authorized",
  "paymentId": "payI-dUcet9fk4_X4qZU0hpU0",
  "issuer": { "authorizationCode": "T31306" },
  "scheme": { "reference": "MCCOLXT1C0104  " },
  "_links": {
    "cardPayments:settle": { "href": "https://try.access.worldpay.com/payments/settlements/eyJr..." },
    "cardPayments:cancel": { "href": "https://try.access.worldpay.com/payments/authorizations/cancellations/eyJr..." },
    "cardPayments:events": { "href": "https://try.access.worldpay.com/payments/events/eyJr..." }
  }
}
```

### 7.4.1 MIT 授权

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /cardPayments/merchantInitiatedTransactions` |

与 CIT 差异:

| 字段 | CIT | MIT |
|------|-----|-----|
| `customerAgreement` | 可选, storedCardUsage=`"first"` | **必填**, storedCardUsage=`"subsequent"` + `schemeReference` |
| `authentication.threeDS` | 可选 | **不可传** |
| `channel` | `"ecom"` | 不需要 |

**请求 JSON**:

```json
{
  "transactionReference": "mit-12345",
  "merchant": { "entity": "your_entity", "paymentFacilitator": { "..." } },
  "instruction": {
    "requestAutoSettlement": { "enabled": true },
    "narrative": { "line1": "MYSHOP.CO" },
    "value": { "amount": 250, "currency": "GBP" },
    "paymentInstrument": { "type": "card/token", "href": "..." },
    "customerAgreement": { "type": "unscheduled", "storedCardUsage": "subsequent", "schemeReference": "MCCOLXT1C0104  " }
  }
}
```

### 7.4.2 HATEOAS 后续操作

不拼接 URL，直接使用授权响应 `_links` 中的 href:

```typescript
async function settle(links, full)  { return wpCall("POST", links[full?"cardPayments:settle":"cardPayments:partialSettle"]?.href, MEDIA_TYPE); }
async function refund(links, full, amt?) { return wpCall("POST", links[full?"cardPayments:refund":"cardPayments:partialRefund"]?.href, MEDIA_TYPE, full?undefined:{value:{amount:amt,currency:"GBP"}}); }
async function cancel(links) { return wpCall("POST", links["cardPayments:cancel"]?.href, MEDIA_TYPE); }
async function events(links) { return wpCall("GET",  links["cardPayments:events"]?.href, MEDIA_TYPE); }
```

### 7.5 3DS v2

| 属性 | 值 |
|------|-----|
| Media Type | `application/vnd.worldpay.verifications.customers-v2.hal+json` |
| 参考 | https://developer.worldpay.com/products/3ds |

#### DDC Init

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /verifications/customers/3ds/deviceDataInitialize` |

**请求 JSON**:

```json
{
  "transactionReference": "ddc-ref-001",
  "merchant": { "entity": "your_entity" },
  "paymentInstrument": { "type": "card/tokenized", "href": "https://try.access.worldpay.com/tokens/eyJr..." }
}
```

**响应 JSON**:

```json
{ "outcome": "initialized", "deviceDataCollection": { "jwt": "eyJ...", "url": "https://secure.worldpay.com/rp/api/ddc.html", "bin": "444433" } }
```

#### Authenticate

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /verifications/customers/3ds/authenticate` |

**请求参数 (关键)**:

| 参数 | 必填 | 说明 |
|------|------|------|
| `transactionReference` | ✅ | 唯一引用 |
| `merchant.entity` | ✅ | Entity |
| `instruction.value` | ✅ | amount + currency |
| `instruction.paymentInstrument` | ✅ | `{type:"card/tokenized",href}` |
| `deviceData.acceptHeader` | ✅ | 浏览器 Accept 头 |
| `deviceData.userAgentHeader` | ✅ | 浏览器 UA |
| `deviceData.collectionReference` | ✅ | DDC sessionId |
| `challenge.returnUrl` | ✅ | Gateway URL |
| `challenge.preference` | — | `noPreference`(默认), `challengeRequested` 等 |

**请求 JSON**:

```json
{
  "transactionReference": "3ds-ref-001",
  "merchant": { "entity": "your_entity" },
  "instruction": {
    "value": { "amount": 250, "currency": "GBP" },
    "paymentInstrument": { "type": "card/tokenized", "href": "..." }
  },
  "deviceData": { "acceptHeader": "text/html", "userAgentHeader": "Mozilla/5.0...", "collectionReference": "0_4XXXX..." },
  "challenge": { "returnUrl": "https://gateway.payfac.com/v1/3ds/callback?pi_id=xxx" }
}
```

**响应 — Frictionless**: `{"outcome":"authenticated","authentication":{"version":"2.2.0","eci":"05","authenticationValue":"kBNHXUAy...","transactionId":"b8fb4ecc-..."}}`

**响应 — Challenged**: `{"outcome":"challenged","challenge":{"reference":"uniqueChallengeRef12","url":"https://issuer-bank.com/acs/challenge","jwt":"eyJhbGci...","payload":"{...}"}}`

#### Verify

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /verifications/customers/3ds/verification` |

**请求 JSON**:

```json
{ "transactionReference": "verify-ref-001", "merchant": { "entity": "your_entity" }, "challenge": { "reference": "uniqueChallengeRef12" } }
```

> 无需 cres。Worldpay back-channel 已从 issuer ACS 获取 challenge 结果。

### 7.6 FraudSight v1

| 属性 | 值 |
|------|-----|
| Endpoint | `POST /fraudsight/assessment` |
| Media Type | `application/vnd.worldpay.fraudsight-v1.hal+json` |
| 参考 | https://developer.worldpay.com/products/fraudsight |

**请求参数**:

| 参数 | 必填 | 说明 |
|------|------|------|
| `transactionReference` | ✅ | 唯一引用 |
| `merchant.entity` | ✅ | Entity |
| `instruction.value` | ✅ | amount + currency |
| `instruction.paymentInstrument` | ✅ | `{type:"card/tokenized",href}` |
| `riskData.account.email` | 推荐 | 买家邮箱 |
| `riskData.account.shopperId` | 推荐 | 买家唯一 ID |
| `riskData.transaction.firstName/lastName` | 推荐 | 买家名 |
| `riskData.shipping` | 推荐 | 收货地址 |
| `deviceData.ipAddress` | 推荐 | 买家 IP |

**请求 JSON**:

```json
{
  "transactionReference": "fs-ref-001",
  "merchant": { "entity": "your_entity" },
  "instruction": { "value": { "amount": 250, "currency": "GBP" }, "paymentInstrument": { "type": "card/tokenized", "href": "..." } },
  "riskData": { "account": { "email": "john@example.com" }, "transaction": { "firstName": "John", "lastName": "Doe" } },
  "deviceData": { "ipAddress": "192.168.1.1" }
}
```

**响应 JSON**:

```json
{ "outcome": "lowRisk", "score": 12.5, "riskProfile": { "href": "https://try.access.worldpay.com/riskProfile/eyJr..." } }
```

| outcome | 网关默认处理 |
|---------|------------|
| `lowRisk` | 继续支付 |
| `review` | 继续 (admin 可配置 block) |
| `highRisk` | block (admin 可配置 proceed) |

### 7.7 Payment Queries v1

| 属性 | 值 |
|------|-----|
| Endpoint | `GET /paymentQueries/payments` |
| Media Type | `application/vnd.worldpay.payment-queries-v1.hal+json` |
| 参考 | https://developer.worldpay.com/products/payment-queries |

**查询参数**:

| 参数 | 必填 | 说明 |
|------|------|------|
| `startDate` | ✅ | ISO 8601, ≤ 1 年前 |
| `endDate` | ✅ | ISO 8601 |
| `pageSize` | — | 最大 300 |
| `currency` | — | 3 位币种 |
| `entityReferences` | — | Entity 引用 |
| `transactionReference` | — | 按引用精确查询 (不需 startDate/endDate) |
| `last4Digits` | — | 卡末四位 |

```bash
# 按日期
GET /paymentQueries/payments?startDate=2026-05-20T00:00:00Z&endDate=2026-05-25T23:59:59Z&pageSize=50
# 按引用
GET /paymentQueries/payments?transactionReference=order-12345
# 单笔
GET /paymentQueries/payments/{paymentId}
```

> 异步延迟最长 15 分钟。期间用 `GET /payments/events`。

### 7.8 Statements 2025-01-01

| 属性 | 值 |
|------|-----|
| Endpoint | `GET /accounts/statements` |
| Version Header | `WP-Api-Version: 2025-01-01` |
| Accept | `application/json` |
| 参考 | https://developer.worldpay.com/products/statements |

**查询参数**:

| 参数 | 必填 | 说明 |
|------|------|------|
| `startDate` | ✅ | ISO 8601, ≤ 31 天范围 |
| `endDate` | ✅ | 非未来日期 |
| `accountNumber` | 条件 | 16 位, 与 partyReference 二选一 |
| `partyReference` | 条件 | 子商户引用 (需同时传 entity + currency) |
| `pageNumber` | — | 默认 1 |
| `pageSize` | — | 1-500, 默认 500 |

```bash
GET /accounts/statements?startDate=2026-05-20T00:00:00Z&endDate=2026-05-25T23:59:59Z&accountNumber=0005553123712133
```

> ⚠️ amount 是实际金额 (£2.50), 非最小单位 (250)。

### 7.9 速查总表

| API | 端点 | Media Type |
|-----|------|-----------|
| Tokens v3 | `POST /tokens` | `tokens-v3.hal+json` |
| Card Payments CIT | `POST /cardPayments/customerInitiatedTransactions` | `payments-v7+json` |
| Card Payments MIT | `POST /cardPayments/merchantInitiatedTransactions` | 同上 |
| 3DS DDC | `POST /verifications/customers/3ds/deviceDataInitialize` | `verifications.customers-v2.hal+json` |
| 3DS Auth | `POST /verifications/customers/3ds/authenticate` | 同上 |
| 3DS Verify | `POST /verifications/customers/3ds/verification` | 同上 |
| FraudSight | `POST /fraudsight/assessment` | `fraudsight-v1.hal+json` |
| Payment Queries | `GET /paymentQueries/payments` | `payment-queries-v1.hal+json` |
| Statements | `GET /accounts/statements` | `WP-Api-Version: 2025-01-01` |

## 附录 A: 环境变量

```bash
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


---
