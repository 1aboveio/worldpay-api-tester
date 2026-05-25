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
| **退款 (全额)** | Card Payments v7 | `POST /payments/settlements/refunds/full/{linkData}` |
| **退款 (部分)** | Card Payments v7 | `POST /payments/settlements/refunds/partials/{linkData}` |
| **请款 (全额)** | Card Payments v7 | `POST /payments/settlements/{linkData}` |
| **请款 (部分)** | Card Payments v7 | `POST /payments/settlements/partials/{linkData}` |
| **取消 (全额)** | Card Payments v7 | `POST /payments/authorizations/cancellations/{linkData}` |
| **取消 (部分)** | Card Payments v7 | `POST /payments/authorizations/cancellations/partials/{linkData}` |
| **冲正** | Card Payments v7 | `POST /payments/sales/reversals/{linkData}` |
| **支付状态恢复** | Card Payments v7 | `GET /payments/events` |
| **交易查询 (列表)** | Payment Queries v1 | `GET /paymentQueries/payments` |
| **交易查询 (单笔)** | Payment Queries v1 | `GET /paymentQueries/payments/{paymentId}` |
| **对账** | Statements 2025-01-01 | `GET /accounts/statements` |

### 2.1.1 HATEOAS linkData 说明

Worldpay Card Payments 授权成功后返回 `_links` 对象，内含后续操作的完整加密 URL（即 `{linkData}`）：

```json
// CIT 授权成功后响应中的 _links
{
  "_links": {
    "cardPayments:settle":        { "href": ".../payments/settlements/{linkData}" },
    "cardPayments:partialSettle": { "href": ".../payments/settlements/partials/{linkData}" },
    "cardPayments:cancel":        { "href": ".../payments/authorizations/cancellations/{linkData}" },
    "cardPayments:partialCancel": { "href": ".../payments/authorizations/cancellations/partials/{linkData}" },
    "cardPayments:refund":        { "href": ".../payments/settlements/refunds/full/{linkData}" },
    "cardPayments:partialRefund": { "href": ".../payments/settlements/refunds/partials/{linkData}" },
    "cardPayments:reverse":       { "href": ".../payments/sales/reversals/{linkData}" },
    "cardPayments:events":        { "href": ".../payments/events/{linkData}" }
  }
}
```

> Gateway 存储所有 `_links` href，后续操作直接使用完整加密 URL。

### 2.1.2 Payment Queries 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `startDate` | ISO 8601 | ✅ | 开始时间 |
| `endDate` | ISO 8601 | ✅ | 结束时间 |
| `pageSize` | integer | — | 每页数量 (最大 300) |
| `currency` | string | — | 三位币种 |
| `entityReferences` | string | — | Entity 引用 (逗号分隔) |
| `transactionReference` | string | — | 按交易引用精确查询 |
| `last4Digits` | string | — | 卡末四位 |
| `receivedEvents` | string | — | 事件类型筛选 |

> 按 `transactionReference` 查询时不需 `startDate`/`endDate`。

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
│  POST   /v1/payment_intents/{id}/device_data  回传 DDC 结果     │
│  POST   /v1/payment_intents/{id}/capture   手动请款               │
│  POST   /v1/payment_intents/{id}/cancel    取消                  │
│  GET    /v1/payment_intents             列表                     │
├──────────────────────────────────────────────────────────────────┤
│                     Payment Methods                              │
│  POST   /v1/payment_methods             创建 (Tokenize)          │
│  GET    /v1/payment_methods/{id}        查询                     │
│  GET    /v1/payment_methods             列表                     │
├──────────────────────────────────────────────────────────────────┤
│                     3DS Callback (Gateway 内部)                   │
│  GET    /v1/3ds/callback                Issuer challenge 完成回调 │
├──────────────────────────────────────────────────────────────────┤
│                     Refunds                                      │
│  POST   /v1/refunds                    创建退款                  │
│  GET    /v1/refunds/{id}               查询退款                  │
├──────────────────────────────────────────────────────────────────┤
│                     Statements                                   │
│  GET    /v1/statements                  对账单                   │
└──────────────────────────────────────────────────────────────────┘
```

> **注意**：3DS DDC 结果通过 `POST /payment_intents/{id}/device_data` 回传，Challenge 回调由 Gateway `/v1/3ds/callback` 自动处理。商户只需调 PaymentIntent 接口，无需感知 3DS 内部细节。

### 3.2.1 幂等性

所有写操作支持 `Idempotency-Key` 请求头：

```
POST /v1/payment_intents
Idempotency-Key: order-12345-2026-05-25-001
```

| 规则 | 说明 |
|------|------|
| 作用范围 | 同一 API Key 下全局唯一 |
| TTL | 24 小时。超时后相同 key 视为新请求 |
| 冲突处理 | 返回首次请求的缓存响应 (HTTP 200 + 原 status) |
| 适用端点 | `POST /payment_intents`, `POST /refunds`, `POST /capture`, `POST /cancel`, `POST /confirm` |
| Worldpay 层 | `transactionReference` 作为 Worldpay 侧二级幂等 |

> **关键场景**：网络超时时重试不会产生重复扣款。Gateway 崩溃后重启，未落盘的支付可通过 `GET /payments/events` 恢复。

### 3.3 Payment Intent — 统一支付接口

#### 3.3.1 创建 PaymentIntent

```
POST /v1/payment_intents
```

**Omni 统一请求体**。三种 payment_method 方式任选其一：

**方式 1：直接传卡号（网关即时 tokenize）**

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
  "capture_method": "automatic",
  "description": "Order #12345",
  "statement_descriptor": "MYSHOP.CO",
  "three_d_secure": { "enabled": true, "return_url": "https://merchant.com/3ds/callback" },
  "customer": { "email": "user@example.com", "ip_address": "192.168.1.1" },
  "setup_future_usage": "off_session",
  "metadata": { "order_id": "12345" }
}
```

**方式 2：使用已存储的卡 token**

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

**方式 3：MIT 循环扣款（需 CIT 时 setup_future_usage 前置）**

```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card_token",
    "token": "pm_abc123def456"
  },
  "confirm": true
  // 无 three_d_secure 字段 → Gateway 识别为 MIT, 跳过 3DS + FraudSight
}
```
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
  "three_d_secure": {
    "status": "authenticated"
  },
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

**需 DDC 设备指纹** (`status: "requires_device_data"`)：

