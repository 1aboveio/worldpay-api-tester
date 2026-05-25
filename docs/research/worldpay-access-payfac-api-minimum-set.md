# Worldpay Access — PayFac API 最小集 & 业务流程

> **文档目的**：作为 PayFac 对接 Worldpay Access 平台的技术选型参考，梳理可跑通业务的最小 API 集合及完整业务流程。
>
> **最后更新**：2026-05-25

---

## 一、API 最小集（9 个模块）

| # | API | 版本 | 用途 | 必须? |
|---|-----|------|------|-------|
| 1 | **Parties** | `2025-01-01` | 子商户入驻、KYC/KYB、收款账户绑定 | ✅ 核心 |
| 2 | **Card Payments** | `7` | 卡收单（授权/请款/退款/取消） | ✅ 核心 |
| 3 | **Tokens** | `3` | 卡号脱敏 token 化，降低 PCI 合规成本 | ✅ 强烈建议 |
| 4 | **3DS** | `2` | SCA 强客户认证，满足 PSD2 监管 | ✅ 合规必需 |
| 5 | **Split Payments** | `2025-06-25` | 一笔付款按比例分账给多个子商户 | ✅ PayFac 核心 |
| 6 | **Account Payouts** | `2025-01-01` | 批量/单笔打款到子商户银行账户 | ✅ 核心 |
| 7 | **Balances** | `2025-01-01` | 查询账户余额 | ⚪ 运营必备 |
| 8 | **Statements** | `2025-01-01` | 对账单，按日期查借贷明细 | ⚪ 对账必备 |
| 9 | **Payment Queries** | `1` | 按时间/币种/卡尾号查询交易 | ⚪ 查单必备 |

### 可选增强（后续迭代接入）

| API | 用途 |
|-----|------|
| FraudSight v1 | 独立风控评分引擎 |
| Verified Tokens v3 | CIT 合规 token 化（带 0 元验证） |
| APMs 2024-07-01 | 本地支付方式（eWallet、银行转账等） |
| FX 1 | 换汇管理 |
| Card Payouts 4 | 快速到卡打款（Fast Access） |
| Money Transfers 1 | OCT 原路退回卡 |
| Account Transfers 2025-01-01 | 同主体多币种账户间资金调拨 |
| Sessions API 2025-09-29 | 委托支付（delegated payments） |

---

## 二、环境与认证

### 服务器地址

| 环境 | Base URL |
|------|----------|
| 测试 (Try / Sandbox) | `https://try.access.worldpay.com` |
| 生产 (Live) | `https://access.worldpay.com` |

### 认证方式

所有 API 统一使用 **HTTP Basic Auth**：

```
Authorization: Basic {base64(username:password)}
```

> 凭证由 Worldpay Implementation Manager 提供。

### 版本控制

不同 API 使用不同的版本控制 Header：

| API 组 | 版本 Header | 示例值 |
|--------|------------|--------|
| Card Payments, Tokens, 3DS, FraudSight, Payouts, Verifications | `Accept` + `Content-Type` | `application/vnd.worldpay.payments-v7+json` |
| Parties, Balances, Statements, Account Transfers, Account Payouts, Split Payments | `WP-Api-Version` | `2025-01-01` |

### DNS 白名单

- `https://try.access.worldpay.com/`
- `https://access.worldpay.com/`

> ⚠️ 请使用 **DNS 白名单**，不要使用 IP 白名单。请求响应建议做本地缓存。

---

## 三、关键端点速查表

