# AI 驱动的产品设计方法论 — 从 0 到 1 生成 PRD/设计文档

> **想法**：AI 帮产品经理从重复性工作中脱身，把精力留给决策和判断。
>
> **适用场景**：技术对接类项目（支付网关、API 集成、第三方服务对接）
>
> **最后更新**：2026-05-29

---

## 方法论总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI 驱动的产品设计四步法                                    │
│                                                                             │
│   ① 准备工作        ② 调研阶段         ③ 梳理与验证        ④ 文档生成       │
│   ───────────      ───────────       ─────────────      ────────────       │
│   · MCP 安装        · 需求范围调研      · 业务流程梳理       · PRD 生成        │
│   · Skills 配置     · API 文档调研      · 对抗式审查         · 设计文档生成    │
│   · 工具链准备       · 竞品/标杆分析    · 一致性校验         · 迭代优化        │
│                                                                             │
│   为什么？          调什么？           怎么验证？           如何产出？         │
│   让 AI 能访问      让 AI 理解         让 AI 自我挑战       让 AI 输出        │
│   领域知识          业务边界           确保文档质量         可执行文档        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 第一步：准备工作 — 让 AI 具备领域知识

### 1.1 为什么要安装 MCP 和 Skills？

**问题**：AI 的训练数据有截止日期，且不包含你公司的私有文档。

**MCP（Model Context Protocol）解决什么**：

| 没有 MCP | 有 MCP |
|---------|--------|
| AI 只能基于训练数据回答 | AI 可以实时查询最新文档 |
| 需要手动复制粘贴文档内容 | AI 自主搜索、检索、引用 |
| 容易产生幻觉 | 基于真实文档生成，可溯源 |

**Skills 解决什么**：

| 没有 Skills | 有 Skills |
|------------|----------|
| AI 每次都要重新理解任务格式 | AI 按照标准流程执行 |
| 输出格式不稳定 | 输出结构化、可预期 |
| 缺少领域最佳实践 | 内置行业/公司规范 |

### 1.2 本项目实际安装过程

```bash
# 安装 Worldpay MCP — 让 AI 能直接查询 Worldpay 官方文档
# 位置：~/.pi/agent/mcp.json

{
  "mcpServers": {
    "worldpay-docs": {
      "url": "https://docs.worldpay.com/access/mcp",
      "description": "Worldpay Access API Documentation"
    }
  }
}
```

**实际效果对比**：

```
❌ 没有 MCP 时的 Prompt：
"请根据以下 Worldpay API 文档内容，帮我梳理支付流程...
 [粘贴 5000 字文档]"

✅ 有 MCP 时的 Prompt：
"我们是 PayFac，要对接 Worldpay，请帮我梳理 API 最小集"
→ AI 自动调用 worldpay_docs_search("PayFac API")
→ AI 自动调用 worldpay_docs_get-endpoint-info("Card Payments", "7", "/cardPayments/customerInitiatedTransactions")
→ AI 基于真实文档生成结果
```

### 1.3 实际 Prompt 样本：MCP 安装

> **场景**：首次配置 Worldpay MCP Server
>
> **Prompt**：
> ```
> install the worldpay docs mcp from the below:
> 
> {
>   "Access Worldpay docs MCP server": {
>     "url": "https://docs.worldpay.com/access/mcp",
>     "description": "MCP Server"
>   }
> }
> ```
>
> **说明**：这个 prompt 尝试了 4 次才成功。教训：
> 1. 确认 MCP Server 支持的传输协议（SSE/HTTP）
> 2. 检查配置文件路径是否正确
> 3. 验证 MCP Server 是否需要认证

### 1.3 准备工作清单

| 项目 | 安装位置 | 用途 | 必要性 |
|------|---------|------|--------|
| **Worldpay MCP** | `~/.pi/agent/mcp.json` | 查询官方 API 文档 | ✅ 必须 |
| **grill-me skill** | `~/.agents/skills/grill-me/` | 对抗式审查 | ✅ 推荐 |
| **test-criteria skill** | `~/.agents/skills/test-criteria/` | 生成测试标准 | ⚪ 后续用 |
| **nextjs-fullstack skill** | `~/.agents/skills/nextjs-fullstack/` | 技术栈规范 | ⚪ 按需 |