```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_device_data",
  "next_action": {
    "type": "device_data_collection",
    "device_data_collection": {
      "ddc_url": "https://secure.worldpay.com/.../ddc.html",
      "ddc_jwt": "eyJ0eXAiOiJKV1Qi..."
    }
  }
}
```

> 前端运行隐藏 iframe DDC，完成后 `POST /v1/payment_intents/{id}/device_data` 回传 `collectionReference`。

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

### 3.5 Refund

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
GET /v1/statements?from_date=2026-05-20T00:00:00Z&to_date=2026-05-25T23:59:59Z&page=1

Worldpay 实际参数: startDate, endDate (ISO 8601), accountNumber (16位),
                  pageNumber, pageSize (最大500)
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
              │AUTHORIZING│ │ DDC_INITIAL- │  │  │ ← POST .../deviceDataInitialize
              └─────┬────┘ │    IZING     │  │  │    获取 { jwt, url }
                    │      └──────┬───────┘  │  │
                    │             │           │  │
                    │             ▼           │  │
                    │      ┌──────────────┐  │  │
                    │      │  REQUIRES_   │  │  │ ← 前端运行隐藏 iframe DDC
                    │      │ DEVICE_DATA  │  │  │    浏览器收集指纹 → sessionId
                    │      └──────┬───────┘  │  │
                    │             │ 前端回传 sessionId
                    │             ▼           │  │
                    │      ┌──────────────┐  │  │
                    │      │AUTHENTICATING│  │  │ ← POST .../3ds/authenticate
                    │      └──────┬───────┘  │  │    (含 collectionReference)
                    │             │           │  │
                    │      ┌──────┼──────┐    │  │
                    │      │frictionless│    │  │
                    │      │   │challenged   │  │
                    │      ▼   │   ▼         │  │
                    │  AUTHOR- │ REQUIRES_   │  │
                    │  IZING   │ ACTION      │  │ ← 前端展示 3DS challenge
                    │      │   │   │         │  │
                    │      │   │   │ (issuer 完成 → 重定向到 Gateway →
                    │      │   │   │  Gateway POST .../verification →
                    │      │   │   │  获取 auth 结果 → 重定向到商户)
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
| `DDC_INITIALIZING` | (内部) DDC 初始化中 | — |
| `REQUIRES_DEVICE_DATA` | 需前端运行 DDC | 前端运行隐藏 iframe → 回传 sessionId |
| `AUTHENTICATING` | (内部) 3DS 认证中 | — |
| `REQUIRES_ACTION` | 需 3DS Challenge | 浏览器完成 challenge → Gateway 回调自动处理 |
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

### 4.4 DDC Session 状态

```
  POST /payment_intents (3DS enabled)
         │
         ▼
    ┌──────────────┐
    │ DDC PENDING  │ ← 前端收到 ddc_url + jwt
    └─────┬────────┘
          │ 前端运行隐藏 iframe DDC
          │ POST /payment_intents/{id}/device_data
          ▼
    ┌──────────────┐
    │ DDC COMPLETE │ ← 网关收到 sessionId, 继续 authenticate
    └──────────────┘
```

### 4.5 3DS Challenge 状态

```
  POST .../3ds/authenticate
         │
         ▼ (frictionless)
    ┌──────────────┐      ┌──────────────┐
    │ AUTHENTICATED│      │  CHALLENGED  │ ← 返回 challenge url + jwt
    └──────────────┘      └──────┬───────┘
                                 │ 浏览器 → issuer ACS
                                 │ issuer 完成 → Gateway callback
                                 ▼
                          ┌──────────────┐
                          │   VERIFIED   │ ← POST .../verification
                          └──────────────┘
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
     │                           │── ④ DDC Init ────────────────────▶│ POST .../deviceDataInitialize
     │                           │◀── {ddc_url, ddc_jwt} ──────────│
     │◀── {status:"requires_     │                                    │
     │     device_data",         │                                    │
     │     ddc: {url, jwt}}      │                                    │
     │                           │                                    │
     │ ⑤ 前端运行 DDC (隐藏 iframe)│                                    │
     │    → 获取 sessionId        │                                    │
     │                           │                                    │
     │ POST /payment_intents/     │                                    │
     │   {id}/device_data         │                                    │
     │──────────────────────────▶│                                    │
     │                           │── ⑥ 3DS Authenticate ───────────▶│ POST .../3ds/authenticate
     │                           │    (含 deviceData.                │   {collectionReference}
     │                           │     collectionReference)          │
     │                           │◀── frictionless: authenticated ───│
     │                           │                                    │
     │                           │── ⑦ CIT Authorize ───────────────▶│ POST /cardPayments/...
     │                           │    (注入 payFac + entity +         │   {token, 3DS result,
     │                           │     riskProfile)                  │    riskProfile}
     │                           │◀── authorized ────────────────────│
     │                           │                                    │
     │                           │── ⑧ Auto Capture ────────────────▶│ POST /settlements/...
     │                           │◀── settled ───────────────────────│
     │                           │                                    │
     │◀── 200 {status:"succeeded"}│                                   │
```

### 5.2 3DS Challenge 路径 (Redirect 模式)

```
Sub-merchant前端           Browser            PayFac Gateway           Issuer ACS
     │                        │                      │                     │
     │                        │    requires_action   │                     │
     │◀──── {status:"requires_action",               │                     │
     │        challenge_url, jwt}────────────────────│                     │
     │                        │                      │                     │
     │ ③ 打开 iframe/redirect  │                      │                     │
     │───────────────────────▶│                      │                     │
     │                        │ ④ POST {JWT}         │                     │
     │                        │──────────────────────────────────────────▶│
     │                        │◀──── OTP / 生物识别 ─────────────────────│
     │                        │                      │                     │
     │                        │ ⑤ 认证完成            │                     │
     │                        │ issuer 302 → Gateway  │                     │
     │                        │─────────────────────▶│                     │
     │                        │                      │── verify ──────────▶│ Worldpay
     │                        │                      │◀─ authenticated ───│
     │                        │                      │── authorize ───────▶│
     │                        │                      │◀─ authorized ──────│
     │                        │◀─ 302 → merchant URL  │                     │
     │◀── return_url?status=succeeded ───────────────│                     │
     │                        │                      │                     │
     │ GET /payment_intents/{id}                      │                     │
     │──────────────────────────────────────────────▶│                     │
     │◀── {status:"succeeded"}                       │                     │
```

