# PayFac Payment Gateway — 一期 MVP 架构设计

> **文档状态**：Draft v1.0  
> **作者**：PayFac 技术团队  
> **最后更新**：2026-05-25  
> **上游**：Worldpay Access Platform  
> **下游**：电商子商户 (E-commerce Sub-merchants)

---

## 目录

1. [架构总览](#1-架构总览)
2. [Worldpay Upstream 映射](#2-worldpay-upstream-映射)
3. [商户侧 API 设计](#3-商户侧-api-设计)
4. [核心业务流程](#4-核心业务流程)
5. [数据模型](#5-数据模型)
6. [安全模型](#6-安全模型)
7. [MVP 范围与边界](#7-mvp-范围与边界)
8. [附录：Worldpay 请求/响应速查](#8-附录worldpay-请求响应速查)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                    Sub-merchants (E-commerce)                     │
│            SDK / REST API Client (API Key Auth)                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS / TLS 1.3
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PayFac Payment Gateway                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    API Gateway Layer                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │   │
│  │  │ Payment  │ │  Token   │ │   3DS    │ │  Statement  │ │   │
│  │  │   API    │ │   API    │ │   API    │ │    API      │ │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘ │   │
│  └───────┼────────────┼────────────┼───────────────┼────────┘   │
│          │            │            │               │             │
│  ┌───────┼────────────┼────────────┼───────────────┼────────┐   │
│  │       ▼            ▼            ▼               ▼        │   │
│  │                 Core Service Layer                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ Payment  │ │  Token   │ │   3DS    │ │Reconciliation│ │   │
│  │  │ Service  │ │ Service  │ │ Service  │ │  Service   │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │   │
│  └───────┼────────────┼────────────┼──────────────┼────────┘   │
│          │            │            │               │             │
│  ┌───────┼────────────┼────────────┼──────────────┼────────┐   │
│  │       ▼            ▼            ▼               ▼        │   │
│  │            Worldpay Integration Adapter Layer             │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │  Card    │ │   3DS    │ │FraudSight│ │  Tokens   │  │   │
│  │  │Payments  │ │ Adapter  │ │ Adapter  │ │  Adapter  │  │   │
│  │  │ Adapter  │ │          │ │          │ │           │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                │   │
│  │  │ Payment  │ │Statement │ │  Config  │                │   │
│  │  │ Queries  │ │ Adapter  │ │  Router  │                │   │
│  │  │ Adapter  │ │          │ │ (entity→ │                │   │
│  │  │          │ │          │ │ merchant)│                │   │
│  │  └──────────┘ └──────────┘ └──────────┘                │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS / TLS 1.3 / Basic Auth
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Worldpay Access Platform                        │
│  Card Payments v7 │ 3DS v2 │ FraudSight v1 │ Tokens v3           │
│  Payment Queries v1 │ Statements 2025-01-01                      │
│  Test: https://try.access.worldpay.com                           │
│  Live: https://access.worldpay.com                               │
└──────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **透明代理** | 商户调用我们的 API，我们自动注入 PayFac 信息后转发给 Worldpay |
| **Entity 路由** | 每个子商户映射一个 Worldpay entity，网关自动路由 |
| **PCI 降级** | 卡号经 Token 化后存储，明文不落盘 |
| **幂等性** | 所有写操作支持幂等键 (Idempotency-Key) |
| **异步通知** | 支付状态变更通过 Webhook 通知商户 |

---

## 2. Worldpay Upstream 映射

### 2.1 功能 → API 映射

| 网关功能 | Worldpay API | 版本 | 主要端点 |
|---------|-------------|------|---------|
| **卡支付授权** | Card Payments | v7 | `POST /cardPayments/customerInitiatedTransactions` |
| **请款** | Card Payments | v7 | `POST /payments/settlements/{linkData}` |
| **退款** | Card Payments | v7 | `POST /payments/settlements/refunds/{linkData}` |
| **取消授权** | Card Payments | v7 | `POST /payments/authorizations/cancellations/{linkData}` |
| **3DS 认证** | 3DS | v2 | `POST /verifications/customers/3ds/authenticate` |
| **3DS 验证** | 3DS | v2 | `POST /verifications/customers/3ds/verification` |
| **风控评估** | FraudSight | v1 | `POST /fraudsight/assessment` |
| **创建 Token** | Tokens | v3 | `POST /tokens` |
| **查询 Token** | Tokens | v3 | `GET /tokens/{tokenId}` |
| **交易查询** | Payment Queries | v1 | `GET /paymentQueries/payments` |
| **单笔查询** | Payment Queries | v1 | `GET /paymentQueries/payments/{paymentId}` |
| **对账单** | Statements | 2025-01-01 | `GET /accounts/statements` |

### 2.2 认证与版本 Header

| API 组 | 版本 Header | 示例值 |
|--------|------------|--------|
| Card Payments, Tokens, 3DS, FraudSight | `Accept` + `Content-Type` | `application/vnd.worldpay.payments-v7+json` |
| Statements | `WP-Api-Version` | `2025-01-01` |
| Payment Queries | `Accept` | `application/vnd.worldpay.payment-queries-v1.hal+json` |

所有请求使用 **HTTP Basic Auth**（username:password → Base64）。

### 2.3 Entity ↔ 子商户映射

```
┌────────────────────────────────────────────────────────┐
│  子商户 (Merchant A)                                    │
│  merchantId: "mer_001"                                 │
│  worldpayEntity: "your_entity"                             │
│  worldpaySubMerchantRef: "sub001"                       │
│  payFacSchemeId: "12345"  ← 全局 PayFac 配置            │
└────────────────────────────────────────────────────────┘
                        │
                        ▼ 网关自动注入
┌────────────────────────────────────────────────────────┐
│  Card Payments 请求 → merchant: {                      │
│    entity: "your_entity",               ← 按子商户路由     │
│    paymentFacilitator: {                               │
│      schemeId: "12345",             ← 全局配置          │
│      subMerchant: {                                    │
│        reference: "sub001",         ← 子商户标识        │
│        name: "Merchant A Store",                       │
│        address: { ... }                                │
│      }                                                 │
│    }                                                   │
│  }                                                     │
└────────────────────────────────────────────────────────┘
```

---

## 3. 商户侧 API 设计

### 3.1 认证

所有商户请求使用 **API Key** 认证：

```
Authorization: Bearer {merchant_api_key}
```

每个子商户分配一对 `clientId` + `clientSecret`，网关校验后解析出 `merchantId`，再查询 entity 映射。

### 3.2 接口总览

```
POST   /v1/tokens                         创建 Token (卡号脱敏)
GET    /v1/tokens/{tokenId}               查询 Token

POST   /v1/3ds/authenticate               发起 3DS 认证
POST   /v1/3ds/verify                     验证 3DS Challenge

POST   /v1/fraud/assess                   风控评估 (FraudSight)

POST   /v1/payments                       创建支付 (授权)
GET    /v1/payments/{paymentId}           查询支付
POST   /v1/payments/{paymentId}/capture   请款
POST   /v1/payments/{paymentId}/refund    退款
POST   /v1/payments/{paymentId}/cancel    取消授权
GET    /v1/payments                       支付列表

GET    /v1/statements                     对账单
```

### 3.3 接口详细定义

#### 3.3.1 创建 Token

```
POST /v1/tokens
```

**请求体**：
```json
{
  "cardNumber": "4444333322221111",
  "cardHolderName": "Sherlock Holmes",
  "expiryMonth": 5,
  "expiryYear": 2035,
  "billingAddress": {
    "address1": "221B Baker Street",
    "city": "London",
    "postalCode": "NW1 6XE",
    "countryCode": "GB"
  },
  "namespace": "cust_78901"
}
```

**响应**：
```json
{
  "tokenId": "tok_abc123def456",
  "cardSummary": {
    "bin": "444433",
    "last4": "1111",
    "brand": "VISA",
    "fundingType": "credit",
    "expiryMonth": 5,
    "expiryYear": 2035
  },
  "status": "active"
}
```

**网关处理**：
1. 转发 `POST /tokens` 到 Worldpay（注入 `merchant.entity`）
2. 存储 token 与商户的关系映射
3. 返回脱敏后的 token 信息

#### 3.3.2 3DS 认证

```
POST /v1/3ds/authenticate
```

**请求体**：
```json
{
  "tokenId": "tok_abc123def456",
  "amount": 250,
  "currency": "GBP",
  "challenge": {
    "returnUrl": "https://merchant.com/3ds/callback"
  },
  "deviceData": {
    "acceptHeader": "text/html",
    "userAgentHeader": "Mozilla/5.0 ..."
  }
}
```

**Frictionless 响应** (`outcome: "authenticated"`)：
```json
{
  "outcome": "authenticated",
  "threeDS": {
    "version": "2.2.0",
    "eci": "05",
    "authenticationValue": "kBNHXUAy4+HT1gAMBSDajheBcxQh",
    "transactionId": "b8fb4ecc-7e2e-4b1c-816d-0149849776b8"
  }
}
```

**Challenge 响应** (`outcome: "challenged"`)：
```json
{
  "outcome": "challenged",
  "challenge": {
    "reference": "abc123",
    "url": "https://issuer.com/challenge",
    "jwt": "eyJhbGci..."
  }
}
```

**网关处理**：
1. 将 `tokenId` 解析为 Worldpay token href
2. 转发 `POST /verifications/customers/3ds/authenticate`
3. 如果 `outcome = "challenged"`，返回 challenge URL 给商户前端
4. 商户前端展示 challenge iframe → 完成后调用 `/v1/3ds/verify`

#### 3.3.3 3DS Challenge 验证

```
POST /v1/3ds/verify
```

**请求体**：
```json
{
  "challengeReference": "abc123",
  "challengeResponse": "..." 
}
```

**响应**：同 authenticate frictionless 响应。

#### 3.3.4 风控评估

```
POST /v1/fraud/assess
```

**请求体**：
```json
{
  "tokenId": "tok_abc123def456",
  "amount": 250,
  "currency": "GBP",
  "billingAddress": { "address1": "...", "city": "...", "postalCode": "...", "countryCode": "GB" },
  "shopper": {
    "email": "sherlock@example.com",
    "ipAddress": "192.168.1.1"
  },
  "shipping": {
    "firstName": "John",
    "lastName": "Watson",
    "address": { "address1": "...", "city": "...", "postalCode": "...", "countryCode": "GB" }
  }
}
```

**响应**：
```json
{
  "outcome": "lowRisk",
  "score": 12.5,
  "riskProfileHref": "https://try.access.worldpay.com/riskProfile/..."
}
```

**网关处理**：
1. 仅做转发，不存状态
2. 返回 `riskProfileHref` 给商户，在后续支付中回传

> **设计决策**：FraudSight 评估独立于支付。商户可在支付授权前单独评估风险，也可将 `riskProfileHref` 直接用于支付请求中。

#### 3.3.5 创建支付（授权）

```
POST /v1/payments
```

**请求体**：
```json
{
  "tokenId": "tok_abc123def456",
  "amount": 250,
  "currency": "GBP",
  "capture": false,
  "narrative": "Order #12345",
  "threeDS": {
    "version": "2.2.0",
    "eci": "05",
    "authenticationValue": "kBNHXUAy4+HT1gAMBSDajheBcxQh",
    "transactionId": "b8fb4ecc-7e2e-4b1c-816d-0149849776b8"
  },
  "riskProfileHref": "https://try.access.worldpay.com/riskProfile/...",
  "orderReference": "order-12345",
  "billingAddress": { "address1": "...", "city": "London", "postalCode": "SW1A 1AA", "countryCode": "GB" },
  "customer": {
    "email": "user@example.com",
    "ipAddress": "192.168.1.1"
  },
  "idempotencyKey": "order-12345-unique"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tokenId` | string | ✅ | Token 化卡号 ID |
| `amount` | integer | ✅ | 金额（最小单位，如 250 = £2.50） |
| `currency` | string | ✅ | 币种 (ISO 4217) |
| `capture` | boolean | - | `true` = 立即请款 (sale), `false` = 仅授权（默认） |
| `narrative` | string | - | 银行账单显示文字 (第一行) |
| `threeDS` | object | - | 3DS 认证结果，`capture=false` 时可选 |
| `riskProfileHref` | string | - | FraudSight 评估结果链接 |
| `idempotencyKey` | string | 推荐 | 幂等键，防重复提交 |

**授权响应** (`outcome: "authorized"`)：
```json
{
  "paymentId": "pay_PKF1a2b3c4d5",
  "outcome": "authorized",
  "status": "authorized",
  "amount": 250,
  "currency": "GBP",
  "cardSummary": { "bin": "444433", "last4": "1111", "brand": "visa", "fundingType": "credit" },
  "issuerAuthorizationCode": "T75725",
  "schemeReference": "MCCOLXT1C0104",
  "nextActions": {
    "capture": "/v1/payments/pay_PKF1a2b3c4d5/capture",
    "cancel": "/v1/payments/pay_PKF1a2b3c4d5/cancel",
    "refund": null
  }
}
```

**拒绝响应** (`outcome: "refused"`)：
```json
{
  "paymentId": "pay_PKF1a2b3c4d5",
  "outcome": "refused",
  "refusalCode": "5",
  "refusalDescription": "REFUSED",
  "advice": { "code": "01" }
}
```

**网关处理**：
1. 通过 API Key 解析 `merchantId` → `worldpayEntity`
2. 将 `tokenId` 解析为 Worldpay token href
3. 构建 Worldpay CIT 请求，自动注入 `paymentFacilitator` 对象
4. 存储支付记录（内部 ID ↔ Worldpay paymentId 映射）
5. 返回结构化结果

#### 3.3.6 查询支付

```
GET /v1/payments/{paymentId}
```

**响应**：
```json
{
  "paymentId": "pay_PKF1a2b3c4d5",
  "status": "settled",
  "outcome": "authorized",
  "amount": 250,
  "currency": "GBP",
  "cardSummary": { "bin": "444433", "last4": "1111", "brand": "visa" },
  "lastEvent": "settlementRequestSubmitted",
  "events": [
    { "type": "authorizationSucceeded", "timestamp": "2026-05-25T08:00:00Z" },
    { "type": "settlementRequestSubmitted", "timestamp": "2026-05-25T08:05:00Z" }
  ],
  "createdAt": "2026-05-25T08:00:00Z",
  "updatedAt": "2026-05-25T08:05:00Z"
}
```

#### 3.3.7 请款 / 退款 / 取消授权

```
POST /v1/payments/{paymentId}/capture     # 全额请款
POST /v1/payments/{paymentId}/capture     # 部分请款 (body: { amount: 150 })
POST /v1/payments/{paymentId}/refund      # 退款
POST /v1/payments/{paymentId}/cancel      # 取消授权（仅 authorized 状态可用）
```

**网关处理**：
1. 查询内部记录获取 Worldpay `linkData`
2. 调用 Worldpay 对应的 next action link
3. 更新本地支付状态

#### 3.3.8 支付列表

```
GET /v1/payments?fromDate=2026-05-20T00:00:00Z&toDate=2026-05-25T23:59:59Z&pageSize=10
```

**响应**：
```json
{
  "data": [
    {
      "paymentId": "pay_PKF1a2b3c4d5",
      "transactionReference": "order-12345",
      "status": "authorized",
      "amount": 250,
      "currency": "GBP",
      "createdAt": "2026-05-25T08:00:00Z"
    }
  ],
  "pagination": { "pageSize": 10, "hasNext": false }
}
```

#### 3.3.9 对账单

```
GET /v1/statements?fromDate=2026-05-20T00:00:00Z&toDate=2026-05-25T23:59:59Z&page=1
```

**响应**：
```json
{
  "accountNumber": "0005553123712133",
  "currency": "GBP",
  "items": [
    {
      "statementItemId": "uuid-...",
      "transactionReference": "order-12345",
      "transferType": "ACQUIRING SETTLEMENT",
      "fundingType": "credit",
      "amount": 2.50,
      "timestamp": "2026-05-25T08:00:00Z",
      "balance": 1250.00,
      "description": "Payment settlement"
    }
  ],
  "pagination": { "page": 1, "pageCount": 5, "totalRecords": 42 }
}
```

---

## 4. 核心业务流程

### 4.1 标准支付流程 (3DS + FraudSight + Auth + Capture)

```
Sequence: 商户 → 网关 → Worldpay

  ┌─────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ Merchant │     │ Gateway │     │  Tokens  │     │FraudSight│     │   3DS    │     │  Card    │
  │  (SDK)   │     │  (API)  │     │   API    │     │   API    │     │   API    │     │ Payments │
  └────┬─────┘     └────┬────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
       │                │               │                 │               │                 │
       │ ① POST /tokens │               │                 │               │                 │
       │────────────────▶│               │                 │               │                 │
       │                │── POST /tokens▶│                 │               │                 │
       │                │◀── tokenId ────│                 │               │                 │
       │◀─── tokenId ───│               │                 │               │                 │
       │                │               │                 │               │                 │
       │ ② POST /fraud/assess           │                 │               │                 │
       │────────────────▶│               │                 │               │                 │
       │                │────────────── POST /assessment──▶│               │                 │
       │                │◀───── riskProfileHref ───────────│               │                 │
       │◀─ riskProfile ─│               │                 │               │                 │
       │                │               │                 │               │                 │
       │ ③ POST /3ds/authenticate       │                 │               │                 │
       │────────────────▶│               │                 │               │                 │
       │                │──────────────────────────── POST /authenticate──▶│               │
       │                │◀───────────── outcome ──────────────────────────│               │
       │                │               │                 │               │                 │
       │  [若 challenged: 展示 issuer iframe → POST /3ds/verify → 获取认证结果]         │
       │                │               │                 │               │                 │
       │ ④ POST /payments               │                 │               │                 │
       │  {tokenId, 3dsResult,          │                 │               │                 │
       │   riskProfile}                 │                 │               │                 │
       │────────────────▶│               │                 │               │                 │
       │                │──────────────────────────────────────────── POST /CIT ────────▶│
       │                │◀───────────── authorized / refused ───────────────────────────│
       │◀─ paymentId ───│               │                 │               │                 │
       │                │               │                 │               │                 │
       │ ⑤ POST /payments/{id}/capture  │                 │               │                 │
       │────────────────▶│               │                 │               │                 │
       │                │──────────────────────────────────── POST /settlements ─────────▶│
       │                │◀──────────────────────────────────────── settled ──────────────│
       │◀─── settled ───│               │                 │               │                 │
```

### 4.2 异步通知流程

```
  Worldpay Webhook
       │
       ▼
  ┌──────────┐     ┌──────────────┐     ┌──────────────┐
  │ Webhook  │────▶│   Payment    │────▶│   Merchant   │
  │ Receiver │     │   Service    │     │  Webhook     │
  │          │     │ (状态更新)    │     │ (通知商户)    │
  └──────────┘     └──────────────┘     └──────────────┘
       │
       │ 事件类型:
       │ · authorizationSucceeded
       │ · authorizationRefused
       │ · settlementRequestSubmitted
       │ · refundRequestSubmitted
       │ · cancellationRequestSubmitted
       │ · chargeback
```

### 4.3 对账流程 (T+1)

```
  ┌───────────┐     ┌──────────────┐     ┌──────────────┐
  │ Scheduler │────▶│Statement Sync│────▶│  Worldpay    │
  │ (Cron)    │     │   Service    │     │  Statements  │
  │ 每日 6:00 │     │              │     │     API      │
  └───────────┘     └──────┬───────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Reconciliation  │
                    │     Engine       │
                    │                 │
                    │ 内部交易记录 ←→  │
                    │ Worldpay 对账单  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  差异报告 / 告警  │
                    └─────────────────┘
```

### 4.4 退款流程

```
  Merchant
       │
       │ POST /v1/payments/{id}/refund
       ▼
  ┌──────────┐     ┌──────────────┐
  │ Payment  │────▶│  Worldpay    │
  │ Service  │     │ Card Payments│
  │ (状态校验)│     │ /refunds     │
  └────┬─────┘     └──────┬───────┘
       │                  │
       │ 校验:             │
       │ · 状态必须为       │
       │   settled         │
       │ · 金额 ≤ 已请款    │
       │                  │
       ▼                  ▼
  更新本地状态          返回结果
  通知商户
```

---

## 5. 数据模型

### 5.1 核心表

```
┌─────────────────────────────────┐
│          merchants              │
├─────────────────────────────────┤
│ merchant_id        VARCHAR(32)  │ PK  内部商户 ID
│ name               VARCHAR(128) │     商户名称
│ client_id          VARCHAR(64)  │ UK  API Key
│ client_secret_hash VARCHAR(256) │     Secret hash
│ worldpay_entity    VARCHAR(32)  │     映射到的 Worldpay entity
│ sub_merchant_ref   VARCHAR(15)  │     paymentFacilitator 子商户引用
│ payfac_scheme_id   VARCHAR(11)  │     Payment Facilitator ID
│ status             VARCHAR(16)  │     active / suspended
│ fee_bps            INT          │     费率 (basis points)
│ webhook_url        VARCHAR(512) │     通知回调 URL
│ created_at         TIMESTAMP    │
│ updated_at         TIMESTAMP    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│          tokens                 │
├─────────────────────────────────┤
│ token_id           VARCHAR(32)  │ PK  内部 token ID
│ merchant_id        VARCHAR(32)  │ FK  所属商户
│ worldpay_token_href VARCHAR(512)│     Worldpay token href (加密存储)
│ card_bin           VARCHAR(8)   │     卡 BIN
│ card_last4         VARCHAR(4)   │     卡末四位
│ card_brand         VARCHAR(32)  │     卡品牌
│ card_funding_type  VARCHAR(16)  │     卡类型
│ card_expiry_month  INT          │
│ card_expiry_year   INT          │
│ card_holder_name   VARCHAR(255) │
│ status             VARCHAR(16)  │     active / expired / deleted
│ created_at         TIMESTAMP    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│          payments               │
├─────────────────────────────────┤
│ payment_id          VARCHAR(32) │ PK  内部支付 ID
│ merchant_id         VARCHAR(32) │ FK  所属商户
│ worldpay_payment_id VARCHAR(36) │     Worldpay paymentId
│ token_id            VARCHAR(32) │ FK  使用的 token
│ transaction_ref     VARCHAR(64) │     交易引用
│ order_reference     VARCHAR(64) │     订单引用
│ amount              INT         │     金额 (最小单位)
│ currency            VARCHAR(3)  │     币种
│ status              VARCHAR(32) │     状态 (见下)
│ outcome             VARCHAR(16) │     authorized/refused
│ last_event          VARCHAR(64) │     Worldpay 最后事件
│ issuer_auth_code    VARCHAR(32) │     发卡行授权码
│ scheme_reference    VARCHAR(255)│     Card scheme 引用
│ risk_profile_href   TEXT        │     FraudSight 链接
│ idempotency_key     VARCHAR(128)│     幂等键
│ raw_request         JSONB       │     原始请求快照
│ raw_response        JSONB       │     原始响应快照
│ created_at          TIMESTAMP   │
│ updated_at          TIMESTAMP   │
└─────────────────────────────────┘

Status 状态机:
  pending → authorized → captured → settled
           │                │
           ▼                ▼
        cancelled         refunded → partially_refunded
           │
           ▼
        refused (终态)
```

### 5.2 幂等性

所有 `POST` 操作支持 `Idempotency-Key` header 或请求体中的 `idempotencyKey`。
- 首次请求：正常处理，存储 key → result 映射
- 重复请求（24h 内相同 key）：返回首次结果，不创建新资源

---

## 6. 安全模型

### 6.1 层级结构

```
┌──────────────────────────────────────────────────┐
│                   商户侧                          │
│  · API Key (Bearer Token) per merchant           │
│  · HMAC 签名校验 (可选)                           │
│  · IP 白名单 (可选)                               │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│                   网关内部                         │
│  · Worldpay Basic Auth (统一凭证)                  │
│  · merchant → entity 映射表                       │
│  · paymentFacilitator 信息自动注入                 │
│  · 卡号明文不落盘 (仅通过 token 引用)               │
│  · worldpay token href 加密存储                   │
└──────────────────────┬───────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────┐
│                   Worldpay                        │
│  · TLS 1.3                                        │
│  · Basic Auth                                     │
│  · DNS whitelisting                               │
└──────────────────────────────────────────────────┘
```

### 6.2 PCI 合规策略

| 层级 | PCI 暴露 | 措施 |
|------|---------|------|
| 商户 → 网关 | 卡号明文 | 商户前端直连 Worldpay Token API → 我们仅接收 token ID |
| 网关 → Worldpay | token href | 不传输明文卡号 |
| 网关存储 | 脱敏信息 | 仅存 bin + last4 + 加密 token href |

> **建议**：商户前端使用 [Sessions API](https://developer.worldpay.com/) 直接 tokenize 卡号，网关仅接收 token ID。PCI 审计范围最小化。

---

## 7. MVP 范围与边界

### 7.1 一期包含 (In Scope)

| 功能模块 | 包含内容 | 不包含 |
|---------|---------|--------|
| **卡支付** | CIT 授权 + 请款 + 退款 + 取消 | MIT 循环扣款、部分请款、Apple/Google Pay |
| **3DS** | 3DS v2 认证 (device data + authenticate + verify) | 3DS v1 |
| **FraudSight** | 风控评估 + riskProfile 关联支付 | 自定义风控规则、事后 fraud/chargeback update |
| **Token** | 创建 + 查询 token | Verified Tokens、Network Tokens、更新/删除 token |
| **交易查询** | 按 ID 查单笔 + 按日期范围查列表 | 高级筛选（按事件类型、金额范围） |
| **对账** | 按日期范围拉对账单 | 自动化差异匹配、多币种 FX 对账 |

### 7.2 一期明确不包含 (Out of Scope)

| 项目 | 说明 |
|------|------|
| 子商户入驻 (Parties API) | 一期手动配置 entity 映射，二期接入 Parties API 自动开户 |
| 分账 (Split Payments) | 一期不自动分账，二期接入 |
| 打款 (Account Payouts) | 子商户打款走 Worldpay 后台手动操作 |
| MIT 循环扣款 | 订阅场景一期不支持 |
| APM 本地支付 | 仅卡支付 |
| Webhook 商户通知 | 一期只提供查询接口，二期加推模式 |
| Account Updater | 卡信息自动更新 |

### 7.3 技术选型建议

| 组件 | 建议 |
|------|------|
| 语言/框架 | TypeScript + Fastify / Go + Gin（根据团队栈选） |
| 数据库 | PostgreSQL (主库) + Redis (幂等缓存 + 限流) |
| 部署 | Cloud Run / K8s（无状态，水平扩展） |
| 监控 | OpenTelemetry → Grafana / Datadog |
| 密钥管理 | Secret Manager / Vault (Worldpay 凭证、商户 API Secret) |

### 7.4 实施里程碑

```
Week 1-2: Token + 3DS 链路
  ├── Tokens API 集成 (创建/查询)
  ├── 3DS authenticate + verify
  └── 商户侧 Token API 上线

Week 3-4: Payment 核心链路
  ├── Card Payments CIT 授权
  ├── Capture / Refund / Cancel
  └── 商户侧 Payment API 上线

Week 5: 风控 + 查询
  ├── FraudSight 集成
  ├── Payment Queries 集成
  └── 商户侧 查询 API 上线

Week 6: 对账 + 联调
  ├── Statements 集成
  ├── 端到端测试
  └── Go-live checklist
```

---

## 8. 附录：Worldpay 请求/响应速查

### 8.1 各 API 版本 Header

| API | 版本 | Accept / Content-Type |
|-----|------|----------------------|
| Card Payments v7 | v7 | `application/vnd.worldpay.payments-v7+json` |
| 3DS | v2 | `application/vnd.worldpay.verifications.customers-v2.hal+json` |
| FraudSight | v1 | `application/vnd.worldpay.fraudsight-v1.hal+json` |
| Tokens | v3 | `application/vnd.worldpay.tokens-v3.hal+json` |
| Payment Queries | v1 | `application/vnd.worldpay.payment-queries-v1.hal+json` |
| Statements | 2025-01-01 | `WP-Api-Version: 2025-01-01` (application/json) |

### 8.2 PayFac 必填字段（每笔 CIT 授权）

```json
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

### 8.3 测试环境

| 项目 | 值 |
|------|-----|
| Base URL | `https://try.access.worldpay.com` |
| 测试 Entity | `your_entity` (已验证) |
| 测试卡号 | `4444333322221111` |
| 测试卡有效期 | `05/2035` |
| 测试 CVC | `123` |
| Worldpay 支付查询异步延迟 | 3~15 分钟 |

### 8.4 响应状态码

| HTTP | 含义 |
|------|------|
| 201 | 授权 / Token 创建成功 |
| 200 | 查询成功 / Token 已存在 |
| 400 | 请求参数错误 (含 `validationErrors` 详情) |
| 401 | 认证失败 |
| 403 | 权限不足 (entity 未配置) |
| 404 | 资源不存在 |
| 409 | Token 冲突 (同名卡信息不匹配) |
| 422 | Token 不可识别 (卡号/品牌无效) |
| 502 | Worldpay 上游不可用 |
| 503 | 服务不可用 |