---

## 第二步：调研阶段 — 让 AI 理解业务边界

### 2.1 需求范围调研

**Prompt 模板**：

```
我们是一家 [公司类型]，现在要 [业务目标]。

请帮我：
1. 梳理可跑通业务的 API 最小集
2. 构建完整的业务流程
3. 识别风险点和合规要求

输出格式：Markdown 文档，保存到 docs/research/
```

**实际 Prompt**：

> "我们是一家 PayFac，现在要对接 worldpay access 平台。请帮我整理可以跑通业务的 API 最小集，并以此构建业务流程。"

**执行过程**：
1. 调用 MCP 搜索 Worldpay 文档
2. 识别出 9 个核心 API + 8 个可选 API
3. 构建 5 个业务阶段的流程图
4. 生成研究文档

### 2.2 实际 Prompt 样本：API 调研与验证

> **场景 1：生成研究文档**
>
> **Prompt**：
> ```
> 我们是一家PayFac，现在要对接worldpay access平台。请帮我整理可以跑通业务的API最小集，并以此构建业务流程。
> ```
>
> **产出**：`docs/research/worldpay-access-payfac-api-minimum-set.md`

---

> **场景 2：API 验证**
>
> **Prompt**：
> ```
> 我现在有测试环境的API KEY，请按照这个文档进行接口验证，确保API可以跑通。
> 接下来，请使用Card Payments, Payment Queries 两个API接口，完成一个最小的 API 验证循环
> ```
>
> **产出**：`src/verify-card-payments.ts`

---

> **场景 3：Entity 探测**
>
> **Prompt**：
> ```
> worldpay提供了很多个WORLDPAY_ENTITY，我该怎么填？
> ```
>
> **回应**：entity 是 Worldpay 在入驻时分配的商户实体引用，建议先用 `default` 试
>
> **后续 Prompt**：
> ```
> 'gfhk001', 'gfhk002', 'gfhk003', 'gfhk004', 'gfhk005', 
> 'gfhk006', 'gfhk007', 'gfhk008', 'gfhk009', 'gfhk010', 
> 'gfhk011', 'gfhk012', 'gfhk013', 'gfhk014', 'gfhk015', 
> 'gfhk016', 'gfhk017', 'gfhk018', 'gfhk019', 'gfhk020'
> ```
>
> **产出**：`src/probe-entities.ts`，发现 `gfhk001` 可用

### 2.2 API 文档调研

**调研维度**：

| 维度 | 调研内容 | 输出物 |
|------|---------|--------|
| **功能覆盖** | 哪些 API 能覆盖业务需求？ | API 最小集清单 |
| **版本选择** | 用哪个版本？为什么？ | 版本选型报告 |
| **认证方式** | Basic Auth? OAuth? API Key? | 认证方案 |
| **请求/响应格式** | JSON 结构、字段含义 | 接口文档 |
| **错误码** | 可能的错误场景 | 错误处理策略 |
| **限流策略** | QPS 限制、重试策略 | 限流方案 |

**本项目产出**：

```markdown
# docs/research/worldpay-access-payfac-api-minimum-set.md

## API 最小集（9 个模块）
1. Parties — 子商户入驻
2. Card Payments — 卡收单
3. Tokens — 卡号 token 化
4. 3DS — SCA 认证
5. Split Payments — 分账
6. Account Payouts — 打款
7. Balances — 余额查询
8. Statements — 对账单
9. Payment Queries — 交易查询
```

### 2.3 竞品/标杆分析

**关键 Prompt**：

```
请对比 [竞品] 和 [目标平台] 在以下维度的差异：
1. API 设计风格
2. 集成复杂度
3. 错误处理机制
4. 开发者体验

输出：对比表格 + 设计建议
```

**本项目实际对比**：Stripe vs Worldpay

| 维度 | Stripe | Worldpay | 我们的设计 |
|------|--------|----------|-----------|
| API 风格 | RESTful, Stripe-style | RESTful, HATEOAS | 仿 Stripe |
| DDC 处理 | SDK 自动 | 手动 | Gateway 自动 |
| 3DS Challenge | SDK 自动弹出 modal | 手动处理 | Gateway 回调 |
| 集成代码量 | ~5 行 | ~50 行 | ~5 行（目标） |