### 5.3 MIT 循环扣款 (Off-session)

**前置条件**：CIT 支付时传入 `setup_future_usage: "off_session"`。

CIT 授权响应中包含 `scheme.reference`，Gateway 存储该值用于后续 MIT：

```json
// CIT 授权响应关键字段
{
  "outcome": "authorized",
  "scheme": {
    "reference": "MCCOLXT1C0104  "    // ← Gateway 存储此值
  }
}
```

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
  GET /accounts/statements?startDate=...&endDate=...&accountNumber=...
       │
       ▼
  Reconciliation Engine
  · 内部支付记录 ←→ Worldpay 对账单条目
  · 差异报告
```

### 5.6 超时恢复

当 Gateway 向 Worldpay 发起请求后超时（网络抖动、Worldpay 响应慢），不应直接重试授权（避免重复扣款）。恢复流程：

```
  Gateway 超时 (authorize / settle / refund)
       │
       ▼
  标记 PaymentIntent 状态为 "unknown"
       │
       ▼
  GET /payments/events/{linkData}   ← Worldpay 状态恢复端点
       │
       ├── 返回 authorized → 记录结果, 恢复状态
       ├── 返回 refused    → 标记失败
       └── 返回 404        → 原请求未到达 Worldpay, 可安全重试
```

### 5.7 错误处理策略

| 场景 | HTTP | 处理方式 |
|------|------|---------|
| Worldpay 5xx | 502 | 不重试。标记 `processing`，异步通过 `/payments/events` 恢复 |
| Worldpay 4xx (validation) | 400 | 直接返回错误。不重试 |
| Worldpay 401/403 | 500 | 告警。凭证或权限问题 |
| 网络超时 (< 5s) | — | 见 [§5.6 超时恢复](#56-超时恢复) |
| FraudSight highRisk + block | 200 | `status: "payment_failed"`, `failure_code: "high_risk"` |
| FraudSight review | 200 | 继续授权（默认 `action_on_review: proceed`）|
| 3DS authenticationFailed | 200 | `status: "payment_failed"`, `failure_code: "3ds_failed"` |
| CIT refused by issuer | 200 | `status: "payment_failed"` + refusal code |
| 重复 Idempotency-Key | 200 | 返回首次缓存的响应 |

### 5.8 MIT 路径（状态机补充）

MIT 跳过 FraudSight、DDC、3DS 三步，直接走简化路径：

```
  TOKENIZED → AUTHORIZING → AUTHORIZED → CAPTURING → SUCCEEDED
  (跳过: RISK_ASSESSING, DDC_INITIALIZING, AUTHENTICATING)
```

> Gateway 识别 MIT：`payment_method.type = "card_token"` 且请求中无 `three_d_secure` 字段，且 token 关联的 CIT 有 `setup_future_usage` 记录。

---

## 6. 3DS 前端集成流程

### 6.1 组件关系

```
                   ┌────────────────────┐
                   │    Merchant 后端    │
                   │  (API Key auth)    │
                   └────────┬───────────┘
                            │ POST /payment_intents
                            ▼
┌───────────────────────────────────────────────────────┐
│                   PayFac Gateway                      │
│                                                       │
│  ① Tokenize → ② FraudSight → ③ DDC Init →            │
│  ④ Authenticate → ⑤ Authorize → ⑥ Capture            │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐                   │
│  │ DDC Manager │  │ Challenge   │                   │
│  │ (隐藏 iframe)│  │  (challenge) │                   │
│  └─────────────┘  └──────────────┘                   │
└───────────────────────────────────────────────────────┘
           │                      │
           │ DDC iframe           │ Challenge iframe / redirect
           ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  Worldpay DDC URL    │  │  Issuer ACS URL      │
│  (设备指纹采集)        │  │  (OTP / 生物识别)    │
└──────────────────────┘  └──────────────────────┘
```

### 6.2 DDC (Device Data Collection) 设备指纹

**触发时机**：紧接在 FraudSight 评估之后、3DS authenticate 之前。

**为什么必须做 DDC？**
- 3DS v2 要求 issuer 获取设备指纹以做风险评估
- DDC 收集浏览器信息（语言、时区、屏幕尺寸、插件等）
- 不做 DDC 会导致 issuer 无法完成风险分析，增加 challenge 率

**网关处理**：

```
Gateway                              Worldpay
   │                                     │
   │── ① POST /deviceDataInitialize ───▶│
   │    { transactionReference,          │
   │      merchant.entity,               │
   │      paymentInstrument (token) }    │
   │◀── { outcome: "initialized",       │
   │      deviceDataCollection: {        │
   │        jwt: "eyJ...",              │
   │        url: "https://.../ddc.html",│
   │        bin: "444433"               │
   │      }}                             │
   │                                     │
   │ ② 返回给浏览器:                      │
   │    status: "requires_device_data"   │
   │    ddc: { jwt, url }               │
```

**前端处理（隐藏 iframe, 用户无感）**：

```html
<!-- 商户 checkout 页面自动执行 -->
<script>
  // 创建隐藏 iframe
  const iframe = document.createElement('iframe');
  iframe.src = ddcUrl;   // https://secure.worldpay.com/.../ddc.html
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  // DDC iframe 加载后 POST JWT
  iframe.onload = () => {
    const form = iframe.contentDocument.createElement('form');
    form.method = 'POST';
    form.action = ddcUrl;
    form.innerHTML = `<input name="JWT" value="${ddcJwt}" />`;
    form.submit();
  };

  // DDC 完成 → postMessage 返回 sessionId
  window.addEventListener('message', (event) => {
    if (event.origin === 'https://secure.worldpay.com') {
      const sessionId = event.data.sessionId;
      // 回传给网关
      fetch(`/v1/payment_intents/${piId}/device_data`, {
        method: 'POST',
        body: JSON.stringify({ collection_reference: sessionId })
      });
    }
  });
