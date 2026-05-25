# Worldpay Access — PayFac Payment Gateway

> 为电商子商户提供 Stripe 风格统一支付 API 的 PayFac 支付网关，上游对接 Worldpay Access 平台。

## 架构概览

```
Sub-merchants (E-commerce)
        │  REST API (API Key)
        ▼
┌───────────────────────────┐
│   PayFac Payment Gateway  │
│   · Tokenization          │
│   · 3DS v2 Orchestration  │
│   · FraudSight (invisible)│
│   · CIT + MIT Routing     │
└───────────┬───────────────┘
            │  HTTP Basic Auth
            ▼
┌───────────────────────────┐
│  Worldpay Access Platform │
│  Cards · 3DS · FraudSight │
│  Tokens · Queries · Stmts │
└───────────────────────────┘
```

- **Omni 统一接口**：单一 `POST /v1/payment_intents` 支持 card / token / MIT
- **Stripe 范式**：PaymentIntent → confirm → capture → refund
- **透明增强**：Token 化、3DS 认证、FraudSight 风控对子商户无感
- **PayFac 合规**：`paymentFacilitator` 自动注入，entity 按商户路由

## MVP 范围

| 模块 | 状态 |
|------|------|
| Card Payments (CIT + MIT) | ✅ 已对接 |
| 3DS v2 (DDC + Auth + Challenge) | ✅ 设计完成 |
| FraudSight 风控 | ✅ 已对接 |
| Token 化 | ✅ 已对接 |
| Payment Queries | ✅ 已对接 |
| Statements 对账 | ✅ 已对接 |

## 文档

| 文档 | 说明 |
|------|------|
| [API 调研 & 最小集](docs/research/worldpay-access-payfac-api-minimum-set.md) | Worldpay API 选型、业务流程、9 模块最小集 |
| [架构设计](docs/design/payfac-payment-gateway-mvp-design.md) | 系统架构、状态机、3DS/DDC 前端流程、Stripe 对比 |
| [PRD (可交付研发)](docs/prd/payfac-payment-gateway-mvp-prd.md) | 用户故事、API 参考、核心流程伪代码、Worldpay 对接规范 |

## 快速开始

```bash
cp .env.example .env
# 编辑 .env 填入 Worldpay 凭证

npm install
npm run verify:card-payments
```

## API 验证

```bash
# 4-step 闭环: CIT Auth → txnRef Query → Date Query → Single Query
WORLDPAY_ENTITY=your_entity npm run verify:card-payments

# 自动探测可用 entity
node --env-file=.env --import tsx src/probe-entities.ts
```

## 技术栈

TypeScript · Node.js 25 · Worldpay Access API · Basic Auth · HATEOAS