---

## 第三步：梳理与验证 — 对抗式确保质量

### 3.1 业务流程梳理

**关键 Prompt**：

```
基于调研文档，请帮我：
1. 识别所有用户故事（User Stories）
2. 定义验收标准（Acceptance Criteria）
3. 绘制状态机
4. 标注分支流程和异常处理
```

**本项目用户故事**：

| ID | 用户故事 | 优先级 |
|----|---------|--------|
| US-01 | 接受卡支付（Happy Path） | P0 |
| US-02 | 3DS 安全认证 | P0 |
| US-03 | 保存卡信息用于后续扣款 | P1 |
| US-04 | 订阅/循环扣款（MIT） | P0 |
| US-05 | 退款 | P0 |
| US-06 | 对账 | P1 |
| US-07 | 子商户风控开关 | P1 |

### 3.2 实际 Prompt 样本：设计文档生成

> **场景 1：初始设计请求**
>
> **Prompt**：
> ```
> 基于前期的接口调研，我们需要重新讨论一下业务范围，确定一期MVP的范围。
> 
> 首先，我们第一期希望实现的最小功能集包括：
> - 卡支付
> - 3DS
> - FraudSight集成
> - Token支付及查询
> - 交易查询
> - 对账
> 
> 我方作为PayFac需要提供商户侧API来服务商户，子商户类型是电商。请以此设计一个支付网关，上游是worldpay，下游是商户。
> 
> 设计文档markdown保存在 /docs/design 下
> ```
>
> **产出**：`docs/design/payfac-payment-gateway-mvp-design.md` v1

---

> **场景 2：设计反馈与迭代**
>
> **Prompt**：
> ```
> 关于设计的反馈如下：
> 1. 能否使用API Key authentication
> 2. 3DS缺少前端流程
> 3. 需支持 MIT
> 4. 面向子商户API希望构建omni统一接口，支持card payment, token payment 等多种方式 + 风控 (fraud sight) + 动态3DS (通过参数控制是否发起3DS)
> 5. 风控 / Fraudsight 对子商户不可见，但可在后台通过开关override
> 5. 子商户API仿照Stripe 设计
> 6. Auth后默认自动Capture
> 7. 当前业务流程设计不需要包括表结构设计
> 8. 状态机需要更详细，包括Token、风控、3DS等前置流程
> 6. 如何集成worldpay 的 ddc？这一步应该在哪里？同时验证成功后，重定向路径是否应该为 Issuer -> PayFac Gateway -> Browser? Stripe 的实现是怎样的？
> ```
>
> **产出**：`docs/design/payfac-payment-gateway-mvp-design.md` v2（Stripe 风格重设计）

---

> **场景 3：深入技术细节**
>
> **Prompt**：
> ```
> 请详细对比3DS Stripe和我们的设计
> ```
>
> **产出**：设计文档 §11「Stripe vs. 我们的设计：3DS 全链路对比」

---

> **场景 4：技术方案讨论**
>
> **Prompt**：
> ```
> 仅讨论：但SDK加载时自动加载DDC就意味着100%获取DDC？会不会对前端用户体验产生影响？动态3DS的话，技术上是怎么实现自动加载的呢？
> ```
>
> **产出**：设计文档 §6.6「DDC 自动加载 vs 按需采集：设计权衡」
>
> **关键结论**：
> - 自动加载 DDC ≠ 100% 采集（是懒触发 + 时间窗口重叠）
> - Stripe 接受约 30% 的 DDC 调用浪费
> - 用户感知延迟从 ~5s 降到 ~0s（DDC 与用户输卡号并行）

### 3.2 对抗式审查（Adversarial Review）

**为什么要对抗式审查？**

```
普通审查：  "这个文档看起来不错"
对抗式审查："这个文档有 6 个一致性问题，3 个边界情况未覆盖"
```

**对抗式审查的 Prompt**：