</script>
```

> **用户体验**：DDC 在隐藏 iframe 中运行，约 2-5 秒完成。用户点击"支付"按钮时，DDC 通常已经完成，无需额外等待。

### 6.3 3DS Challenge 流程

**两种模式**：

| 模式 | 适用场景 | 方式 | 用户体验 |
|------|---------|------|---------|
| **Iframe 模式** | Web checkout | 弹出 iframe/lightbox | 不离开商户页面 |
| **Redirect 模式** | 不支持 iframe 的场景 | 整页跳转 | 跳转到银行页面 |

**Challenge 回调路径**：`Issuer ACS → PayFac Gateway → Browser → Merchant Page`

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Browser  │  │ Merchant │  │  PayFac  │  │  Issuer  │  │ Worldpay │
│          │  │  Backend │  │ Gateway  │  │   ACS    │  │   3DS    │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │             │             │             │
     │ ① 用户点击支付  │             │             │             │
     │─────────────▶│             │             │             │
     │              │ ② POST      │             │             │
     │              │  /payment_  │             │             │
     │              │   intents   │             │             │
     │              │────────────▶│             │             │
     │              │             │── DDC init ▶│             │
     │◀── DDC ──────│◀────────────│             │             │
     │── sessionId ▶│────────────▶│             │             │
     │              │             │── authenticate ─────────▶│
     │              │             │◀─ outcome: challenged ───│
     │              │◀── {status: │             │             │
     │◀── requires_ │  "requires_ │             │             │
     │    action,   │   action",  │             │             │
     │    challenge │   challenge │             │             │
     │    url+jwt}  │    url+jwt} │             │             │
     │              │             │             │             │
     │ ③ 打开 iframe / redirect    │             │             │
     │   POST {JWT} to challenge_url           │             │
     │────────────────────────────────────────▶│             │
     │◀───────────── OTP / 生物识别 ───────────│             │
     │              │             │             │             │
     │ ④ 认证完成    │             │             │             │
     │              │             │             │             │
     │    [Redirect 模式]                       │             │
     │    issuer 重定向到 Gateway 回调 URL       │             │
     │──────────────┼────────────▶│             │             │
     │              │             │── verify ──────────────▶│
     │              │             │◀─ authenticated ────────│
     │              │             │── authorize ───────────▶│
     │              │             │   (3DS auth result +   │
     │              │             │    riskProfile)        │
     │              │             │◀─ authorized ──────────│
     │              │             │                         │
     │    Gateway 重定向到 merchant return_url              │
     │◀─────────────┼─────────────│             │             │
     │    (URL 参数: pi_id, status)             │             │
     │              │             │             │             │
     │    [Iframe 模式]                            │             │
     │    issuer ACS 通过 postMessage 发出结果    │             │
     │◀── postMessage ───────────│             │             │
     │              │             │             │             │
     │ ⑤ 网关收到结果后继续执行     │             │             │
     │    Gateway → verify → authorize            │             │
     │              │◀── 200 {status:"succeeded"}  │             │
     │◀── succeeded │             │             │             │
```

### 6.4 Stripe 的实现方式

作为对比，Stripe 的做法：

```
Stripe.js (浏览器端)                          Stripe 后端
      │                                            │
      │ ① 页面加载时自动运行 DDC                       │
      │    (通过 stripe.js 内置的指纹采集)             │
      │                                            │
      │ ② createPaymentMethod() → 卡号 token 化      │
      │────────────────────────────────────────────▶│
      │                                            │
      │ ③ confirmCardPayment()                     │
      │────────────────────────────────────────────▶│
      │                                            │── 3DS authenticate
      │                                            │◀─ challenged
      │◀── { status: "requires_action",            │
      │      next_action: {                        │
      │        type: "redirect_to_url",             │
      │        redirect_to_url: {                  │
      │          url: "https://hooks.stripe.com/    │ ← Stripe 的 URL!
      │                3d_secure_2/..."            │
      │        }                                   │
      │      }}                                    │
      │                                            │
      │ ④ 浏览器重定向到 Stripe URL                   │
      │────────────────────────────────────────────▶│
      │    Stripe 302 → issuer ACS URL              │
      │    (Stripe 做了一层代理转发)                  │
      │                                            │
      │ ⑤ Issuer ACS 完成 → 重定向到 Stripe URL      │
      │────────────────────────────────────────────▶│
      │    Stripe 处理 cres → verify →               │
      │    302 → merchant return_url                │
      │                                            │
      │◀── 重定向到 merchant 页面                     │
      │     + Stripe.js 自动更新 PaymentIntent 状态  │
```

**Stripe 的关键设计**：
1. `return_url` 指向 Stripe 自己的 URL (`hooks.stripe.com`)
2. Issuer → Stripe → (302) → Merchant。Stripe 在中间层处理 verify，商户只收到最终结果
3. DDC 由 Stripe.js 在页面加载时静默完成

### 6.5 我们的设计

基于 Stripe 范式 + Worldpay 约束：

```
Gateway 回调 URL 设计:

  authenticate 请求中:
    challenge.returnUrl = "https://gateway.payfac.com/v1/3ds/callback"
                          ?pi_id=xxx&session_id=yyy

  流程:
    ① Issuer ACS 完成 challenge
    ② 浏览器被 302 到 gateway URL
    ③ Gateway 收到回调:
       - 从 session 中取出 challenge.reference
       - POST /verifications/customers/3ds/verification
       - 获取 authentication 结果
       - 执行 CIT 授权 (POST /cardPayments/...)
       - 302 重定向浏览器到 merchant.return_url
         ?pi_id=xxx&status=succeeded
    ④ 商家页面加载，轮询 GET /payment_intents/{id} 确认最终状态
```

**Gateway 回调端点**：

```
GET/POST /v1/3ds/callback?pi_id={pi_id}&session_id={session_id}

  → 浏览器从 issuer ACS 被重定向到此 URL
  → Gateway server-side:
     1. 查询 session → 获取 challengeReference, merchantReturnUrl
     2. POST Worldpay verification
     3. 执行 CIT 授权
     4. 302 redirect → merchantReturnUrl?status=succeeded|failed
```

**支付接口 DDC 响应**：

当 PaymentIntent 需要运行 DDC 时：

```json
// POST /payment_intents 响应
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "requires_device_data",
  "next_action": {
    "type": "device_data_collection",
    "device_data_collection": {
      "ddc_url": "https://secure.worldpay.com/.../ddc.html",
      "ddc_jwt": "eyJ0eXAiOiJKV1Qi..."
    }
  }
}

// 前端 DDC 完成后:
POST /v1/payment_intents/{id}/device_data
{ "collection_reference": "0_4XXXXXXX-XXXX-..." }
→ 网关继续: authenticate → authorize
```

