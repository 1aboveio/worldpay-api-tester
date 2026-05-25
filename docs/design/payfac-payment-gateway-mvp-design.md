# PayFac Payment Gateway — 一期 MVP 架构设计

> **文档状态**：Draft v2.0  
> **最后更新**：2026-05-25  
> **上游**：Worldpay Access Platform  
> **下游**：电商子商户 (E-commerce Sub-merchants)

---

## 目录

1. [架构总览](#1-架构总览)
2. [Worldpay Upstream 映射](#2-worldpay-upstream-映射)
3. [子商户 API 设计 (Stripe-style)](#3-子商户-api-设计-stripe-style)
4. [完整状态机](#4-完整状态机)
5. [核心业务流程](#5-核心业务流程)
6. [3DS 前端集成流程](#6-3ds-前端集成流程)
7. [FraudSight 后台策略](#7-fraudsight-后台策略)
8. [安全模型](#8-安全模型)
9. [MVP 范围与边界](#9-mvp-范围与边界)
10. [附录：Worldpay 请求/响应速查](#10-附录worldpay-请求响应速查)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                    Sub-merchants (E-commerce)                     │
│              Frontend SDK / REST Client                          │
│              Auth: API Key (Bearer Token)                        │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS / TLS 1.3
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PayFac Payment Gateway                       │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  API Layer (Stripe-compatible REST)                        │  │
│  │  PaymentIntents │ PaymentMethods │ Refunds │ Statements   │  │
│  └──────────────────────┬────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────┼────────────────────────────────────┐  │
│  │                      ▼                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │ Payment  │ │  3DS     │ │FraudSight│ │ Tokenization │ │  │
│  │  │Orchestr- │ │ Session  │ │  Engine   │ │   Service    │ │  │
│  │  │  ator    │ │ Manager  │ │(invisible)│ │              │ │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │  │
│  └───────┼────────────┼────────────┼───────────────┼─────────┘  │
│          │            │            │               │             │
│  ┌───────┼────────────┼────────────┼───────────────┼─────────┐  │
│  │       ▼            ▼            ▼               ▼         │  │
│  │            Worldpay Integration Adapters                   │  │
│  │  Card Payments v7 │ 3DS v2 │ FraudSight v1 │ Tokens v3   │  │
│  │  Payment Queries v1 │ Statements 2025-01-01               │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS / Basic Auth
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Worldpay Access Platform                        │
│  https://try.access.worldpay.com  (Test)                         │
│  https://access.worldpay.com      (Live)                         │
└──────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **Omni 统一接口** | 单一 `PaymentIntent` 端点同时支持 card/plain、card/token、MIT，参数控制 3DS 开关 |
| **Stripe 风格** | 面向子商户的 API 模仿 Stripe PaymentIntents / PaymentMethods 设计范式 |
| **透明增强** | Token 化、风控评估、3DS 编排对子商户透明，网关自动执行 |
| **默认自动请款** | Auth + Capture 合并，`capture_method: manual` 可切换为两步模式 |
| **PCI 不落地** | 卡号经 Token 化后存储，明文不落盘；子商户可直传卡号，网关即时 tokenize |

---

## 2. Worldpay Upstream 映射

### 2.1 功能 → Worldpay API

| 网关功能 | Worldpay API | 端点 |
|---------|-------------|------|
| **Token 化** | Tokens v3 | `POST /tokens` |
| **Token 查询** | Tokens v3 | `GET /tokens/{tokenId}` |
| **3DS 设备指纹** | 3DS v2 | `POST /verifications/customers/3ds/deviceDataInitialize` |
| **3DS 认证** | 3DS v2 | `POST /verifications/customers/3ds/authenticate` |
| **3DS Challenge 验证** | 3DS v2 | `POST /verifications/customers/3ds/verification` |
| **风控评估** | FraudSight v1 | `POST /fraudsight/assessment` |
| **CIT 授权** | Card Payments v7 | `POST /cardPayments/customerInitiatedTransactions` |
| **MIT 授权** | Card Payments v7 | `POST /cardPayments/merchantInitiatedTransactions` |
| **请款** | Card Payments v7 | `POST /payments/settlements/{linkData}` |
| **退款** | Card Payments v7 | `POST /payments/settlements/refunds/{linkData}` |
| **取消** | Card Payments v7 | `POST /payments/authorizations/cancellations/{linkData}` |
| **交易查询** | Payment Queries v1 | `GET /paymentQueries/payments` |
| **对账** | Statements 2025-01-01 | `GET /accounts/statements` |

### 2.2 PayFac 信息自动注入

```
子商户请求 (只有业务数据)          网关自动注入 (PayFac 合规信息)
┌─────────────────────┐         ┌────────────────────────────────┐
│ payment_method: {   │         │ merchant: {                    │
│   type: "card",     │   →     │   entity: "your_entity",           │ ← 按子商户路由
│   card: {...}       │         │   paymentFacilitator: {        │
│ }                   │         │     schemeId: "12345",         │ ← 全局 PayFac ID
└─────────────────────┘         │     subMerchant: {             │
                                  │       reference: "sub001",    │ ← 子商户标识
                                  │       name: "Merchant Store", │
                                  │       address: {...}          │
                                  │     }                         │
                                  │   }                           │
                                  │ }                             │
                                  └────────────────────────────────┘
```

---

## 3. 子商户 API 设计 (Stripe-style)

### 3.1 认证

所有请求使用 **API Key**：

```
Authorization: Bearer sk_live_YOUR_MERCHANT_SECRET_KEY
```

每个子商户分配独立的 API Key。网关校验后解析 `merchantId`，查询 entity 映射及 PayFac 配置，后续 Worldpay 调用自动注入。

### 3.2 接口总览

```
┌──────────────────────────────────────────────────────────────────┐
│                     Payment Intents                              │
│  POST   /v1/payment_intents            创建 (可一键确认)          │
│  GET    /v1/payment_intents/{id}       查询                      │
│  POST   /v1/payment_intents/{id}/confirm  确认支付               │
│  POST   /v1/payment_intents/{id}/capture   手动请款               │
│  POST   /v1/payment_intents/{id}/cancel    取消                  │
│  GET    /v1/payment_intents             列表                     │
├──────────────────────────────────────────────────────────────────┤
│                     Payment Methods                              │
│  POST   /v1/payment_methods             创建 (Tokenize)          │
│  GET    /v1/payment_methods/{id}        查询                     │
│  GET    /v1/payment_methods             列表                     │
├──────────────────────────────────────────────────────────────────┤
│                     3DS Sessions (前端)                           │
│  POST   /v1/3ds_sessions                创建 3DS 会话            │
│  POST   /v1/3ds_sessions/{id}/challenge_result  提交 Challenge 结果│
├──────────────────────────────────────────────────────────────────┤
│                     Refunds                                      │
│  POST   /v1/refunds                    创建退款                  │
│  GET    /v1/refunds/{id}               查询退款                  │
├──────────────────────────────────────────────────────────────────┤
│                     Statements                                   │
│  GET    /v1/statements                  对账单                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Payment Intent — 统一支付接口

#### 3.3.1 创建 PaymentIntent

```
POST /v1/payment_intents
```

**Omni 统一请求体**：

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

  "payment_method": {

    "type": "card_token",
    "token": "pm_abc123def456"

  },

  "confirm": true,
  "capture_method": "automatic",
  "description": "Order #12345",
  "statement_descriptor": "MYSHOP.CO",

  "three_d_secure": {
    "enabled": true,
    "return_url": "https://merchant.com/3ds/callback",
    "challenge_preference": "noPreference"
  },

  "customer": {
    "email": "user@example.com",
    "ip_address": "192.168.1.1"
  },
  "shipping": {
    "name": "John Doe",
    "address": {
      "line1": "10 Downing Street",
      "city": "London",
      "postal_code": "SW1A 2AA",
      "country": "GB"
    }
  },

  "setup_future_usage": "off_session",
  "metadata": {
    "order_id": "12345"
  }
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `amount` | integer | ✅ | 金额（最小货币单位，250 = £2.50） |
| `currency` | string | ✅ | ISO 4217 三位币种 |
| `payment_method.type` | enum | ✅ | `"card"` \| `"card_token"` |
| `payment_method.card` | object | 条件 | 当 type=`card` 时。网关即时 tokenize |
| `payment_method.token` | string | 条件 | 当 type=`card_token` 时。引用已有 PaymentMethod ID |
| `confirm` | boolean | — | `true` 立即支付 (默认)，`false` 仅创建待确认 |
| `capture_method` | enum | — | `"automatic"` (默认) \| `"manual"` |
| `three_d_secure.enabled` | boolean | — | 是否发起 3DS 认证。默认 `true` |
| `three_d_secure.return_url` | string | 条件 | 3DS challenge 完成后的回调 URL |
| `three_d_secure.challenge_preference` | enum | — | `"noPreference"` (默认), `"noChallengeRequested"`, `"challengeRequested"`, `"challengeMandated"` |
| `setup_future_usage` | enum | — | `"off_session"` → 存储卡信息，后续可 MIT 扣款 |
| `customer` | object | 推荐 | 买家信息 (email, ip) 用于风控 |
| `shipping` | object | 推荐 | 收货信息，用于风控 |
| `metadata` | object | — | 自定义键值对 |

**Omni: 三种支付方式路径**：

```
┌─────────────────────────────────────────────────────────────┐
│                     Payment Intent                          │
│                                                             │
│  payment_method:                                            │
│  ┌──────────────────────┐                                  │
│  │ type: "card"          │ → 网关即时 tokenize              │
│  │ card: { number, ... } │   → 3DS (可选)                   │
│  └──────────────────────┘   → CIT 授权                      │
│                                                             │
│  ┌──────────────────────┐                                  │
│  │ type: "card_token"    │ → 使用已有 token                 │
│  │ token: "pm_xxx"       │   → 3DS (可选)                   │
│  └──────────────────────┘   → CIT 授权                      │
│                                                             │
│  ┌──────────────────────┐                                  │
│  │ type: "card_token"    │ → MIT 模式 (off_session)          │
│  │ token: "pm_xxx"       │   → 无 3DS                        │
│  │ + confirm: true       │   → MIT 授权                      │
│  └──────────────────────┘   (需 setup_future_usage 前置)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3.2 PaymentIntent 响应

**立即成功** (frictionless 3DS + authorized)：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "object": "payment_intent",
  "amount": 250,
  "currency": "gbp",
  "status": "succeeded",
  "capture_method": "automatic",
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
  "created": "2026-05-25T08:00:00Z",
  "metadata": { "order_id": "12345" }
}
```

**需 3DS Challenge** (`status: "requires_action"`)：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_action",
  "next_action": {
    "type": "three_d_secure_challenge",
    "three_d_secure_challenge": {
      "challenge_url": "https://issuer-bank.com/acs/challenge",
      "session_id": "3ds_sess_abc123",
      "challenge_jwt": "eyJhbGci...",
      "challenge_payload": "{...}"
    }
  }
}
```

**需手动请款** (`capture_method: "manual"` 授权后)：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_capture",
  "amount_capturable": 250
}
```

**被拒绝**：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "payment_failed",
  "failure_code": "5",
  "failure_message": "REFUSED",
  "failure_advice": "01"
}
```

**暂未确认** (`confirm: false`)：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_confirmation"
}
```

#### 3.3.3 确认 PaymentIntent

```
POST /v1/payment_intents/{id}/confirm
```

> 用于 `confirm: false` 或 `requires_action` 完成后重新确认。会重新走 tokenize → 3DS → 授权流程。

#### 3.3.4 手动请款

```
POST /v1/payment_intents/{id}/capture
```

仅 `status: "requires_capture"` 时可调用。

可选部分请款：

```json
{ "amount_to_capture": 150 }
```

#### 3.3.5 取消

```
POST /v1/payment_intents/{id}/cancel
```

仅 `status: "requires_capture"` 时可取消授权。

### 3.4 Payment Method

#### 3.4.1 创建 (Tokenize)

```
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
    "billing_address": { ... }
  }
}
```

**响应**：

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

> 也可用在 PaymentIntent 中直接传 `payment_method.type: "card"` 即时 tokenize，无需预先创建。

### 3.5 3DS Session (前端)

```
POST /v1/3ds_sessions
```

由 PaymentIntent 返回 `requires_action` 后，前端调用此接口获取 challenge 所需数据。

```
POST /v1/3ds_sessions/{id}/challenge_result
```

前端完成 challenge iframe 后提交结果。详见 [§6. 3DS 前端流程](#6-3ds-前端集成流程)。

### 3.6 Refund

```
POST /v1/refunds
```

```json
{
  "payment_intent": "pi_K1a2b3c4d5e6",
  "amount": 250,
  "reason": "duplicate"
}
```

**响应**：

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

### 3.7 Statements (对账)

```
GET /v1/statements?from=2026-05-20T00:00:00Z&to=2026-05-25T23:59:59Z
```

**响应**：

```json
{
  "object": "list",
  "data": [
    {
      "id": "stmt_item_uuid",
      "type": "acquiring_settlement",
      "funding_type": "credit",
      "amount": 2.50,
      "currency": "gbp",
      "balance": 1250.00,
      "transaction_reference": "order-12345",
      "created": "2026-05-25T08:00:00Z"
    }
  ],
  "has_more": true
}
```

---

## 4. 完整状态机

### 4.1 PaymentIntent 生命周期

```
                              ┌─────────────┐
                              │  CREATED    │  ← POST /payment_intents (confirm: false)
                              └──────┬──────┘
                                     │ confirm / confirm: true
                                     ▼
                              ┌─────────────┐
                              │ TOKENIZING  │  ← 网关内部: 若 type=card, POST /tokens
                              └──────┬──────┘
                                     │
                         ┌───────────┼───────────┐
                         │ 失败       │ 成功       │
                         ▼           ▼           │
                    PAYMENT_     TOKENIZED       │
                    FAILED       │               │
                                 ▼               │
                          ┌─────────────┐        │
                          │RISK_ASSESSING│  ← 网关内部: POST /fraudsight/assessment
                          └──────┬──────┘        │ (子商户不可见)
                                 │               │
                                 ▼               │
                          ┌─────────────┐        │
                          │RISK_ASSESSED │        │
                          └──────┬──────┘        │
                                 │               │
                    ┌────────────┼────────────┐  │
                    │ 3DS OFF    │ 3DS ON     │  │
                    │            │            │  │
                    ▼            ▼            │  │
              ┌──────────┐ ┌──────────────┐  │  │
              │AUTHORIZING│ │AUTHENTICATING│  │  │ ← POST .../3ds/authenticate
              └─────┬────┘ └──────┬───────┘  │  │
                    │             │           │  │
                    │      ┌──────┼──────┐    │  │
                    │      │frictionless│    │  │
                    │      │   │challenged   │  │
                    │      ▼   │   ▼         │  │
                    │  AUTHOR- │ REQUIRES_   │  │
                    │  IZING   │ ACTION      │  │ ← 前端展示 3DS challenge
                    │      │   │   │         │  │
                    │      │   │   │ POST /3ds_sessions/{id}/
                    │      │   │   │       challenge_result
                    │      │   │   ▼         │  │
                    │      │   │ CHALLENGE_  │  │
                    │      │   │ COMPLETED   │  │
                    │      │   │   │         │  │
                    │      ▼   ▼   ▼         │  │
                    │  ┌──────────────────┐  │  │
                    │  │   AUTHORIZING    │ ◀┘  │ ← POST /cardPayments/...
                    │  └────────┬─────────┘     │
                    │           │                │
                    │   ┌───────┼───────┐        │
                    │   │authorized│refused│     │
                    │   ▼       │       ▼       │
                    │ AUTHORIZED│  PAYMENT_     │
                    │   │       │  FAILED       │
                    │   │       └───────────────┘
                    │   │
                    │   ├─── capture_method: automatic ───▶ CAPTURING ──▶ SUCCEEDED
                    │   │
                    │   ├─── capture_method: manual ──▶ REQUIRES_CAPTURE
                    │   │                                   │
                    │   │                          POST /capture  POST /cancel
                    │   │                               │            │
                    │   │                          CAPTURING      CANCELED
                    │   │                               │
                    │   └─────────────────────────── SUCCEEDED
                    │
                    └─── (direct) ──▶ AUTHORIZED / SUCCEEDED / PAYMENT_FAILED
```

### 4.2 PaymentIntent 状态定义

| 状态 | 含义 | 下一步 |
|------|------|--------|
| `CREATED` | 已创建，未确认 | 调用 `/confirm` |
| `TOKENIZING` | (内部) 卡号 tokenize 中 | — |
| `TOKENIZED` | (内部) token 化完成 | — |
| `RISK_ASSESSING` | (内部) 风控评估中 | — |
| `RISK_ASSESSED` | (内部) 风控完成 | — |
| `AUTHENTICATING` | (内部) 3DS 认证中 | — |
| `REQUIRES_ACTION` | 需 3DS Challenge | 前端完成 challenge → 网关继续 |
| `CHALLENGE_COMPLETED` | (内部) Challenge 验证完成 | — |
| `AUTHORIZING` | (内部) 支付授权中 | — |
| `REQUIRES_CAPTURE` | 已授权，等待请款 | `POST /capture` 或 `POST /cancel` |
| `SUCCEEDED` | ✅ 支付成功 | 终态 |
| `CANCELED` | ❌ 已取消 | 终态 |
| `PAYMENT_FAILED` | ❌ 支付失败 | 终态 |

> 标注 "(内部)" 的状态不对子商户暴露，对外展示时映射为 `processing`。

### 4.3 PaymentMethod 状态

```
  POST /payment_methods
         │
         ▼
    ┌─────────┐
    │ ACTIVE  │ ← 可用
    └────┬────┘
         │ (手动 / 卡过期)
         ▼
    ┌──────────┐
    │ EXPIRED  │
    └──────────┘
```

### 4.4 3DS Session 状态

```
  POST /3ds_sessions
         │
         ▼
    ┌───────────┐
    │ PENDING   │ ← 等待前端提交 challenge
    └─────┬─────┘
          │ POST /challenge_result
          ▼
    ┌───────────┐
    │ COMPLETED │ ← challenge 验证完成
    └───────────┘
```

---

## 5. 核心业务流程

### 5.1 标准支付 (Omni CIT + 3DS + Auto Capture)

```
Sub-merchant                PayFac Gateway                        Worldpay
     │                           │                                    │
     │ ① POST /payment_intents   │                                    │
     │   {amount, currency,      │                                    │
     │    payment_method: card,  │                                    │
     │    confirm: true,         │                                    │
     │    three_d_secure: true}  │                                    │
     │──────────────────────────▶│                                    │
     │                           │                                    │
     │                           │── ② Tokenize ────────────────────▶│ POST /tokens
     │                           │◀── token href ────────────────────│
     │                           │                                    │
     │                           │── ③ FraudSight Assess ───────────▶│ POST /fraudsight/assessment
     │                           │◀── riskProfile (lowRisk) ─────────│
     │                           │    (子商户不可见)                    │
     │                           │                                    │
     │                           │── ④ 3DS Authenticate ────────────▶│ POST .../3ds/authenticate
     │                           │◀── frictionless: authenticated ───│
     │                           │                                    │
     │                           │── ⑤ CIT Authorize ───────────────▶│ POST /cardPayments/...
     │                           │    (注入 payFac + entity +         │   {token, 3DS result,
     │                           │     riskProfile)                  │    riskProfile}
     │                           │◀── authorized ────────────────────│
     │                           │                                    │
     │                           │── ⑥ Auto Capture ────────────────▶│ POST /settlements/...
     │                           │◀── settled ───────────────────────│
     │                           │                                    │
     │◀── 200 {status:"succeeded"}│                                   │
```

### 5.2 3DS Challenge 路径

```
Sub-merchant                PayFac Gateway                        Worldpay
     │                           │                                    │
     │ ③ 3DS Authenticate        │                                    │
     │                           │── POST .../3ds/authenticate ─────▶│
     │                           │◀── outcome: challenged ───────────│
     │                           │                                    │
     │◀── {status:"requires_     │                                    │
     │     action",              │                                    │
     │     next_action: {        │                                    │
     │       challenge_url,      │                                    │
     │       session_id}}        │                                    │
     │                           │                                    │
     │ ④ 前端展示 challenge iframe                                    │
     │                           │                                    │
     │ ⑤ POST /3ds_sessions/     │                                    │
     │    {id}/challenge_result   │                                    │
     │──────────────────────────▶│                                    │
     │                           │── POST .../3ds/verification ─────▶│
     │                           │◀── authenticated ─────────────────│
     │                           │                                    │
     │                           │── CIT Authorize ─────────────────▶│
     │◀── {status:"succeeded"}   │◀── authorized ────────────────────│
```

### 5.3 MIT 循环扣款 (Off-session)

```
前提: CIT 支付时传入 setup_future_usage: "off_session"

Sub-merchant                PayFac Gateway                        Worldpay
     │                           │                                    │
     │ ① POST /payment_intents   │                                    │
     │   {amount, currency,      │                                    │
     │    payment_method: {      │                                    │
     │      type: card_token,    │                                    │
     │      token: "pm_xxx"      │  ← 已存储的 token                  │
     │    },                     │                                    │
     │    confirm: true          │                                    │
     │   }                       │                                    │
     │──────────────────────────▶│                                    │
     │                           │── MIT Authorize ─────────────────▶│ POST /cardPayments/
     │                           │    (无 3DS, 无 FraudSight,         │   merchantInitiated...
     │                           │     带 schemeTransactionRef)      │
     │                           │◀── authorized ────────────────────│
     │                           │                                    │
     │◀── {status:"succeeded"}   │                                    │
```

> **MIT 前置条件**：首次 CIT 支付必须传入 `setup_future_usage: "off_session"`，网关在 CIT 请求中加入 `customerAgreement: { type: "cardOnFile", storedCardUsage: "first" }`。后续 MIT 请求使用 `storedCardUsage: "subsequent"` 并传入 CIT 返回的 `scheme.reference`。

### 5.4 退款

```
POST /v1/refunds { payment_intent: "pi_...", amount: 250 }
         │
         ▼
   校验: PaymentIntent.status = "succeeded"
         │
         ▼
   Worldpay POST /payments/settlements/refunds/{linkData}
         │
         ▼
   更新状态 → Refund { status: "succeeded" }
```

### 5.5 对账 (T+1)

```
  Scheduler (Cron)
       │
       ▼
  GET /accounts/statements?fromDate=...&toDate=...
       │
       ▼
  Reconciliation Engine
  · 内部支付记录 ←→ Worldpay 对账单条目
  · 差异报告
```

---

## 6. 3DS 前端集成流程

### 6.1 整体时序

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Browser │    │Merchant  │    │  PayFac  │    │ Worldpay │
│          │    │ Backend  │    │ Gateway  │    │   3DS    │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     │ ① 下单        │               │               │
     │──────────────▶│               │               │
     │               │ ② POST        │               │
     │               │  /payment_    │               │
     │               │   intents     │               │
     │               │──────────────▶│               │
     │               │               │── 3DS auth ──▶│
     │               │               │◀─ challenged ─│
     │               │◀── 200 {      │               │
     │               │    status:    │               │
     │               │    "requires_ │               │
     │               │    action",   │               │
     │               │    next_action│               │
     │               │    {challenge_│               │
     │               │     url, jwt, │               │
     │               │     session_id│               │
     │               │    }          │               │
     │               │   }          │               │
     │               │               │               │
     │ ③ 浏览器收到 challenge 数据    │               │
     │◀──────────────│               │               │
     │               │               │               │
     │ ④ 打开 iframe / 全页重定向     │               │
     │   POST challenge_url + JWT    │               │
     │──────────────────────────────────────────────▶│
     │◀──────────────────── issuer ACS pages ───────│
     │   (持卡人输入 OTP / 生物识别)    │               │
     │               │               │               │
     │ ⑤ 完成 → 重定向到 return_url   │               │
     │◀──────────────│               │               │
     │               │               │               │
     │ ⑥ POST /3ds_sessions/         │               │
     │   {id}/challenge_result        │               │
     │──────────────▶│               │               │
     │               │──────────────▶│               │
     │               │               │── verify ────▶│
     │               │               │◀─ verified ───│
     │               │               │               │
     │               │               │── authorize ─▶│
     │               │               │◀─ authorized ─│
     │               │◀── 200 {status:"succeeded"}   │
     │◀──────────────│               │               │
```

### 6.2 前端实现要点

```
// ① 商户前端收到 requires_action 后的处理:

// 打开 3DS challenge iframe
const iframe = document.createElement('iframe');
iframe.src = nextAction.three_d_secure_challenge.challenge_url;
iframe.name = 'threeDSChallenge';
document.body.appendChild(iframe);

// 构建 challenge form (在 iframe 内)
const form = document.createElement('form');
form.method = 'POST';
form.action = challenge_url;
form.innerHTML = `
  <input type="hidden" name="JWT" value="${challenge_jwt}" />
  <input type="hidden" name="MD" value="${challenge_payload}" />
`;
form.submit();

// ② Challenge 完成后，issuer 重定向到 return_url
// ③ 前端提交结果到网关
fetch(`/v1/3ds_sessions/${sessionId}/challenge_result`, {
  method: 'POST',
  body: JSON.stringify({ cres: cresFromRedirect })
});
```

### 6.3 3DS Session API

```
POST /v1/3ds_sessions
  → 由 PaymentIntent requires_action 后端自动创建
  → 返回 session_id, challenge_url, jwt, payload

POST /v1/3ds_sessions/{id}/challenge_result
  Body: { "cres": "challenge_response_from_issuer" }
  → 网关调用 Worldpay POST .../3ds/verification
  → 继续 PaymentIntent 流程
```

---

## 7. FraudSight 后台策略

### 7.1 设计原则

> **FraudSight 对子商户完全不可见。** 子商户 API 中不暴露任何风控相关字段。

### 7.2 自动执行规则

每次 CIT 支付，网关自动调用 FraudSight：

```
Tokenize → FraudSight Assess → 3DS (可选) → Authorize
```

FraudSight 返回的 `riskProfile.href` 自动注入到 Card Payments 授权请求中。

### 7.3 后台 Override 开关

在网关管理后台，按子商户或全局维度控制：

| 开关 | 默认值 | 说明 |
|------|--------|------|
| `fraudsight.enabled` | `true` | 是否启用风控评估 |
| `fraudsight.action_on_high_risk` | `block` | `block`(拒绝支付) \| `flag`(仅标记) |
| `fraudsight.action_on_review` | `proceed` | `proceed`(放行) \| `block`(拒绝) |
| `fraudsight.exemption.enabled` | `true` | 是否申请 SCA 豁免 |
| `fraudsight.exemption.capability` | `authorizationAndAuthentication` | 豁免能力 |

```json
// 管理后台配置示例
{
  "fraudsight": {
    "enabled": true,
    "action_on_high_risk": "block",
    "action_on_review": "proceed",
    "exemption": {
      "enabled": true,
      "capability": "authorizationAndAuthentication"
    }
  }
}
```

### 7.4 与 3DS 的协作

FraudSight 的 SCA 豁免与 3DS 免挑战可同时生效：

- FraudSight 返回 `exemption.placement: "authentication"` → 3DS 认证时可免挑战
- FraudSight 返回 `exemption.placement: "authorization"` → 授权时可跳过 SCA

---

## 8. 安全模型

### 8.1 认证层级

```
┌────────────────────────────────────────────┐
│  子商户                                      │
│  Auth: Bearer {sk_live_xxx}   (API Key)    │
│  按请求的 API Key 解析 merchantId             │
└──────────────────┬─────────────────────────┘
                   ▼
┌────────────────────────────────────────────┐
│  网关内部                                     │
│  merchantId → worldpayEntity 查找表          │
│  paymentFacilitator 自动注入                  │
│  卡号即时 tokenize，不落盘                     │
│  worldpay token href 加密存储                 │
│  Worldpay 凭证统一管理 (Secret Manager)       │
└──────────────────┬─────────────────────────┘
                   ▼
┌────────────────────────────────────────────┐
│  Worldpay                                    │
│  Auth: Basic (username:password → Base64)   │
│  TLS 1.3 + DNS Whitelisting                 │
└────────────────────────────────────────────┘
```

### 8.2 PCI 策略

| 数据 | 传输 | 存储 | 措施 |
|------|------|------|------|
| 卡号 (PAN) | ✅ TLS 传输 | ❌ 不落盘 | 即时 POST /tokens，仅存 token href |
| CVC | ✅ TLS 传输 | ❌ 不存 | Token 化后即丢弃 |
| Token href | ✅ 加密传输 | ✅ AES-256 加密 | 仅加密存储 |
| 脱敏信息 | — | ✅ 明文 | BIN + last4 + brand + expiry |

> **最佳实践**：商户前端使用 Worldpay Sessions API 直接在浏览器端 tokenize 卡号，网关彻底不接触明文。MVP 阶段可先由网关中转 tokenize。

---

## 9. MVP 范围与边界

### 9.1 In Scope

| 模块 | 内容 |
|------|------|
| **Omni 统一支付** | PaymentIntent 支持 card、card_token、MIT 三种方式 |
| **3DS** | 3DS v2 全流程（deviceData → authenticate → challenge → verify） |
| **FraudSight** | 自动评估 + riskProfile 注入 + 后台开关 |
| **Token 化** | 即时 tokenize + 预创建 PaymentMethod |
| **MIT** | CIT `setup_future_usage` → MIT `off_session` 扣款 |
| **默认自动请款** | `capture_method: automatic` (默认) |
| **退款** | 全额 / 部分退款 |
| **交易查询** | 按 ID + 按日期列表 |
| **对账** | 按日期范围拉取 Statement |
| **认证** | API Key (Bearer Token) per merchant |

### 9.2 Out of Scope (二期)

| 项目 | 说明 |
|------|------|
| 子商户入驻 (Parties API) | 一期手动映射 entity，二期自动 |
| 分账 (Split Payments) | 二期 |
| 打款 (Account Payouts) | 二期 |
| APM 本地支付 | 仅卡支付 |
| Apple Pay / Google Pay | 二期 |
| Network Tokens | 二期 |
| Verified Tokens | 二期 |
| Account Updater | 二期 |
| Webhook 推送 | 一期仅查询，二期加推模式 |
| 商户 Portal UI | 二期 |

---

## 10. 附录：Worldpay 请求/响应速查

### 10.1 各 API 版本 Header

| API | Version | Accept / Content-Type |
|-----|---------|----------------------|
| Card Payments v7 | v7 | `application/vnd.worldpay.payments-v7+json` |
| 3DS | v2 | `application/vnd.worldpay.verifications.customers-v2.hal+json` |
| FraudSight | v1 | `application/vnd.worldpay.fraudsight-v1.hal+json` |
| Tokens | v3 | `application/vnd.worldpay.tokens-v3.hal+json` |
| Payment Queries | v1 | `application/vnd.worldpay.payment-queries-v1.hal+json` |
| Statements | 2025-01-01 | `WP-Api-Version: 2025-01-01` |

### 10.2 PayFac 必填字段

```json
// 每笔 CIT/MIT 授权自动注入:
{
  "merchant": {
    "entity": "your_entity",
    "paymentFacilitator": {
      "schemeId": "12345",
      "subMerchant": {
        "reference": "sub001",
        "name": "Sub Merchant Name",
        "address": {
          "street": "221B Baker Street",
          "postalCode": "SW1 1AA",
          "city": "London",
          "countryCode": "GB"
        }
      }
    }
  }
}
```

### 10.3 测试环境

| 项目 | 值 |
|------|-----|
| Base URL | `https://try.access.worldpay.com` |
| 测试 Entity | `your_entity` (已验证) |
| 测试卡号 | `4444333322221111` (VISA credit) |
| 测试卡有效期 | `05/2035` |
| 测试 CVC | `123` |
| Payment Queries 异步延迟 | 3~15 分钟 |

### 10.4 MIT 关键字段

```
CIT (首次):
  customerAgreement.type = "cardOnFile"
  customerAgreement.storedCardUsage = "first"

MIT (后续):
  customerAgreement.type = "cardOnFile"
  customerAgreement.storedCardUsage = "subsequent"
  schemeTransactionReference = {CIT 返回的 scheme.reference}
```

### 10.5 3DS 认证结果映射

| WP Outcome | PaymentIntent Status |
|------------|---------------------|
| `authenticated` | → 继续 AUTHORIZING |
| `challenged` | → `REQUIRES_ACTION` |
| `notEnrolled` | → 继续 AUTHORIZING (无 3DS 保障) |
| `unavailable` | → 继续 AUTHORIZING |
| `authenticationFailed` | → `PAYMENT_FAILED` |