```
请以对抗性审查者的身份，挑战这份文档：
1. 识别所有不一致的地方
2. 找出边界情况和异常处理的遗漏
3. 质疑设计决策的合理性
4. 列出所有 BLOCKED / ASSUMPTION 标记

输出格式：
- Critical Issues（必须修复）
- High Issues（强烈建议修复）
- Medium Issues（建议修复）
- Low Issues（可选修复）
```

**审查结果**：

```
docs(v3.2): fix all critical/high issues from adversarial review

修复内容：
1. PRD 和设计文档的术语不一致
2. 3DS 回调 URL 设计缺少 session_id
3. MIT 前置条件未明确说明
4. 错误码映射不完整
5. 状态机缺少内部状态定义
6. HATEOAS linkData 说明缺失
```

### 3.3 实际 Prompt 样本：对抗式审查

> **场景：使用 subagent 进行对抗性审查**
>
> **Prompt**：
> ```
> 请使用subagent，用mimo-v2.5-pro模型对设计文档进行adversarial review。请使用worldpay docs, stripe API，community素材，以及支付行业最佳实践进行交叉比对。
> ```
>
> **说明**：
> 1. 使用 subagent 并行审查，不阻塞主流程
> 2. 指定模型确保审查质量
> 3. 要求多个信息源交叉验证
>
> **产出**：发现并修复 6 个高优先级问题

### 3.3 一致性校验

**校验维度**：

| 维度 | 校验内容 | 工具/方法 |
|------|---------|----------|
| **术语一致性** | PRD 和设计文档使用相同术语 | 双代理审查 |
| **状态一致性** | 状态机定义 vs API 响应 | 交叉验证 |
| **字段一致性** | 请求字段 vs 响应字段 | 表格对比 |
| **流程一致性** | 流程图 vs 伪代码 | 逐步追踪 |

**本项目校验 Prompt**：

```
请对比 docs/prd/ 和 docs/design/ 两个文档：
1. 识别所有术语不一致的地方
2. 检查 API 字段定义是否匹配
3. 验证状态机定义是否一致
4. 列出所有需要修复的问题
```

### 3.4 验证产出清单

| 验证项 | 状态 | 证据 |
|--------|------|------|
| API 最小集覆盖业务需求 | ✅ | 研究文档 §一 |
| 状态机覆盖所有场景 | ✅ | 设计文档 §4 |
| 错误处理覆盖边界情况 | ✅ | PRD §6 |
| 3DS 流程完整 | ✅ | 设计文档 §6 |
| PRD 与设计文档一致 | ✅ | v1.3 修复 |

---

## 第四步：文档生成 — 从设计到可执行

### 4.1 PRD 生成技巧

**PRD 结构模板**：

```markdown
# [产品名称] PRD

## 1. 产品概述
- 一句话描述
- MVP 范围
- 核心 API 一览

## 2. 用户故事
- 每个故事包含：角色、需求、验收标准、优先级

## 3. API 参考
- 认证方式
- 端点定义
- 请求/响应示例
- 错误码

## 4. 核心业务流程
- 流程图
- 伪代码
- 分支流程

## 5. 错误处理
- 错误码映射
- 标准错误响应
- 重试策略

## 6. 开发检查清单
- 可执行的验收条件
```

**关键技巧**：

| 技巧 | 说明 | 示例 |
|------|------|------|
| **Omni 统一接口** | 一个端点处理多种场景 | `POST /v1/payment_intents` 支持 card/token/MIT |
| **参数控制行为** | 通过参数切换模式 | `three_d_secure.enabled: false` 跳过 3DS |
| **默认最优实践** | 默认值就是最佳选择 | `capture_method: "automatic"` 默认自动请款 |
| **示例驱动** | 每个端点都有完整示例 | 请求 JSON + 成功响应 + 失败响应 |

### 4.2 实际 Prompt 样本：PRD 生成

> **场景：基于设计文档生成 PRD**
>
> **Prompt**：
> ```
> 请以设计文档为基础，出一份PRD，要求是研发团队可直接参考进入开发。具体需要至少包含如下几个角度的内容：
> - 核心业务流程及分支流程
> - 接口的参考代码
> - 用户故事
> 
> 请保存到 docs/prd 文件夹下
> ```
>
> **关键点**：
> 1. 明确目标读者：「研发团队可直接参考进入开发」
> 2. 要求包含「参考代码」：不只是文档，要能直接用
> 3. 指定输出路径：避免 AI 随意放置文件
>
> **产出**：`docs/prd/payfac-payment-gateway-mvp-prd.md`