**3DS Session API** (简化版)：

```
POST /v1/payment_intents/{id}/device_data
  Body: { "collection_reference": "0_4XXXX..." }
  → 回传 DDC sessionId，触发后续 authenticate

GET  /v1/payment_intents/{id}
  → 轮询状态（适用于 redirect 模式后确认）
```

> **不再需要独立的 3DS Session 端点**。DDC 结果通过 `POST /payment_intents/{id}/device_data` 回传，challenge 结果通过 Gateway 回调自动处理。商户只需轮询 PaymentIntent 状态。

### 6.6 DDC 自动加载 vs 按需采集：设计权衡

#### 6.6.1 自动加载 DDC = 100% 采集？

**不是。** Stripe 的做法是"懒触发 + 时间窗口重叠"，而非页面加载即跑：

```
时间轴 →

用户进入 checkout 页面         Stripe.js 已加载，不跑 DDC
         │
用户 focus 卡号输入框          💡 触发 DDC 初始化
         │                    └─ 隐藏 iframe 开始运行
用户输入卡号                                    │
用户输入有效期  ────────── DDC 并行运行中 ──────│
用户输入 CVC                                   │
         │                    └─ DDC 完成 (2-5s)
用户点击 "支付"               sessionId 已就绪 ✓
```

**关键数据**：

| 指标 | 数值 |
|------|------|
| 用户手动输完卡号 + 有效期 + CVC | ~10-15 秒 |
| DDC 采集耗时 | 2-5 秒 |
| 重叠窗口 | 100% 覆盖（DDC 远快于手动输入） |
| 极速场景（自动填充 / 密码管理器） | 输入 3 秒 + DDC 最多等 2 秒 |
| Apple Pay / Google Pay | DDC 跳过（钱包已有设备指纹） |

#### 6.6.2 浪费率分析

Stripe 接受约 30% 的 DDC 调用浪费：

```
100 个用户进入 checkout
  ├─ 70 个完成支付         → DDC sessionId 被使用
  ├─ 20 个中途放弃         → DDC 浪费（~5KB 网络 + 50ms CPU）
  └─ 10 个选其他支付方式    → DDC 浪费
```

> Stripe 的 tradeoff 逻辑：一次 DDC 的网络/计算开销远小于一笔 chargeback 的损失。宁可浪费 30% 调用，不可让真实买家在支付时多等 3 秒。

#### 6.6.3 并行 vs 串行：性能对比

**当前 MVP 实现（串行，每步等待）**：

```
POST /payment_intents ─┐
  Tokenize      (1s)   │
  FraudSight    (2s)   ├─ 后端串行 ~5s
  DDC Init      (1s)   │
  → 返回 DDC URL        │
                       ┘
浏览器 DDC      (3s)   ← 用户可感知等待！
  → 回传 sessionId
                       ┌─ 后端串行 ~3s
  Authenticate  (2s)   │
  Authorize     (1s)   │
                       ┘
总耗时: ~11s (用户感知 ~5s 延迟)
```

**优化后（SDK 并行 + 预取）**：

```
POST /payment_intents ─┐
  Tokenize      (1s)   │
  FraudSight    (2s)   ├─ 后端并行
  DDC Init      (1s)   │
  → 返回 DDC URL ───────── 浏览器 DDC (3s, 并行)
  Authenticate  (2s) ←─┤ (等 sessionId 就绪)
  Authorize     (1s)   │
                       ┘
总耗时: ~6s (用户感知 0s 额外延迟，DDC 与后端重叠)
```

**差异**：用户感知延迟从 ~5s 降到 ~0s（DDC 的 3s 被后端 Tokenize/FraudSight 的 5s 完全覆盖）。

#### 6.6.4 技术实现：SDK 预取模式

```typescript
// ─── @payfac/js SDK 核心 ───

class PayFacSDK {
  private ddcPromise: Promise<string> | null = null;
  private ddcSessionId: string | null = null;

  /**
   * PaymentIntent 创建后立即调用。
   * DDC 与后续后端步骤并行执行。
   */
  async warmupDDC(ddcUrl: string, ddcJwt: string): Promise<void> {
    if (this.ddcSessionId) return; // 已缓存
    if (this.ddcPromise) return;   // 正在运行

    this.ddcPromise = new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:0';
      iframe.src = ddcUrl;
      document.body.appendChild(iframe);

      const timeout = setTimeout(() => resolve(''), 10000); // 超时降级

      iframe.onload = () => {
        const form = iframe.contentDocument!.createElement('form');
        form.method = 'POST';
        form.action = ddcUrl;
        form.innerHTML = `<input name="JWT" value="${ddcJwt}" />`;
        form.submit();
      };

      window.addEventListener('message', (event) => {
        if (event.origin !== 'https://secure.worldpay.com') return;
        clearTimeout(timeout);
        this.ddcSessionId = event.data.sessionId;
        resolve(this.ddcSessionId);
      }, { once: true });
    });
  }

  /** 支付时调用。DDC 大概率已就绪 */
  async confirm(piId: string): Promise<void> {
    const sessionId = this.ddcSessionId ?? (await this.ddcPromise) ?? '';
    // 即使 DDC 未完成（超时降级），也继续支付
    await fetch(`/v1/payment_intents/${piId}/device_data`, {
      method: 'POST',
      body: JSON.stringify({ collection_reference: sessionId }),
    });
  }
}
```

#### 6.6.5 动态 3DS 开关处理

```
three_d_secure.enabled = true           three_d_secure.enabled = false
─────────────────────────────           ─────────────────────────────

Tokenize                                Tokenize
FraudSight                              FraudSight
DDC Init ──▶ 浏览器 DDC                  ↓ (跳过 DDC Init + DDC)
Authenticate (含 DDC sessionId)         ↓ (跳过 Authenticate)
Authorize                               Authorize ──▶ 直接授权，
                                             无 liability shift

耗时: ~6s                              耗时: ~3s
```

当 `three_d_secure.enabled = false`，Gateway 内部的 3DS 编排器短路跳过 DDC Init + Authenticate 两步，直接从 FraudSight 跳到 Authorize。不需要 SDK 做任何判断——对商户代码完全透明。

#### 6.6.6 演进策略

