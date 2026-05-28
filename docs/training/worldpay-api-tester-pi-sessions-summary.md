# Worldpay API Tester 项目 — Pi Session 历史总结与设计文档生成过程

> **文档目的**：为产品同学培训提供项目背景、设计决策过程和关键产出物的全面总结。
>
> **最后更新**：2026-05-29
>
> **项目路径**：`/Users/exoulster/projects/worldpay-api-tester`

---

## 一、项目概述

**Worldpay API Tester** 是一个 PayFac（支付聚合商）支付网关项目，目标是为电商子商户提供类似 Stripe 风格的统一支付 API，上游对接 Worldpay Access 平台。

### 核心业务场景
- **卡支付（CIT）**：买家主动发起的支付
- **3DS 安全认证**：满足 PSD2 监管要求
- **Token 化**：安全存储卡信息，降低 PCI 合规成本
- **循环扣款（MIT）**：订阅/续费场景
- **退款**：全额/部分退款
- **对账**：财务核对 Worldpay 结算金额

---

## 二、Pi Session 历史总结

### 2.1 Session 时间线

| 日期时间 | Session ID | 主要内容 | 产出物 |
|---------|------------|---------|--------|
| 2026-05-25 07:19 | `019e5e00...` | 安装 Worldpay MCP Server | MCP 配置尝试 |
| 2026-05-25 07:24 | `019e5e05...` | 安装 Worldpay MCP（重试） | MCP 配置尝试 |
| 2026-05-25 07:26 | `019e5e07...` | 安装 Worldpay MCP（重试） | MCP 配置尝试 |
| 2026-05-25 07:29 | `019e5e09...` | 安装 Worldpay MCP（重试） | MCP 配置尝试 |
| 2026-05-25 07:34 | `019e5e0e...` | 搜索 Worldpay 文档 | MCP 搜索验证 |
| **2026-05-25 07:38** | **`019e5e12...`** | **核心开发 session** | **研究文档、验证脚本、Entity 探测** |
| 2026-05-25 12:43 | `019e5f29...` | 转换设计文档为 GitHub Issues | 9 个 GitHub Issues |
| 2026-05-27 05:09 | `019e67d6...` | 测试标准审计 | 测试标准文档 |
| 2026-05-27 06:14 | `019e6811...` | 测试计划制定 | 测试计划 |
| 2026-05-27 06:32 | `019e6822...` | 测试计划完善 | 测试计划 |
| 2026-05-27 06:53 | `019e6835...` | 测试计划调整 | 测试计划 |
| 2026-05-27 06:57 | `019e6839...` | 测试计划完善 | 测试计划 |
| 2026-05-27 07:16 | `019e684a...` | 测试计划完善 | 测试计划 |
| 2026-05-28 18:08 | `019e6fc6...` | 最新 session | 持续开发 |

### 2.2 核心 Session 详解

#### Session 1：API 最小集梳理与验证（2026-05-25 07:38）

**用户需求**：
> "我们是一家 PayFac，现在要对接 worldpay access 平台。请帮我整理可以跑通业务的 API 最小集，并以此构建业务流程。"

**AI 执行过程**：
1. 使用 Worldpay MCP Server 搜索文档
2. 梳理出 9 个核心 API 模块
3. 生成研究文档 `docs/research/worldpay-access-payfac-api-minimum-set.md`
4. 创建验证脚本 `src/verify-card-payments.ts`
5. 自动探测 20 个 Worldpay Entity，找到可用的 `gfhk001`

**关键产出**：
- `docs/research/worldpay-access-payfac-api-minimum-set.md` — API 最小集文档
- `src/verify-card-payments.ts` — 验证脚本
- `src/probe-entities.ts` — Entity 探测脚本

#### Session 2：设计文档转 GitHub Issues（2026-05-25 12:43）

**用户需求**：
> "create dev branch, let's convert the design and prd /to-issues (github issues) for implementation"

**AI 执行过程**：
1. 读取设计文档和 PRD
2. 使用 `to-issues` skill 将文档转换为垂直切片
3. 创建 `dev/payfac-gateway-mvp` 分支
4. 发布 9 个 GitHub Issues，包含完整的依赖关系

**垂直切片（9 个 Issues）**：

| # | 标题 | 类型 | 用户故事 |
|---|------|------|---------|
| 1 | Scaffold & Auth — Monorepo setup, API key auth | AFK | 基础设施 |
| 2 | Tokenization & PaymentMethod API | AFK | US-03 |
| 3 | CIT Card Payment — Core (no 3DS) | AFK | US-01 |
| 4 | 3DS v2 Full Flow | AFK | US-02 |
| 5 | Idempotency & Timeout Recovery | AFK | 可靠性 |
| 6 | MIT Recurring Payments | AFK | US-04 |
| 7 | Manual Capture & Cancel | AFK | US-01 变体 |
| 8 | Refunds | AFK | US-05 |
| 9 | Payment Queries & Statements | AFK | US-06 |