### Parties — 子商户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/parties` | 创建子商户 |
| `GET` | `/parties` | 浏览子商户列表（分页） |
| `GET` | `/parties/{partyId}` | 查看子商户详情 |
| `PUT` | `/parties/{partyId}` | 更新子商户信息 |
| `POST` | `/parties/{partyId}/balanceAccounts` | 创建资金账户 |
| `GET` | `/parties/{partyId}/balanceAccounts/{id}` | 查看资金账户 |
| `POST` | `/parties/{partyId}/payoutInstruments` | 添加打款方式（银行账户/卡） |
| `GET` | `/parties/{partyId}/payoutInstruments/{id}` | 查看打款方式 |
| `POST` | `/parties/{partyId}/identityVerification` | KYC 身份核验 |
| `GET` | `/parties/{partyId}/identityVerification` | 查看 KYC 状态 |
| `POST` | `/parties/{partyId}/beneficialOwners` | 添加受益所有人 |
| `POST` | `/parties/{partyId}/deactivation` | 停用子商户 |
| `POST` | `/parties/{partyId}/activation` | 重新激活子商户 |

### Card Payments — 卡收单

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/cardPayments/customerInitiatedTransactions` | CIT 支付（买家主动发起） |
| `POST` | `/cardPayments/merchantInitiatedTransactions` | MIT 支付（商户发起，如续费） |
| `POST` | `/payments/settlements/{linkData}` | 全额请款 |
| `POST` | `/payments/settlements/partials/{linkData}` | 部分请款 |
| `POST` | `/payments/settlements/refunds/full/{linkData}` | 全额退款 |
| `POST` | `/payments/settlements/refunds/partials/{linkData}` | 部分退款 |
| `POST` | `/payments/authorizations/cancellations/{linkData}` | 全额取消授权 |
| `POST` | `/payments/authorizations/cancellations/partials/{linkData}` | 部分取消授权 |
| `POST` | `/payments/authorizations/incrementalAuthorizations/{linkData}` | 追加授权金额 |
| `POST` | `/payments/sales/reversals/{linkData}` | 冲正（自动判断 cancel/refund） |
| `GET` | `/payments/events/{linkData}` | 查询支付状态 |
| `GET` | `/payments/events` | 支付状态恢复查询（超时等异常场景） |

### Tokens — 卡号脱敏

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/tokens` | 创建 token |
| `GET` | `/tokens/{tokenId}` | 查询 token 信息（默认脱敏） |
| `PUT` | `/tokens/{tokenId}` | 更新 token |
| `DELETE` | `/tokens/{tokenId}` | 删除 token |
| `POST` | `/tokens/network` | 申请网络 token 化 |
| `GET` | `/tokens/network/{id}` | 查询网络 token |

> ⚠️ 如需要解 token 获取明文卡号（detokenization），需传 Header `Accept: application/vnd.worldpay.tokens-v3.hal+json; masked=false`。这会触发高等级 PCI 审计要求。

### 3DS — 强客户认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/verifications/customers/3ds/deviceDataInitialize` | 生成设备指纹采集数据 |
| `POST` | `/verifications/customers/3ds/authenticate` | 发起 3DS 认证 |
| `POST` | `/verifications/customers/3ds/verification` | 验证 Challenge 结果 |

### Split Payments — 分账

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/splitPayments` | 创建分账请求 |
| `POST` | `/splitPayments/{id}/fulfillments` | 全部 line items 结算 |
| `POST` | `/splitPayments/{id}/items/{itemId}/fulfillments` | 单个 line item 结算 |

### Account Payouts — 打款

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/accountPayouts` | 单笔打款 |
| `POST` | `/accountPayouts/batch` | 批量打款 |
| `GET` | `/accountPayouts/{payoutRequestId}` | 查询打款详情 |
| `GET` | `/accountPayouts/events` | 查询打款事件 |

### 对账 & 运维

| API | 方法 | 路径 | 说明 |
|-----|------|------|------|
| Balances | `GET` | `/accounts` | 所有账户余额 |
| Balances | `GET` | `/accounts/{accountNumber}` | 单个账户余额 |
| Statements | `GET` | `/accounts/statements` | 对账单（按日期范围+筛选） |
| Payment Queries | `GET` | `/paymentQueries/payments` | 按条件查询交易 |
| Payment Queries | `GET` | `/paymentQueries/payments/{id}` | 单笔交易详情 |
| Payment Queries | `GET` | `/paymentQueries/archivedPayments` | 历史交易查询（2024-06-25 之前） |