```
┌─────────────────────────────────────────────────────────────────┐
│  MVP (当前)                                                     │
│  · 串行 DDC                                                      │
│  · 商户手动处理 iframe + postMessage                             │
│  · 用户感知 ~5s 延迟                                              │
│  · 商户代码 ~50 行                                                │
├─────────────────────────────────────────────────────────────────┤
│  Phase 2: @payfac/js SDK                                       │
│  · SDK.warmupDDC() 并行化                                        │
│  · SDK.confirm() 自动等待 DDC                                    │
│  · 用户感知 0s 延迟（DDC 与 Tokenize 重叠）                        │
│  · 商户代码 ~5 行: `await payfac.pay({...})`                     │
├─────────────────────────────────────────────────────────────────┤
│  Phase 3: 对标 Stripe.js                                        │
│  · SDK 页面加载时自动预热 DDC                                      │
│  · DDC 与用户输卡号并行（最佳体验）                                  │
│  · ~30% 浪费率，但 0 延迟                                          │
│  · 商户代码 ~3 行                                                 │
└─────────────────────────────────────────────────────────────────┘
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
| Webhook 推送 | 一期仅查询 + `/payments/events` 恢复，二期加推模式 |
| 商户 Portal UI | 二期 |

> **Webhook 降级方案**：MVP 不依赖 webhook。Gateway 定期调用 `GET /payments/events` 拉取状态变更，覆盖超时和崩溃恢复场景。支付查询间隔 ~30s（新支付）→ ~5min（稳定支付）。

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

### 10.2.1 3DS Authenticate 响应示例

**Frictionless (免挑战)**:
```json
{
  "outcome": "authenticated",
  "transactionReference": "uniqueId",
  "authentication": {
    "version": "2.2.0",
    "eci": "05",
    "authenticationValue": "kBNHXUAy4+HT1gAMBSDajheBcxQh",
    "transactionId": "b8fb4ecc-7e2e-4b1c-816d-0149849776b8"
  }
}
```

**Challenged (需挑战)**:
```json
{
  "outcome": "challenged",
  "transactionReference": "uniqueId",
  "challenge": {
    "reference": "uniqueChallengeRef12",
    "url": "https://issuer-bank.com/acs/challenge",
    "jwt": "eyJhbGci...",
    "payload": "{...}"
  }
}
```

### 10.2.2 FraudSight 评估响应示例

```json
{
  "outcome": "lowRisk",
  "transactionReference": "uniqueId",
  "score": 12.5,
  "riskProfile": {
    "href": "https://try.access.worldpay.com/riskProfile/eyJrIjoi..."
  },
  "exemption": {
    "placement": "authorization",
    "type": "lowValue"
  }
}
```

> Gateway 从响应中提取 `riskProfile.href`，注入到 CIT 授权请求的 `riskProfile` 字段。

### 10.2.3 Gateway 字段 → Worldpay 字段映射

| Gateway 字段 | Worldpay 字段 | 说明 |
|-------------|--------------|------|
| `statement_descriptor` | `instruction.narrative.line1` | 银行账单显示 |
| `description` | 网关本地存储 + `transactionReference` | 不传给 Worldpay |
| `customer.email` | FraudSight `riskData.account.email` | 风控用 |
| `customer.ip_address` | FraudSight `deviceData.ipAddress` | 风控用 |
| `shipping` | FraudSight `riskData.shipping` | 风控用 |
| `metadata` | 网关本地存储 (JSONB) | Worldpay 不支持自由 metadata |
| `currency` (小写) | → 转大写 `GBP` | 网关自动转换 |
| `amount` (如 250) | `value.amount` (250) | 同单位, 无转换。JPY 等零小数币种按实际单位 |
| `setup_future_usage: "off_session"` | `customerAgreement: { type: "cardOnFile", storedCardUsage: "first" }` | CIT 首次 |
| MIT 后续 | `customerAgreement: { storedCardUsage: "subsequent" }` + 不带 `three_d_secure` | MIT |

### 10.3 测试环境

| 项目 | 值 |
|------|-----|
| Base URL | `https://try.access.worldpay.com` |
| 测试 Entity | 配置化 (如 `your_entity`)，通过 `probe-entities.ts` 验证 |
| 测试卡号 | `4444333322221111` (VISA credit) |
| 测试卡有效期 | `05/2035` |
| 测试 CVC | `123` |
| Payment Queries 异步延迟 | 3~15 分钟 |

### 10.3.1 自动请款实现策略

`capture_method: automatic` (默认) 的实现方式：

| 方式 | 说明 | 性能 | 可靠性 |
|------|------|------|--------|
| A: `requestAutoSettlement: { enabled: true }` | CIT 请求中直接要求 Worldpay 自动 settlement | 快 (1 次调用) | 高 (Worldpay 保证) |
| B: 分开调用 settlement | 先 authorize → 再 POST /settlements | 多 1 次调用 | Gateway 控制粒度更高 |

> **MVP 推荐方式 A**。CIT 请求中设置 `requestAutoSettlement: { enabled: true }`，Worldpay 返回 `outcome: "Sent for Settlement"`，无需额外 capture 调用。状态机简化为：`AUTHORIZING → SUCCEEDED`。
>
> `capture_method: manual` 时使用方式 B：`requestAutoSettlement: { enabled: false }` + 单独调 settlement。

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

| WP Outcome | PaymentIntent Status | Liability Shift |
|------------|---------------------|-----------------|
| `authenticated` | → 继续 AUTHORIZING | ✅ 有 |
| `challenged` | → `REQUIRES_ACTION` | ⏳ 待 challenge 完成 |
| `notEnrolled` | → 继续 AUTHORIZING | ❌ 无 (卡/发卡行不支持 3DS) |
| `unavailable` | → 继续 AUTHORIZING | ❌ 无 (3DS 服务不可用) |
| `authenticationFailed` | → `PAYMENT_FAILED` | ❌ 认证失败 |

GateWay 在 PaymentIntent 响应中包含 `three_d_secure.status` 字段告知商户实际认证结果，
帮助商户了解 chargeback liability shift 是否适用。

---

## 11. Stripe vs. 我们的设计：3DS 全链路对比

### 11.1 架构对比