**依赖关系图**：
```
1 (Scaffold)
 └─► 2 (Tokenization) ──┐
                        ├─► 3 (CIT Core) ──┬──► 4 (3DS)
                        │                  ├──► 5 (Idempotency)
                        │                  ├──► 6 (MIT)
                        │                  ├──► 7 (Capture/Cancel)
                        │                  └──► 8 (Refunds)
                        └─► 9 (Queries/Statements) — can start after 1+2
```

---

## 三、设计文档生成过程

### 3.1 文档时间线

| 时间 | 文档 | 版本 | 主要变更 |
|------|------|------|---------|
| 16:14 | 架构设计文档 | v1 | 初始版本 |
| 16:30 | 架构设计文档 | v2 | Stripe 风格 API 重新设计 |
| 16:55 | 架构设计文档 | v3 | 添加 DDC 集成、3DS 重定向路径、Stripe 对比 |
| 17:00 | 架构设计文档 | v3 | 详细的 Stripe vs 我们的设计 3DS 对比 |
| 17:12 | 架构设计文档 | v3.1 | 添加 DDC 优化分析（§6.6） |
| 17:25 | 架构设计文档 | v3.2 | 修复对抗性审查中的所有关键/高优先级问题 |
| 18:58 | PRD 文档 | v1 | 开发者就绪的实现规范 |
| 19:07 | PRD 文档 | v1.1 | 添加 §8 Worldpay API 集成规范 |
| 19:19 | PRD 文档 | v1.2 | 重构 — 删除清单、重新排序章节、结构化 API 格式 |
| 19:38 | PRD 文档 | v1.3 | 解决双代理审查中的 6 个一致性问题 |

### 3.2 架构设计文档生成过程

#### 阶段 1：初始设计（v1, 16:14）
- 基于研究文档的 API 最小集
- 定义核心架构组件
- 建立 Worldpay 集成适配器层

#### 阶段 2：Stripe 风格重新设计（v2, 16:30）
**用户反馈**：要求采用 Stripe 风格的 API 设计

**关键设计决策**：
1. **Omni 统一接口**：单一 `PaymentIntent` 端点支持所有支付方式
2. **透明增强**：Token 化、风控、3DS 对子商户透明
3. **默认自动请款**：Auth + Capture 合并，减少集成复杂度
4. **PCI 不落地**：卡号即时 tokenize，明文不落盘

**新增内容**：
- 子商户 API 设计（Stripe-style）
- 完整状态机
- 3DS 前端集成流程
- FraudSight 后台策略

#### 阶段 3：详细对比与优化（v3, 16:55-17:25）
**关键新增**：
1. **DDC 集成流程**：Device Data Collection 的隐藏 iframe 实现
2. **Stripe 对比分析**：详细对比 Stripe 和我们设计的 3DS 全链路差异
3. **DDC 优化分析**：
   - 自动加载 DDC = 100% 采集？（答案：不是，是懒触发 + 时间窗口重叠）
   - 浪费率分析：Stripe 接受约 30% 的 DDC 调用浪费
   - 并行 vs 串行性能对比：用户感知延迟从 ~5s 降到 ~0s
   - SDK 预取模式实现
4. **对抗性审查修复**：修复所有关键/高优先级问题

### 3.3 PRD 文档生成过程

#### 阶段 1：开发者就绪规范（v1, 18:58）
- 基于架构设计文档
- 定义用户故事和验收标准
- 提供完整的 API 参考

#### 阶段 2：Worldpay API 集成规范（v1.1, 19:07）
**新增 §8**：
- 环境与认证
- HTTP 客户端封装
- Tokens v3 — Token 化
- Card Payments v7 — CIT 授权
- 3DS v2
- FraudSight v1
- Payment Queries v1
- Statements 2025-01-01

#### 阶段 3：结构化重构（v1.2, 19:19）
- 删除冗余清单
- 重新排序章节
- 结构化 API 格式

#### 阶段 4：一致性修复（v1.3, 19:38）
- 解决双代理审查中的 6 个一致性问题
- 确保 PRD 和设计文档的术语一致

### 3.4 设计决策的关键点

#### 决策 1：Stripe 风格 vs 原生 Worldpay 风格
**选择**：Stripe 风格
**理由**：
- 子商户学习成本低
- 统一的 API 范式
- 更好的开发者体验