---

## 四、PayFac 完整业务流程图

### Phase 1: 子商户入驻 (Onboarding)

```
① POST /parties
   ┌──────────┐
   │ 创建子商户 │ → 返回 partyId
   └─────┬────┘
         │
② POST /parties/{partyId}/balanceAccounts
   ┌──────────────┐
   │ 创建资金账户   │ → 返回 balanceAccountId (按币种)
   └─────┬────────┘
         │
③ POST /parties/{partyId}/payoutInstruments
   ┌──────────────────┐
   │ 绑定子商户打款方式  │ → 银行账户/卡 (后续 payout 用)
   └─────┬────────────┘
         │
④ POST /parties/{partyId}/beneficialOwners
   ┌────────────────────┐
   │ 添加受益所有人 (UBO) │ → 合规要求 (≥25% 持股)
   └─────┬──────────────┘
         │
⑤ POST /parties/{partyId}/identityVerification
   ┌──────────────┐
   │ KYC 身份核验   │ → verified / pending / rejected
   └──────────────┘
```

### Phase 2: 支付处理 (Payment Processing)

```
买家发起支付
    │
① POST /tokens                     ← 可选: 先 token 化卡号 (降 PCI 范围)
   ┌──────────┐
   │ Token 化  │ → 返回 tokenId (后续支付传 token 而非明文卡号)
   └─────┬────┘
         │
② POST /verifications/customers/3ds/deviceDataInitialize
   ┌─────────────────┐
   │ 3DS 设备指纹采集  │ → 生成 deviceDataCollectionUrl，前端 SDK 采集
   └─────┬───────────┘
         │
③ POST /verifications/customers/3ds/authenticate
   ┌──────────────────┐
   │ 3DS 认证          │ → frictionless（免挑战）或 challenge（需挑战）
   │ (传 token/卡号)    │
   └─────┬────────────┘
         │  (如果是 challenge 流程)
④ POST /verifications/customers/3ds/verification
   ┌──────────────────┐
   │ 3DS Challenge 验证 │ → 验证 challenge 结果，获取 authenticationResult
   └─────┬────────────┘
         │
⑤ POST /cardPayments/customerInitiatedTransactions
   ┌───────────────────────────┐
   │ CIT 支付授权                │
   │ {                          │
   │   token: "...",            │ ← 或直接传明文卡号
   │   merchant: {              │
   │     entity: "subMerchantRef"│ ← 标识子商户
   │   },                       │
   │   authentication: {        │
   │     ...3DS result          │ ← 3DS 认证结果
   │   }                        │
   │ }                          │
   └─────┬─────────────────────┘
         │ → 返回 authorized / refused + linkData
         │
⑥ POST /payments/settlements/{linkData}
   ┌──────────────┐
   │ 全额请款       │ → settled (资金从发卡行进入 WP)
   └──────────────┘
```

### Phase 3: 分账 (Fund Splitting)

```
① POST /splitPayments
   ┌───────────────────────────────────────────┐
   │ 创建分账指令                                 │
   │ {                                          │
   │   paymentLink: "{linkData}",               │ ← 关联支付
   │   items: [                                 │
   │     {                                      │
   │       partyId: "subMerchantA",              │ ← 子商户 A
   │       amount: 90.00,                       │ ← 得 90
   │       currency: "USD"                      │
   │     },                                     │
   │     {                                      │
   │       partyId: "payFacSelf",                │ ← PayFac 自身
   │       amount: 10.00,                       │ ← 抽 10
   │       currency: "USD"                      │
   │     }                                      │
   │   ]                                        │
   │ }                                          │
   └─────┬─────────────────────────────────────┘
         │
② POST /splitPayments/{id}/fulfillments
   ┌──────────────┐
   │ 确认分账结算   │ → 各方资金分别入账到各自的 balanceAccount
   └──────────────┘
```