### 4.2 设计文档生成技巧

**设计文档结构模板**：

```markdown
# [产品名称] 架构设计

## 1. 架构总览
- 系统架构图
- 核心设计原则

## 2. 上游映射
- 功能 → 上游 API 对应关系
- 字段映射

## 3. API 设计
- 接口总览
- 请求/响应定义
- 状态机

## 4. 核心流程
- 时序图
- 伪代码
- 分支流程

## 5. 安全模型
- 认证层级
- 数据保护策略

## 6. 附录
- 速查表
- 测试环境
```

**关键技巧**：

| 技巧 | 说明 | 价值 |
|------|------|------|
| **对标竞品** | 详细对比 Stripe 的设计 | 学习最佳实践，识别差距 |
| **状态机可视化** | 用 ASCII 图绘制状态机 | 清晰展示状态流转 |
| **时序图** | 展示组件间交互 | 理解异步流程 |
| **伪代码** | 用代码描述业务逻辑 | 开发者可直接参考 |

### 4.3 迭代优化策略

**版本迭代节奏**：

```
v1 (初始版本)
  ↓ 用户反馈
v2 (重大调整，如 Stripe 风格重设计)
  ↓ 对抗性审查
v3 (补充细节，如 DDC 优化分析)
  ↓ 一致性校验
v3.2 (修复所有问题)
  ↓ 开发实现
```

**本项目迭代过程**：

| 版本 | 时间 | 变更原因 | 关键变更 |
|------|------|---------|---------|
| v1 | 16:14 | 初始设计 | 基础架构 |
| v2 | 16:30 | 用户要求 Stripe 风格 | API 重设计 |
| v3 | 16:55 | 补充 3DS 细节 | DDC 集成、Stripe 对比 |
| v3.1 | 17:12 | 性能优化需求 | DDC 并行分析 |
| v3.2 | 17:25 | 对抗性审查 | 修复所有问题 |

---

## 实战案例：本项目完整流程复盘

### 时间线

```
07:19 - 07:34  准备工作：安装 MCP（4 次尝试）
    ↓
07:38 - 08:00  调研阶段：梳理 API 最小集、生成研究文档
    ↓
16:14 - 17:25  梳理与验证：生成设计文档（6 个版本迭代）
    ↓
18:58 - 19:38  文档生成：生成 PRD（4 个版本迭代）
```

### 关键产出物

| 阶段 | 产出物 | 路径 |
|------|--------|------|
| 调研 | API 最小集研究文档 | `docs/research/worldpay-access-payfac-api-minimum-set.md` |
| 设计 | 架构设计文档 v3.2 | `docs/design/payfac-payment-gateway-mvp-design.md` |
| 设计 | PRD v1.3 | `docs/prd/payfac-payment-gateway-mvp-prd.md` |
| 验证 | 验证脚本 | `src/verify-card-payments.ts` |

### 效率对比

| 任务 | 传统方式 | AI 辅助方式 | 提升 |
|------|---------|------------|------|
| API 调研 | 2-3 天 | 20 分钟 | **90%** |
| 设计文档 | 3-5 天 | 1 小时 | **95%** |
| PRD 编写 | 2-3 天 | 40 分钟 | **95%** |
| 对抗性审查 | 1 天 | 10 分钟 | **95%** |

---

## 给产品同学的建议

### 1. 准备阶段

- **投资 MCP 安装**：10 分钟的安装，节省后续数小时的文档复制粘贴
- **选择合适的 Skills**：`grill-me`（对抗审查）、`to-issues`（转 Issues）是必备
- **建立文档模板**：标准化输出格式，提高可复用性

### 2. 调研阶段

- **先让 AI 自己调研**：给 AI 业务背景，让它先输出初稿
- **人工补充边界情况**：AI 可能遗漏公司的特殊需求
- **保存调研过程**：每个阶段的输出都是后续的输入

### 3. 验证阶段