#### 决策 2：Omni 统一接口 vs 分离端点
**选择**：Omni 统一接口（单一 `PaymentIntent` 端点）
**理由**：
- 减少集成复杂度
- 参数控制 3DS 开关
- 自动处理 Token 化、风控、3DS 编排

#### 决策 3：自动请款 vs 手动请款
**选择**：默认自动请款
**理由**：
- 大多数场景不需要手动请款
- 减少 API 调用次数
- 简化集成流程

#### 决策 4：3DS 处理策略
**选择**：Gateway 自动处理 3DS，对子商户透明
**理由**：
- 子商户无需理解 3DS 细节
- Gateway 统一管理 DDC、认证、挑战
- 提供前端 SDK 简化集成

---

## 四、关键技术点总结

### 4.1 Worldpay API 集成

| API | 版本 | 用途 |
|-----|------|------|
| Tokens v3 | 3 | 卡号 token 化 |
| Card Payments v7 | 7 | CIT/MIT 授权 |
| 3DS v2 | 2 | 安全认证 |
| FraudSight v1 | 1 | 风控评估 |
| Payment Queries v1 | 1 | 交易查询 |
| Statements 2025-01-01 | 2025-01-01 | 对账 |

### 4.2 状态机设计

**PaymentIntent 状态**：
```
CREATED → TOKENIZING → TOKENIZED → RISK_ASSESSING → RISK_ASSESSED
→ DDC_INITIALIZING → REQUIRES_DEVICE_DATA → AUTHENTICATING
→ REQUIRES_ACTION → AUTHORIZING → AUTHORIZED
→ CAPTURING → SUCCEEDED
```

**关键状态**：
- `requires_device_data`：需要前端运行 DDC
- `requires_action`：需要 3DS Challenge
- `requires_capture`：已授权，等待手动请款

### 4.3 3DS 前端集成

**DDC（Device Data Collection）**：
- 隐藏 iframe 运行，用户无感
- 与用户填写卡号并行，支付时已就绪
- 约 2-5 秒完成

**Challenge 处理**：
- Iframe 模式：弹出 iframe/lightbox，不离开商户页面
- Redirect 模式：整页跳转到银行页面

### 4.4 安全模型

| 数据 | 传输 | 存储 | 措施 |
|------|------|------|------|
| 卡号 (PAN) | ✅ TLS | ❌ 不落盘 | 即时 tokenize |
| CVC | ✅ TLS | ❌ 不存 | Token 化后丢弃 |
| Token href | ✅ 加密 | ✅ AES-256 | 加密存储 |
| 脱敏信息 | — | ✅ 明文 | BIN + last4 + brand + expiry |

---

## 五、培训要点

### 5.1 产品同学需要了解的核心概念

1. **PayFac 模式**：我们作为支付聚合商，为子商户提供统一的支付接口
2. **Stripe 风格 API**：子商户无需理解 Worldpay 细节，使用我们提供的简洁 API
3. **Omni 统一接口**：一个端点处理所有支付场景，参数控制行为
4. **透明增强**：Token 化、风控、3DS 对子商户透明，网关自动处理
5. **PCI 合规**：卡号不落盘，降低合规成本

### 5.2 设计文档的价值

1. **架构设计文档**：定义了系统架构、组件职责、数据流
2. **PRD 文档**：提供了开发者就绪的实现规范，包含完整的 API 参考
3. **研究文档**：梳理了 Worldpay API 最小集，为技术选型提供依据

### 5.3 项目状态

- **研究阶段**：✅ 完成（API 最小集梳理、验证脚本）
- **设计阶段**：✅ 完成（架构设计、PRD、测试计划）
- **实现阶段**：🔄 进行中（GitHub Issues 已发布，等待开发）
- **测试阶段**：⏳ 待开始

---

## 六、附录：文件清单

### 文档文件
- `docs/research/worldpay-access-payfac-api-minimum-set.md` — API 最小集研究文档
- `docs/design/payfac-payment-gateway-mvp-design.md` — 架构设计文档（v3.2）
- `docs/prd/payfac-payment-gateway-mvp-prd.md` — PRD 文档（v1.3）
- `docs/test-plans/` — 测试计划目录
- `docs/tests/` — 测试标准目录

### 代码文件
- `src/verify-card-payments.ts` — API 验证脚本
- `src/probe-entities.ts` — Entity 探测脚本
- `.env.example` — 环境变量模板

### 配置文件
- `package.json` — 项目配置
- `tsconfig.json` — TypeScript 配置
- `.gitignore` — Git 忽略文件

---

**文档维护者**：MiMo AI Assistant  
**最后更新**：2026-05-29