```
┌─── Stripe ─────────────────────────┐  ┌─── 我们的设计 ──────────────────────┐
│                                    │  │                                    │
│  商户后端 ──▶ Stripe API            │  │  商户后端 ──▶ PayFac Gateway API      │
│              (PaymentIntents)      │  │              (PaymentIntents)       │
│                                    │  │                                    │
│  浏览器 ───▶ Stripe.js SDK          │  │  浏览器 ───▶ 无专用 SDK (REST 直调)    │
│           │  · DDC 自动             │  │           │  · DDC 手动触发           │
│           │  · challenge iframe    │  │           │  · challenge iframe/redirect│
│           │  · card tokenization  │  │           │  · card tokenization     │
│                                    │  │                                    │
│  Stripe 后端                        │  │  PayFac Gateway                     │
│  · 直连卡网络 (acquirer)             │  │  · 下游连接 Worldpay (acquirer)      │
│  · 3DS 自建 (DS 直连)               │  │  · 3DS 透传 Worldpay 3DS API        │
│  · 后台默默执行 verify              │  │  · Gateway 回调中执行 verify        │
│  · Stripe.js 自动轮询状态           │  │  · 商户需手动 GET 轮询状态            │
└────────────────────────────────────┘  └────────────────────────────────────┘
```

### 11.2 支付流程逐步骤对比

#### 步骤 1：Token 化

| 维度 | Stripe | 我们的设计 |
|------|--------|-----------|
| 触发方式 | Stripe.js Elements / `createPaymentMethod()` | `POST /v1/payment_methods` 或 PaymentIntent 中直接传卡号 |
| 卡号流向 | 浏览器 → Stripe (直连，商户不可见) | 浏览器 → 商户后端 → Gateway → Worldpay Tokens API |
| PCI 影响 | SAQ-A (最低) | SAQ-D (较高，需 Gateway 作为 PCI 中转) |
| 返回值 | `pm_xxx` PaymentMethod 对象 | `pm_xxx` PaymentMethod 对象（仿 Stripe） |

> **我们可改进的方向**：提供前端 JS SDK，直连 Gateway tokenize 端点，避免卡号经过商户后端。

#### 步骤 2：DDC (Device Data Collection)

| 维度 | Stripe | 我们的设计 |
|------|--------|-----------|
| **触发时机** | 页面加载时。`stripe.js` 自动加载 DDC iframe，用户无感知 | PaymentIntent 创建后。Gateway 返回 `requires_device_data` + `{ddc_url, ddc_jwt}` |
| **谁触发** | Stripe.js SDK，自动 | 商户前端代码，需手动处理 |
| **前端代码** | 零代码。SDK 内置 | 需要商户写 ~20 行 JS：创建隐藏 iframe → POST JWT → 监听 postMessage → 回传 sessionId |
| **时序** | 与用户填写卡号并行，支付时已就绪 | 串行：创建 PaymentIntent → 等待 → 运行 DDC → 回传 → 继续 |
| **延迟感知** | 0ms（提前完成） | 2-5 秒（同步等待） |
| **API 交互** | 无。对商户完全透明 | `requires_device_data` 状态 + `POST /device_data` 端点 |

> **这是最大的差距点**。Stripe 的 DDC 完全隐藏，我们的需要商户显式介入。解决方案：未来提供前端 SDK，在 checkout 页面加载时自动运行 DDC。

#### 步骤 3：3DS Authentication

| 维度 | Stripe | 我们的设计 |
|------|--------|-----------|
| **调用方式** | `confirmCardPayment()` 内部自动发起 | Gateway 在收到 DDC sessionId 后自动发起 |
| **商户可见性** | 完全不可见 | 不可见（仅感知到 PaymentIntent 状态流转） |
| **Frictionless 结果** | Stripe 内部消化，直接跳到授权 | Gateway 内部消化，直接跳到授权 |
| **相同点** | ✅ 对商户透明 | ✅ 对商户透明 |

#### 步骤 4：3DS Challenge

这是差距最大的环节：

**Stripe（全自动 iframe 模式）：**

```
┌─────────────────────────────────────────────────────────────┐
│                    Stripe Challenge 流程                     │
│                                                             │
│  ① Stripe.js 收到 requires_action                           │
│     → 自动在页面上弹出 iframe modal                          │
│     → modal 内加载 issuer ACS URL                           │
│                                                             │
│  ② 用户在 modal 中完成 OTP / 生物识别                         │
│                                                             │
│  ③ ACS 通过 postMessage 通知 Stripe.js                       │
│     → Stripe.js 自动发送到 Stripe 后端                        │
│     → Stripe 后端 verify + authorize                         │
│     → Stripe.js 自动更新 PaymentIntent 状态                   │
│                                                             │
│  ④ 商户代码 = 0 行                                           │
│     confirmCardPayment() 的 Promise resolve 即可              │
│                                                             │
│  浏览器路径: Browser → Stripe iframe → issuer ACS             │
│             (全程不离开商户页面)                               │
└─────────────────────────────────────────────────────────────┘
```

**我们的设计（Redirect 模式为主）：**

```
┌─────────────────────────────────────────────────────────────┐
│                    我们的 Challenge 流程                      │
│                                                             │
│  ① Gateway 返回 {status:"requires_action",                  │
│                   challenge_url, jwt}                        │
│                                                             │
│  ② 商户前端:                                                  │
│     if (iframe模式) {                                        │
│       创建 iframe → POST JWT → 用户完成                      │
│       → issuer postMessage → 前端接收                        │
│     }                                                        │
│     if (redirect模式) {                                       │
│       window.location = challenge_url                        │
│       → issuer 完成 → 302 到 Gateway                         │
│       → Gateway process → 302 到 merchant return_url          │
│       → 前端 GET /payment_intents/{id} 轮询                   │
│     }                                                        │
│                                                             │
│  ③ 商户代码 ~30-50 行（iframe 处理 + 状态轮询）                 │
│                                                             │
│  浏览器路径 (redirect):                                       │
│    Browser → issuer ACS → Gateway → Browser → Merchant Page │
│  浏览器路径 (iframe):                                         │
│    Browser → iframe → issuer ACS → postMessage               │
│             (不离开商户页面)                                   │
└─────────────────────────────────────────────────────────────┘
```

**Challenge 对比表：**