- **必须做对抗性审查**：让 AI 扮演"挑战者"角色
- **双代理审查**：一个 AI 生成，另一个 AI 审查
- **一致性校验**：PRD 和设计文档必须术语一致

### 4. 文档生成

- **示例驱动**：每个 API 都要有完整的请求/响应示例
- **版本控制**：每次重大变更都要打版本号
- **可执行性**：文档要能直接指导开发，而不是"看起来不错"

---

## 附录：Prompt 模板库（含实际样本）

### A. 调研类 Prompt

**模板**：
```
我们是一家 [公司类型]，现在要 [业务目标]。

请帮我：
1. 梳理可跑通业务的 API 最小集
2. 构建完整的业务流程
3. 识别关键风险点和合规要求
4. 对比 [竞品] 的设计

输出格式：Markdown 文档，保存到 docs/research/
```

**实际样本**（本项目）：
```
我们是一家PayFac，现在要对接worldpay access平台。请帮我整理可以跑通业务的API最小集，并以此构建业务流程。
```

**输出物摘录**：
```markdown
# Worldpay Access — PayFac API 最小集 & 业务流程

## 一、API 最小集（9 个模块）

| # | API | 版本 | 用途 | 必须? |
|---|-----|------|------|-------|
| 1 | **Parties** | `2025-01-01` | 子商户入驻、KYC/KYB | ✅ 核心 |
| 2 | **Card Payments** | `7` | 卡收单（授权/请款/退款） | ✅ 核心 |
| 3 | **Tokens** | `3` | 卡号脱敏 token 化 | ✅ 强烈建议 |
| 4 | **3DS** | `2` | SCA 强客户认证 | ✅ 合规必需 |
| 5 | **Split Payments** | `2025-06-25` | 分账 | ✅ PayFac 核心 |
| 6 | **Account Payouts** | `2025-01-01` | 打款到子商户 | ✅ 核心 |
| 7 | **Balances** | `2025-01-01` | 查询余额 | ⚪ 运营必备 |
| 8 | **Statements** | `2025-01-01` | 对账单 | ⚪ 对账必备 |
| 9 | **Payment Queries** | `1` | 交易查询 | ⚪ 查单必备 |
```

---

### B. API 验证类 Prompt

**模板**：
```
我现在有测试环境的API KEY，请按照 [研究文档路径] 进行接口验证，确保API可以跑通。
接下来，请使用 [API1], [API2] 两个API接口，完成一个最小的 API 验证循环
```

**实际样本**（本项目）：
```
我现在有测试环境的API KEY，请按照这个文档进行接口验证，确保API可以跑通。
接下来，请使用Card Payments, Payment Queries 两个API接口，完成一个最小的 API 验证循环
```

**输出物摘录**：
```typescript
// src/verify-card-payments.ts

/**
 * 最小验证闭环:
 *   1. CIT 支付授权 (Card Payments v7)
 *   2. 按 transactionReference 查询支付
 *   3. 按日期范围查询支付列表
 *   4. 按 paymentId 查询单笔支付详情
 */

const TEST_CARD = {
  number: "4444333322221111",
  expiryMonth: 5,
  expiryYear: 2035,
  cvc: "123",
};

async function step1_citAuthorization() {
  console.log("\n📌 Step 1: CIT 支付授权");
  const payload = {
    transactionReference: generateRef("verify-cit"),
    merchant: { entity: CONFIG.entity },
    instruction: {
      value: { currency: "GBP", amount: 250 },
      paymentInstrument: {
        type: "card/plain",
        cardNumber: TEST_CARD.number,
      },
    },
    channel: "ecom",
  };
  // 调用 Worldpay API...
}
```

---

### C. 设计类 Prompt

**模板**：
```
基于 [研究文档路径]，请生成架构设计文档：

要求：
1. 采用 [设计风格，如 Stripe 风格] 的 API 设计
2. 定义完整的状态机
3. 包含时序图和伪代码
4. 对比 [竞品] 的设计差异

输出：docs/design/[产品名称]-design.md
```

**实际样本**（本项目 — 初始设计）：
```
基于前期的接口调研，我们需要重新讨论一下业务范围，确定一期MVP的范围。

首先，我们第一期希望实现的最小功能集包括：
- 卡支付
- 3DS
- FraudSight集成
- Token支付及查询
- 交易查询
- 对账

我方作为PayFac需要提供商户侧API来服务商户，子商户类型是电商。请以此设计一个支付网关，上游是worldpay，下游是商户。

设计文档markdown保存在 /docs/design 下
```