### Phase 4: 资金清分 & 打款 (Payout)

```
① GET /accounts
   ┌──────────────────┐
   │ 查看各子商户余额    │ → 确认各 balanceAccount 余额
   └─────┬────────────┘
         │
② POST /accountPayouts/batch
   ┌────────────────────────────────────┐
   │ 批量打款给子商户                      │
   │ {                                   │
   │   payouts: [                        │
   │     {                               │
   │       partyId: "subMerchantA",       │
   │       amount: 9000.00,              │
   │       currency: "USD",              │
   │       payoutInstrumentId: "..."     │ ← Phase 1 绑定的打款方式
   │     },                              │
   │     ...                             │
   │   ]                                 │
   │ }                                   │
   └────────────────────────────────────┘
```

### Phase 5: 对账 & 运维 (Reconciliation)

```
① GET /accounts/statements?fromDate=...&toDate=...&accountNumber=...
   ┌──────────────┐
   │ 日终对账单     │ → 拉取借贷明细，与内部系统对账
   └──────────────┘

② GET /paymentQueries/payments?fromDate=...&toDate=...&last4Digits=...
   ┌──────────────────┐
   │ 按条件查询交易      │ → 查漏单、争议处理
   └──────────────────┘

③ GET /paymentQueries/payments/{paymentId}
   ┌────────────────┐
   │ 单笔交易详情      │ → 排查具体问题
   └────────────────┘

④ 退款处理
   POST /payments/settlements/refunds/full/{linkData}
   POST /payments/settlements/refunds/partials/{linkData}
   ┌──────────────┐
   │ 全额 / 部分退款 │ → 争议 / 售后
   └──────────────┘

⑤ 子商户生命周期
   POST /parties/{partyId}/deactivation   → 停用子商户
   POST /parties/{partyId}/activation     → 重新激活
```

---

## 五、按场景的 API 调用序列

### 场景 A：子商户入驻 → 收单 → 分账 → 打款（Happy Path）

| Step | API | 说明 |
|------|-----|------|
| 1 | `POST /parties` | 创建子商户 |
| 2 | `POST /parties/{id}/balanceAccounts` | 开通 USD 资金账户 |
| 3 | `POST /parties/{id}/payoutInstruments` | 绑定银行账户 |
| 4 | `POST /parties/{id}/beneficialOwners` | 添加 UBO |
| 5 | `POST /parties/{id}/identityVerification` | KYC 核验 |
| 6 | `POST /tokens` | Token 化买家卡号 |
| 7 | `POST .../3ds/deviceDataInitialize` | 3DS 设备指纹 |
| 8 | `POST .../3ds/authenticate` | 3DS 认证 |
| 9 | `POST /cardPayments/customerInitiatedTransactions` | CIT 支付授权 |
| 10 | `POST /payments/settlements/{link}` | 请款 |
| 11 | `POST /splitPayments` | 分账 |
| 12 | `POST /splitPayments/{id}/fulfillments` | 确认分账 |
| 13 | `POST /accountPayouts/batch` | 批量打款到子商户银行账户 |

### 场景 B：退款流程

| Step | API | 说明 |
|------|-----|------|
| 1 | `GET /paymentQueries/payments/{id}` | 找到原交易，获取 linkData |
| 2 | `POST /payments/settlements/refunds/full/{link}` | 全额退款 |

### 场景 C：MIT 循环扣款（订阅 / 续费）

| Step | API | 说明 |
|------|-----|------|
| 1 | `GET /tokens/{tokenId}` | 确认 token 有效 |
| 2 | `POST /cardPayments/merchantInitiatedTransactions` | MIT 扣款（传 token + CIT 原交易 reference） |

### 场景 D：争议处理（Chargeback）