| 维度 | Stripe | 我们的设计 |
|------|--------|-----------|
| **iframe 模式** | ✅ 内置，自动 | ⚠️ 需商户手动实现 iframe + postMessage |
| **redirect 模式** | ✅ Stripe.js 处理回调，Promise 层面透明 | ⚠️ 商户需处理 302 回调 + 轮询状态 |
| **模态框/UI** | Stripe.js 自动弹出 branded modal | 商户自行处理 UI |
| **return_url** | `hooks.stripe.com` (Stripe 的 URL) | `gateway.payfac.com/v1/3ds/callback` (我们的 URL) |
| **服务端回调处理** | Stripe 后台自动 | Gateway 自动 (两者相同) |
| **商户代码量** | 0 行 | 30-50 行 |
| **iframe → redirect 切换** | Stripe.js 自动降级 | 商户自行判断 |
| **ios/Safari ITP 兼容** | ✅ Stripe 已处理 | ⚠️ 商户需自行处理 |

### 11.3 状态机对比

```
Stripe PaymentIntent 状态:                  我们的 PaymentIntent 状态:

  requires_payment_method                   CREATED
       │                                         │
       ▼                                         ▼
  requires_confirmation    (确认时: tokenize     TOKENIZING → TOKENIZED
       │                   + fraud assess        → RISK_ASSESSING → RISK_ASSESSED
       ▼                   + ddc init)           → DDC_INITIALIZING → REQUIRES_DEVICE_DATA
  processing              ───────────────▶       → AUTHENTICATING
       │                           │             → AUTHORIZING)
       ├── succeeded                 │
       ├── requires_action          │
       │    │                       │
       │    └── succeeded           │
       │                           │
       │   (状态单层,               │   (状态分层:
       │    Stripe 不暴露内部状态)     │    对外: created → processing →
       │                                    requires_device_data →
       │                                    requires_action → succeeded
       │                                    对内: Tokenizing, RiskAssessing,
       │                                    DDC Init, Authenticating,
       │                                    Authorizing, Capturing)
       │
       ▼
  requires_capture                        REQUIRES_CAPTURE
       │                                       │
       ▼                                       ▼
  canceled / succeeded                    CANCELED / SUCCEEDED

  (succeeded 可以继续 refund)              (succeeded 可以继续 refund)
```

**关键差异**：
- Stripe 的 `processing` 状态打包了 Tokenize → Fraud → 3DS → Auth → Capture 全部内部步骤
- 我们的设计暴露了 DDC 和 Challenge 两个中间状态（`requires_device_data`, `requires_action`），因为商户需要介入
- 如果未来提供前端 SDK，可以将 DDC 在 SDK 内部消化，不再暴露 `requires_device_data`

### 11.4 集成复杂度对比

```
                   Stripe                    我们的设计
                  ────────                  ──────────

  后端集成:
  ┌──────────────────────┐    ┌──────────────────────────┐
  │ POST /payment_intents │    │ POST /payment_intents    │
  │ 一个 API 搞定          │    │ 一个 API 搞定             │
  └──────────────────────┘    └──────────────────────────┘
             ✅ 相同                    ✅ 相同

  前端集成:
  ┌──────────────────────┐    ┌──────────────────────────┐
  │ <script src="stripe.js">│  │ 需要自行实现:              │
  │                        │    │ · DDC 隐藏 iframe        │
  │ const stripe =         │    │ · postMessage 监听        │
  │   Stripe('pk_xxx');    │    │ · sessionId 回传          │
  │                        │    │ · 3DS iframe / redirect  │
  │ // card element        │    │ · 状态轮询                │
  │ const elements =       │    │                          │
  │   stripe.elements();   │    │ 预计 ~50 行 JS           │
  │                        │    │                          │
  │ // confirm             │    │                          │
  │ await stripe.          │    │                          │
  │   confirmCardPayment() │    │                          │
  │                        │    │                          │
  │ ~5 行代码               │    │                          │
  └──────────────────────┘    └──────────────────────────┘

  3DS 处理:
  ┌──────────────────────┐    ┌──────────────────────────┐
  │ 完全自动               │    │ 需商户介入 2 次:           │
  │ · DDC 自动             │    │ · DDC: 收到                │
  │ · Challenge 自动弹出    │    │   requires_device_data   │
  │ · 结果自动处理          │    │   → 运行 iframe → 回传     │
  │                        │    │ · Challenge: 收到          │
  │                        │    │   requires_action         │
  │                        │    │   → 处理 iframe/redirect  │
  │                        │    │   → 轮询状态               │
  └──────────────────────┘    └──────────────────────────┘
```

### 11.5 差异总结

| # | 差异点 | Stripe | 我们的设计 | 影响 | 改进方向 |
|---|--------|--------|-----------|------|---------|
| 1 | **DDC** | SDK 自动 | 商户手动 | 每笔支付多 2-5 秒 + 商户代码负担 | 🔧 提供前端 JS SDK，页面加载时自动运行 DDC |
| 2 | **Challenge** | SDK 自动弹出 modal | 商户自行处理 iframe/redirect | 商户需额外 30+ 行代码 | 🔧 SDK 内置 challenge modal |
| 3 | **状态轮询** | SDK 自动 | 商户 GET 轮询 | redirect 模式下的额外复杂度 | 🔧 SDK 内置轮询 + WebSocket |
| 4 | **PCI 范围** | SAQ-A（卡号不经商户） | SAQ-D（需中转） | 合规审计范围更大 | 🔧 SDK 直连 Gateway tokenize |
| 5 | **多方案兼容** | 仅 Stripe 一家 | 下游可切换 acquirer | ✅ 灵活 | — |
| 6 | **业务控制** | Stripe 黑盒 | 全链路可观测 | ✅ 可自定义风控、3DS 策略 | — |

### 11.6 演进路线

```
MVP (当前)                    Phase 2                       Phase 3
───────────                  ─────────                     ─────────

  商户后端集成 REST API         + 前端 JS SDK                 + PCI 优化
                              · DDC 自动运行                · SDK 直连 Gateway
  商户前端自行处理:             · Challenge modal 自动        tokenize
  · DDC iframe                · 状态自动轮询               · 商户端卡号零接触
  · Challenge                 · Promise API:              · SAQ-A 合规
  · 状态轮询                    await pay({...})           · 体验对标 Stripe
  · ~50 行 JS

  API: PaymentIntents         API: PaymentIntents          API: PaymentIntents
                              SDK: @payfac/js              SDK: @payfac/js
```

> **核心结论**：我们的后端 API 设计已对标 Stripe（单端点、omni、auto-capture）。差距主要在前端——Stripe.js 封装了 DDC、Challenge、状态管理。二期投入前端 SDK 即可消除这个差距。