**输出物摘录**（架构图 + 核心设计原则）：
```markdown
## 1. 架构总览

┌──────────────────────────────────────────────────────────────────┐
│                    Sub-merchants (E-commerce)                     │
│              Frontend SDK / REST Client                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS / TLS 1.3
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PayFac Payment Gateway                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  API Layer (Stripe-compatible REST)                        │  │
│  │  PaymentIntents │ PaymentMethods │ Refunds │ Statements   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Payment Orchestrator │ 3DS │ FraudSight │ Tokenization   │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │            Worldpay Integration Adapters                   │  │
│  │  Card Payments v7 │ 3DS v2 │ FraudSight v1 │ Tokens v3   │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

### 核心设计原则

| 原则 | 说明 |
|------|------|
| **Omni 统一接口** | 单一 `PaymentIntent` 端点支持 card/token/MIT |
| **Stripe 风格** | 面向子商户的 API 模仿 Stripe 设计范式 |
| **透明增强** | Token 化、风控、3DS 对子商户透明 |
| **PCI 不落地** | 卡号即时 tokenize，明文不落盘 |
```

**实际样本**（本项目 — 设计反馈）：
```
关于设计的反馈如下：
1. 能否使用API Key authentication
2. 3DS缺少前端流程
3. 需支持 MIT
4. 面向子商户API希望构建omni统一接口，支持card payment, token payment 等多种方式 + 风控 (fraud sight) + 动态3DS (通过参数控制是否发起3DS)
5. 风控 / Fraudsight 对子商户不可见，但可在后台通过开关override
5. 子商户API仿照Stripe 设计
6. Auth后默认自动Capture
7. 当前业务流程设计不需要包括表结构设计
8. 状态机需要更详细，包括Token、风控、3DS等前置流程
6. 如何集成worldpay 的 ddc？这一步应该在哪里？同时验证成功后，重定向路径是否应该为 Issuer -> PayFac Gateway -> Browser? Stripe 的实现是怎样的？
```

**输出物摘录**（Omni 统一接口设计）：
```markdown
**Omni: 三种支付方式路径**：

┌─────────────────────────────────────────────────────────────┐
│                     Payment Intent                          │
│  ┌──────────────────────┐                                  │
│  │ type: "card"          │ → 网关即时 tokenize → 3DS → CIT  │
│  └──────────────────────┘                                  │
│  ┌──────────────────────┐                                  │
│  │ type: "card_token"    │ → 使用已有 token → 3DS → CIT     │
│  └──────────────────────┘                                  │
│  ┌──────────────────────┐                                  │
│  │ type: "card_token"    │ → MIT 模式 → 无 3DS → MIT 授权   │
│  │ + confirm: true       │   (需 setup_future_usage 前置)    │
│  └──────────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

---

### D. 深度技术讨论类 Prompt

**模板**：
```
仅讨论：[技术问题]？会不会对 [用户体验/性能/安全] 产生影响？[竞品] 的实现是怎样的？
```

**实际样本**（本项目 — DDC 优化讨论）：
```
仅讨论：但SDK加载时自动加载DDC就意味着100%获取DDC？会不会对前端用户体验产生影响？动态3DS的话，技术上是怎么实现自动加载的呢？
```

**说明**：「仅讨论」前缀告诉 AI 这是一个讨论性问题，不需要修改文档，只需要给出分析和结论。

**输出物摘录**（DDC 优化分析）：
```markdown
#### 6.6.1 自动加载 DDC = 100% 采集？

**不是。** Stripe 的做法是「懒触发 + 时间窗口重叠」：

用户进入 checkout 页面         Stripe.js 已加载，不跑 DDC
         │
用户 focus 卡号输入框          💡 触发 DDC 初始化
         │                    └─ 隐藏 iframe 开始运行
用户输入卡号                                    │
用户输入有效期  ────────── DDC 并行运行中 ──────│
         │                    └─ DDC 完成 (2-5s)