| Step | API | 说明 |
|------|-----|------|
| 1 | `GET /paymentQueries/payments?receivedEvents=CHARGEBACK` | 查询争议交易 |
| 2 | 人工处理 | 收集证据上传（通常通过 WP 后台或 SFTP） |

### 场景 E：对账（每日 T+1）

| Step | API | 说明 |
|------|-----|------|
| 1 | `GET /accounts/statements?fromDate=...&toDate=...` | 拉取对账单明细 |
| 2 | `GET /accounts` | 核对各账户余额 |
| 3 | 逐笔比对 | 与内部系统交易记录匹配 |

---

## 六、分流建议：两个支付 API 怎么选

Worldpay 提供了两条支付路径：

| 维度 | **Card Payments v7** | **Payments 2024-06-01 (统一 API)** |
|------|---------------------|----------------------------------|
| 定位 | 传统卡收单，手动编排流程 | 一站式：自动编排 FraudSight + 3DS + Token |
| 3DS | 需单独调 3DS API | 内建，一次请求完成 |
| FraudSight | 需单独调 FraudSight API | 内建 |
| Token | 需预先调 Tokens API | 内建，自动返回 token |
| MIT 支持 | ✅ 原生支持 `/merchantInitiatedTransactions` | ❌ 不支持 |
| 控制粒度 | 高，每一步都独立可控 | 低，黑盒编排 |
| 适合场景 | 有现有编排经验的团队 / 需要 MIT | 新接入 PayFac，快速上线 |

> **建议**：作为 PayFac 新接入，优先选择 **Card Payments v7** 作为主路径。
> 原因：
> 1. PayFac 需要 MIT（循环扣款）能力，这是统一 Payments API 不支持的
> 2. PayFac 通常已有自己的编排逻辑，需要精细控制每一步
> 3. 按场景选择：CIT 用 Card Payments v7 + 单独 3DS；MIT 用 Card Payments v7 的 merchantInitiatedTransactions

---

## 七、对接顺序建议（6 周计划）

```
     Week 1-2              Week 3-4              Week 5-6
 ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
 │ Sandbox 环境    │   │ 支付核心链路    │   │ 清分 + 对账     │
 │                │   │                │   │                │
 │ · 环境搭建      │   │ · Card         │   │ · Split        │
 │ · 认证调试      │   │   Payments     │   │   Payments     │
 │ · Parties      │   │ · 3DS           │   │ · Account      │
 │   (入驻流程)    │   │ · Tokens        │   │   Payouts      │
 │ · Tokens       │   │                │   │ · Statements   │
 │   (token 化)   │   │                │   │ · Payment      │
 │                │   │                │   │   Queries      │
 │                │   │                │   │ · Balances     │
 └────────────────┘   └────────────────┘   └────────────────┘
```

### 各阶段里程碑

| 阶段 | 完成标志 |
|------|---------|
| Week 1-2 | 能在 Sandbox 创建子商户、绑定账户、完成 KYC、创建 token |
| Week 3-4 | 能在 Sandbox 完成一笔 CIT 支付（含 3DS）+ 请款 + 退款完整闭环 |
| Week 5-6 | 能在 Sandbox 完成分账 → 批量打款 → 拉对账单全链路 |
| Go Live | 切换到 Production 环境凭证，完成首笔真实交易 |

---

## 八、Webhook / 异步通知

> ⚠️ 本文档未涵盖 Webhook 通知机制。Worldpay Access 支持通过 Webhook 接收支付状态变更、分账结果、打款状态等异步事件。建议在支付核心链路联调阶段同步配置 Webhook，避免仅依赖轮询 `/payments/events` 获取状态。

---

## 九、参考链接

- [Worldpay Access 开发者门户](https://developer.worldpay.com/)
- [Worldpay Access API 参考](https://access.worldpay.com/)
- Sandbox 申请：联系 Worldpay Implementation Manager