用户点击 "支付"               sessionId 已就绪 ✓

**关键数据**：

| 指标 | 数值 |
|------|------|
| 用户手动输完卡号 + 有效期 + CVC | ~10-15 秒 |
| DDC 采集耗时 | 2-5 秒 |
| 重叠窗口 | 100% 覆盖 |
```

---

### E. 对抗式审查类 Prompt

**模板**：
```
请使用subagent，用 [模型名] 对 [文档路径] 进行adversarial review。请使用 [信息源1], [信息源2]，[信息源3]，以及 [行业] 最佳实践进行交叉比对。
```

**实际样本**（本项目）：
```
请使用subagent，用mimo-v2.5-pro模型对设计文档进行adversarial review。请使用worldpay docs, stripe API，community素材，以及支付行业最佳实践进行交叉比对。
```

**关键点**：
1. 使用 subagent 并行审查，不阻塞主流程
2. 指定模型确保审查质量
3. 要求多个信息源交叉验证

**输出物摘录**（对抗性审查发现的问题）：
```markdown
## 修复内容

### Critical Issues (已修复)
1. **PRD 和设计文档术语不一致**
   - PRD 用 `payment_method.token`，设计文档用 `payment_method.card_token`
   - 统一为 `payment_method.type: "card_token"` + `payment_method.token: "pm_xxx"`

2. **3DS 回调 URL 缺少 session_id**
   - 原设计：`/v1/3ds/callback?pi_id=xxx`
   - 修复后：`/v1/3ds/callback?pi_id=xxx&session_id=yyy`

### High Issues (已修复)
3. **MIT 前置条件未明确说明**
   - 新增：CIT 必须传 `setup_future_usage: "off_session"`

4. **错误码映射不完整**
   - 新增 15 个 Worldpay 错误码 → Gateway 错误码映射

5. **状态机缺少内部状态定义**
   - 新增：TOKENIZING, RISK_ASSESSING, DDC_INITIALIZING 等

6. **HATEOAS linkData 说明缺失**
   - 新增 §2.1.1：解释 Worldpay 返回的 `_links` 对象
```

---

### F. PRD 生成类 Prompt

**模板**：
```
请以 [设计文档路径] 为基础，出一份PRD，要求是研发团队可直接参考进入开发。具体需要至少包含如下几个角度的内容：
- 核心业务流程及分支流程
- 接口的参考代码
- 用户故事

请保存到 [输出路径]
```

**实际样本**（本项目）：
```
请以设计文档为基础，出一份PRD，要求是研发团队可直接参考进入开发。具体需要至少包含如下几个角度的内容：
- 核心业务流程及分支流程
- 接口的参考代码
- 用户故事

请保存到 docs/prd 文件夹下
```

**输出物摘录**（用户故事 + API 示例）：
```markdown
# PayFac Payment Gateway — 一期 MVP PRD

## 2. 用户故事

#### US-01: 接受卡支付 (Happy Path)

> **As a** 电商开发者  
> **I want to** 用一行 API 调用完成卡支付  
> **So that** 用户可以在我网站上用信用卡付款

**Acceptance Criteria**:
- [ ] `POST /v1/payment_intents` 传入金额、币种、卡号、`confirm: true`
- [ ] 返回 `status: "succeeded"`
- [ ] 银行卡扣款成功
- [ ] 整个流程不超过 6 秒

**优先级**: P0

---

## 3. API 参考

**请求 — 直接传卡号**:
```json
{
  "amount": 250,
  "currency": "gbp",
  "payment_method": {
    "type": "card",
    "card": {
      "number": "4444333322221111",
      "expiry_month": 5, "expiry_year": 2035,
      "cvc": "123"
    }
  },
  "confirm": true,
  "three_d_secure": { "enabled": true }
}
```

**响应 — 成功**:
```json
{
  "id": "pi_K1a2b3c4d5e6",
  "status": "succeeded",
  "amount": 250,
  "currency": "gbp",
  "three_d_secure": { "status": "authenticated" },
  "payment_method_details": {
    "card": { "brand": "visa", "last4": "1111" }
  }
}
```
```

---

**文档维护者**：MiMo AI Assistant  
**最后更新**：2026-05-29
