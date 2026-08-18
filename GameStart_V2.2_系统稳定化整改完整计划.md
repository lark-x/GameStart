# GameStart V2.2 系统稳定化整改完整计划

> 文档定位：V2.2 System Stabilization / 主线整合前最终整改方案  
> 目标范围：完成当前累计开发分支中尚未闭环的问题，并将 Vision、Durable Maintenance、Long-Term Memory、Summary、500 Turn Stability、Chat-first UX、Diagnostics 可靠整合进 `main`  
> 核心原则：**先稳定长期运行能力，再进入 Story Analyzer / Canon / Graph 阶段**  
> 
> **当前项目实施进度快照（持续更新）**：
> - [x] **第一阶段（Phase 1: PR A ~ PR C）**：消息分页闭环、真实 Model Profile 绑定（Context Window / Modalities）、Multimodal Vision 生产级打通。
> - [x] **第二阶段（Phase 2: PR D ~ PR G）**：Durable Maintenance Jobs 范围语义重构、Worker 原子 Claim / Lease / 指数退避重试 / 独立维护分发泵、记忆溯源子集校验与 Consolidation 管道、会话摘要增量范围覆盖与超长保护。
> - [ ] **第三阶段（Phase 3: PR H ~ PR J）**：500 Turn 系统级 E2E 与长期稳定性测试、Chat 历史分页上拉加载与上下文 Diagnostics、主线最终收敛整合与发布门禁。

---

# 1. 总体目标

当前 GameStart 已经具备以下核心链路：

```text
Persona
→ Instant Story
→ Conversation
→ Chat
→ Prompt Engine
→ Streaming LLM
→ SQLite Message
```

并且累计功能分支中已经出现：

```text
Real Vision Pipeline
Durable Maintenance Jobs
Memory Extraction
Memory Consolidation Prompt / Parser
Conversation Summary Worker
500 Turn Context Test
Chat-first UX
Memory / Summary Diagnostics
```

当前阶段不再扩展 Story Analyzer、Canon 自动提取、Graph、Timeline 等能力。

本阶段唯一目标是：

> 把现有模块从“代码存在”提升到“长期运行可靠、数据语义正确、真实配置可用、任务失败可恢复、整合进 main 后可持续演进”。

最终必须能够稳定支持：

```text
Fresh DB
→ Persona
→ AI Opening
→ Text Chat
→ Image Chat
→ Stop / Retry
→ 100+ Turns
→ Memory Extraction
→ Summary
→ Restart
→ Continue
→ Redis / Provider 临时异常
→ 自动恢复
→ 500 Turns
→ Context 始终有界
→ 早期长期事实仍可回忆
```

---

# 2. 当前必须解决的问题清单

## P0：阻止 V2.2 整合完成

1. 消息分页会丢掉每页最新边界消息
2. Model Profile 缺少 `contextWindow`
3. Model Profile 缺少 `inputModalities`
4. 生产模型被硬编码为 `text-only`，导致真实 Vision 不可用
5. Prompt Build 与真实模型配置顺序错误
6. Prompt Budget 没完全计入 World 等实际系统内容
7. Durable Maintenance Job 没有真正处理“固定消息范围”
8. Summary Job 在 Worker 延迟时会重复排队
9. Maintenance Job 没有可靠 Claim / Lease
10. Maintenance Job 失败后不会 Retry
11. Memory / Summary Worker 可能重复消费同一任务
12. 最终功能链尚未正式整合进 `main`

## P1：长期运行必须完善

13. Maintenance Worker 与 Generation Pump 串行阻塞
14. Memory `sourceMessageIds` 没验证真实来源
15. Memory Consolidation 没有 Worker / Job 闭环
16. Memory Dedup 仍只有完全字符串一致判断
17. 500 Turn 测试不是系统级 E2E
18. 未验证 API Restart / Worker Restart
19. 未验证 Redis Offline / Recovery
20. Chat UI 尚未实现历史上拉分页
21. Vision 错误码可能退化为 `INTERNAL_ERROR`
22. Prompt / Memory / Model Trace Diagnostics 不完整

## P2：体验和可维护性

23. Start 页面还可继续简化
24. Chat Shell 与 Workspace Shell 可进一步解耦
25. Recent Story 首页尚可优化
26. Maintenance / Memory / Summary 缺少开发期可视化状态

---

# 3. 建议开发顺序

严格按以下顺序执行：

```text
[已完成] PR A  Pagination + Model Runtime Foundation
↓
[已完成] PR B  Prompt / Real Model Binding
↓
[已完成] PR C  Production Vision Finalization
↓
[已完成] PR D  Durable Maintenance Correctness
↓
[已完成] PR E  Maintenance Retry / Lease / Isolation
↓
[已完成] PR F  Memory Provenance + Consolidation
↓
[已完成] PR G  Summary Range Correctness
↓
[待执行] PR H  500 Turn System E2E
↓
[待执行] PR I  Chat History Pagination + Diagnostics
↓
[待执行] PR J  Final Integration → main
```

不得跳过 Durable Maintenance Correctness 直接做 Story Analyzer。

---

# 4. PR A：消息分页与模型配置基础

建议分支：

```text
fix/v2-pagination-and-model-profile
```

建议标题：

```text
fix: finalize v2 pagination and model profile metadata
```

---

# 5. 修复消息分页丢最新消息

## 5.1 当前问题

当前逻辑类似：

```ts
const rows = await listRecentByConversation(
  conversationId,
  limit + 1,
);

const hasMore = rows.length > limit;
const pageRows = rows.slice(0, limit);
```

如果 `rows` 已经按时间正序返回：

```text
450 ... 500
```

那么：

```text
slice(0, 50)
→ 450 ... 499
```

导致最新消息 `500` 丢失。

---

## 5.2 正确逻辑

对于“多取一条判断 hasMore”的模式，应删除最旧的 extra row：

```ts
const hasMore = rows.length > limit;

const pageRows = hasMore
  ? rows.slice(rows.length - limit)
  : rows;
```

或者明确：

```ts
const pageRows = hasMore
  ? rows.slice(1)
  : rows;
```

前提是 Repository 保证返回的是：

```text
旧 → 新
```

推荐使用第一种，语义更清晰。

---

## 5.3 `beforeMessageId` 分页语义

接口：

```http
GET /api/v2/chat/conversations/:id/messages
  ?beforeMessageId=<id>
  &limit=50
```

定义：

```text
beforeMessageId 本身不包含在结果中
返回该 Message 之前最近的 N 条
结果按时间正序返回
```

---

## 5.4 分页测试

必须加入：

```text
数据库 500 条消息

第一页 limit=50
→ 451～500
hasMore=true
nextBeforeMessageId=451

第二页 before=451
→ 401～450

直到：
1～50
hasMore=false
```

还要验证：

```text
任意消息不重复
任意消息不丢失
```

建议测试辅助：

```ts
const seen = new Set();
```

分页遍历 500 条后：

```ts
assert.equal(seen.size, 500);
```

---

# 6. Model Profile 增加 `contextWindow`

## 6.1 Contract

增加：

```ts
export interface V2ModelProfileDto {
  ...
  readonly contextWindow: number;
}
```

Stored Profile 同步增加：

```ts
readonly contextWindow: number;
```

Save Request：

```ts
readonly contextWindow?: number;
```

---

## 6.2 默认值

第一版不要通过模型名称猜测。

默认：

```text
contextWindow = 8192
```

UI 应允许用户编辑。

原因：

```text
模型名称映射变化快
第三方 OpenAI-compatible 模型无法可靠推断
代理平台模型命名可能被重写
```

---

## 6.3 数据库 Migration

建议：

```text
0330_v2_model_profile_runtime_metadata
```

字段：

```sql
ALTER TABLE v2_model_profiles
ADD COLUMN context_window INTEGER NOT NULL DEFAULT 8192;
```

校验：

```text
>= 1024
<= 2_000_000
```

上限只作为输入保护，不代表产品保证支持。

---

# 7. Model Profile 增加 `inputModalities`

## 7.1 Contract

```ts
export type V2ModelInputModality =
  | "text"
  | "image";

export interface V2ModelProfileDto {
  ...
  readonly inputModalities: readonly V2ModelInputModality[];
}
```

---

## 7.2 数据库存储

第一版可保存：

```text
input_modalities_json
```

例如：

```json
["text", "image"]
```

Migration 默认：

```json
["text"]
```

---

## 7.3 设置页

模型编辑页增加：

```text
输入能力
☑ 文本
☐ 图片
```

Text 必须始终开启。

Image 可选。

---

## 7.4 不允许根据协议推断

错误：

```text
OpenAI-compatible
→ assume Vision
```

因为大量 OpenAI-compatible 模型不支持图片。

正确：

```text
Profile 明确配置
```

未来模型发现接口可以辅助填充，但 Profile 仍是事实源。

---

# 8. PR A 验收标准

```text
[x] 500 Message 分页不丢消息
[x] beforeMessageId 语义固定
[x] Model Profile 有 contextWindow
[x] Model Profile 有 inputModalities
[x] Migration 可从旧 DB 升级
[x] Settings 可以保存/读取这些字段
[x] typecheck 通过
[x] unit test 通过
[x] verify:fast 通过
```

---

# 9. PR B：Prompt Engine 与真实 Model Runtime 绑定

建议分支：

```text
refactor/v2-prompt-model-binding
```

标题：

```text
refactor: bind v2 prompt budgeting to resolved chat model
```

---

# 10. 调整 `/replies` 的执行顺序

## 10.1 当前错误顺序

```text
prepareReply()
↓
固定 4096 Prompt Budget
↓
resolveModel()
↓
provider.stream()
```

Prompt Engine 不知道真实模型的：

```text
contextWindow
maxTokens
inputModalities
```

---

## 10.2 正确顺序

改成：

```text
POST /replies
↓
Resolve Model
↓
得到
  model
  contextWindow
  maxTokens
  temperature
  modalities
↓
prepareReply(modelRuntime)
↓
Prompt Engine
↓
Vision Capability Check
↓
Provider
```

---

# 11. 新增 `V2PromptRuntimeBudget`

```ts
export interface V2PromptRuntimeBudget {
  readonly contextWindow: number;
  readonly outputReserve: number;
  readonly safetyReserve: number;
}
```

`prepareReply()` 接收：

```ts
prepareReply(
  conversationId,
  input,
  runtimeBudget,
)
```

---

# 12. `outputReserve`

推荐：

```text
outputReserve = model.maxTokens
```

但增加最大保护：

```text
outputReserve <= contextWindow * 0.5
```

如果用户配置：

```text
contextWindow = 4096
maxTokens = 10000
```

不能得到负 input budget。

直接报：

```text
MODEL_CONFIGURATION_INVALID
```

---

# 13. Safety Reserve

建议：

```text
min 256
或
contextWindow * 0.03
```

可实现：

```ts
Math.max(
  256,
  Math.floor(contextWindow * 0.03),
)
```

不要超过：

```text
2048
```

第一版可简单固定 256。

---

# 14. 修复 World Token 漏算

Prompt Selection 当前必须明确把以下内容都计入：

```text
Platform Rules
Persona
World
Current Input
```

不要在 Selection 完成后再把 World 塞进 System Message。

---

## 14.1 Required Context

建议定义：

```text
Platform Rules
Persona
Current Input
```

World 不一定完全 Required。

更合理：

```text
World Name 必须保留
World Summary 可裁剪/降级
```

例如：

```text
World Core
= world.name

World Detail
= world.summary
```

---

# 15. Prompt Final Guard

无论 Selection Algorithm 多正确，最终都必须再次校验：

```ts
if (estimatedTokens > inputBudget) {
  throw new PromptBudgetExceededError(...);
}
```

这是一道最终安全门。

---

# 16. Budget Test Matrix

必须覆盖：

### Case A

```text
8K context
1K output
→ input <= 6.7K
```

### Case B

```text
4K context
4K output
→ 配置非法
```

### Case C

```text
Persona 超长
→ PROMPT_BUDGET_EXCEEDED
```

### Case D

```text
World Summary 超长
→ 不得突破 budget
```

### Case E

```text
Memory 超长
→ Memory 被裁剪
```

### Case F

```text
History 超长
→ 只保留最近 Turn
```

### Case G

```text
任何 PreparedPrompt
estimatedTokens <= inputBudget
```

---

# 17. PR B 验收

```text
[x] Prompt 使用真实 contextWindow
[x] Prompt 使用真实 maxTokens
[x] World 已计费
[x] 最终 Hard Guard 存在
[x] 低 Context 模型不会静默溢出
[x] 高 Context 模型不会被固定 4096 浪费
[x] Prompt Tests 全绿
```

---

# 18. PR C：生产 Vision 完成

建议分支：

```text
fix/v2-production-vision
```

标题：

```text
fix: enable multimodal chat for configured vision models
```

---

# 19. 修复真实模型始终 text-only

Model Resolver 必须：

```ts
inputModalities:
  profile.inputModalities
```

不能：

```ts
["text"]
```

环境变量 fallback 如果没有显式配置：

```text
默认 text-only
```

可新增：

```text
V2_CHAT_INPUT_MODALITIES=text,image
```

但环境变量只作为 fallback。

---

# 20. `VISION_NOT_SUPPORTED` 标准错误

不要：

```ts
throw new Error("VISION_NOT_SUPPORTED")
```

改成业务错误：

```ts
throw new V2HttpError(
  422,
  "VISION_NOT_SUPPORTED",
  "当前模型不支持图片输入",
);
```

同时标准化：

```text
INVALID_MEDIA_REF
MEDIA_NOT_FOUND
MEDIA_READ_FAILED
VISION_NOT_SUPPORTED
MODEL_CAPABILITY_MISMATCH
```

---

# 21. Vision 真实配置 Integration Test

不能只用：

```text
chatProvider injected fake
```

还要测试：

```text
SQLite Model Profile
inputModalities=[text,image]
↓
CHAT Binding
↓
Runtime Resolver
↓
API
↓
Provider Request
```

Fake HTTP Provider Server 捕获最终请求即可，不需要真实外网 API。

---

# 22. Vision 测试 Case

### Vision Profile

```text
inputModalities=[text,image]
→ 图片成功进入 Provider
```

### Text-only Profile

```text
inputModalities=[text]
→ 422 VISION_NOT_SUPPORTED
```

### Image Missing

```text
media record 有
文件被删除
→ MEDIA_NOT_FOUND
```

### Invalid Ref

```text
../../etc/passwd
→ INVALID_MEDIA_REF
```

---

# 23. PR C 验收

```text
[x] 实际 Model Profile Vision 可用
[x] Text-only 模型错误明确
[x] 图片真实进入 Provider
[x] 不依赖 fake injection 才能 Vision
[x] OpenAI-compatible 通过
[x] Anthropic 通过
```

---

# 24. PR D：Durable Maintenance Job 语义正确化

建议分支：

```text
fix/v2-maintenance-job-ranges
```

标题：

```text
fix: make chat maintenance jobs process stable message ranges
```

---

# 25. 核心问题

当前 Job 创建时虽然保存：

```text
coveredMessageId
coveredMessageCount
```

但 Worker 执行时重新读取：

```text
latest 16
latest 30
```

这会让任务语义随时间漂移。

Durable Job 必须满足：

> 一个 Job 在创建那一刻，它负责的数据范围就必须固定。

---

# 26. Job Payload 重设计

推荐：

```ts
interface MemoryExtractionJobPayload {
  readonly fromMessageId?: V2MessageId;
  readonly toMessageId: V2MessageId;
  readonly sourceMessageIds: readonly V2MessageId[];
}
```

Summary：

```ts
interface ConversationSummaryJobPayload {
  readonly previousCoveredUntilMessageId?: V2MessageId;
  readonly fromMessageId: V2MessageId;
  readonly toMessageId: V2MessageId;
  readonly sourceMessageIds: readonly V2MessageId[];
}
```

---

# 27. 为什么建议直接保存 `sourceMessageIds`

相比只保存：

```text
messageCount
```

保存 Message IDs 更稳定：

```text
不受后续插入影响
不依赖时间戳边界
不依赖 created_at 精度
可验证 provenance
```

Payload 体积很小：

```text
Memory 8～16 IDs
Summary 20～30 IDs
```

完全可接受。

---

# 28. 创建 Memory Job

每 4 User Turns：

```text
找到自上次 Memory Extract 后的新消息
↓
选定 sourceMessageIds
↓
写 Job
```

最简单第一版：

```text
最近 8 条消息
```

但必须在创建 Job 时就固定 ID 列表。

---

# 29. Memory Worker

禁止：

```ts
listRecentByConversation(..., 16)
```

改成：

```ts
messages.listByIds(
  job.payload.sourceMessageIds
)
```

并恢复原始顺序。

---

# 30. Summary Job

Summary 应处理：

```text
Previous Summary
+
固定的下一段消息
```

Job 创建时确定：

```text
31～60
```

那么即使 Worker 在 500 条消息以后才执行，它依然总结：

```text
31～60
```

---

# 31. Summary Job 单例 / Range 去重

推荐 dedupe：

```text
conversation_summary:
<conversationId>:
<fromMessageId>:
<toMessageId>
```

不要使用：

```text
当前 Assistant Message ID
```

作为唯一 range 标识。

---

# 32. 防止 Summary 重复排队

创建新 Summary Job 前：

```text
检查当前 conversation 是否存在
pending / claimed / running
conversation_summary job
```

如果存在：

```text
不创建新 Job
```

只有上一个 Summary Job：

```text
succeeded
```

并更新 Summary coverage 后，才允许创建下一段。

---

# 33. Summary Coverage 状态

以：

```text
summary.coveredUntilMessageId
```

作为事实源。

新 Job：

```text
from = after coveredUntil
```

不要依赖：

```text
sourceMessageCount
```

单独决定范围。

`sourceMessageCount` 可保留用于 Metrics。

---

# 34. PR D 测试

### Delayed Memory

```text
Turn 4 创建 Job
↓
继续到 Turn 40
↓
再执行 Job
↓
必须仍提取 Turn 1～4/固定范围
```

### Delayed Summary

```text
Message 30 创建 Summary Job
↓
继续到 100
↓
执行 Job
↓
必须处理原来的固定 30 条
```

### No Duplicate Summary

```text
Worker 停止
继续聊天 100 条
↓
同一 Conversation 同时最多 1 个 active summary job
```

---

# 35. PR D 验收

```text
[x] Job Range 创建后不可漂移
[x] Memory 使用 Job Source IDs
[x] Summary 使用 Job Source IDs
[x] Summary 不重复排队
[x] Worker 延迟不丢历史信息
```

---

# 36. PR E：Claim / Lease / Retry / Pump 隔离

建议分支：

```text
feat/v2-maintenance-reliability
```

标题：

```text
feat: add reliable maintenance claiming retries and isolated pumps
```

---

# 37. 数据库新增 Lease

Migration：

```text
0340_v2_chat_maintenance_reliability
```

增加：

```sql
lease_expires_at TEXT,
claimed_by TEXT
```

可选：

```sql
last_started_at TEXT
```

---

# 38. Claim 原子化

不要：

```text
listPending()
↓
process()
```

改成 Repository：

```ts
claimNext({
  workerId,
  now,
  leaseMs,
  jobTypes,
})
```

SQLite 中使用 Transaction：

```text
SELECT pending candidate
↓
UPDATE status=claimed
WHERE status=pending
↓
返回 claimed row
```

---

# 39. Lease 过期恢复

如果 Worker 崩溃：

```text
status = claimed
lease_expires_at < now
```

则允许：

```text
requeue / reclaim
```

---

# 40. Job 状态简化

当前有：

```text
pending
claimed
running
succeeded
failed
cancelled
```

第一版可以保持。

建议实际路径：

```text
pending
→ claimed
→ running
→ succeeded
```

失败：

```text
running
→ pending (retryable)
或
→ failed (terminal)
```

---

# 41. Retry 策略

Retryable：

```text
Provider timeout
429
5xx
Network error
Temporary Redis / IO
```

Non-retryable：

```text
Invalid JSON after max repair
Invalid job payload
Conversation not found
Message IDs invalid
Configuration missing
```

---

# 42. Backoff

建议：

```text
attempt 1 → 10 秒
attempt 2 → 30 秒
attempt 3 → 2 分钟
attempt 4 → 10 分钟
attempt 5 → terminal failed
```

实现：

```ts
const delays = [
  10_000,
  30_000,
  120_000,
  600_000,
];
```

---

# 43. Maintenance 独立 Pump

当前不要：

```text
Generation Pump
→ Memory LLM × N
→ Summary LLM × N
→ 下一次 Generation Pump
```

改成三个独立 loop：

```text
Generation Dispatch Loop
Memory Maintenance Loop
Summary Maintenance Loop
```

---

# 44. 简单实现

```ts
setInterval(
  () => generationTick(),
  generationTickMs,
);

setInterval(
  () => memoryTick(),
  maintenanceTickMs,
);

setInterval(
  () => summaryTick(),
  maintenanceTickMs,
);
```

加运行锁：

```ts
let memoryRunning = false;
```

防止 interval 重叠。

---

# 45. 不要求立刻 BullMQ 化 Maintenance

当前 SQLite Maintenance Jobs 已经存在。

本阶段优先：

```text
SQLite Durable Job
+
Worker Polling
```

做到稳定。

以后如果量大：

```text
SQLite Outbox
→ BullMQ
```

再升级。

---

# 46. Redis 关系

Memory / Summary Maintenance：

```text
第一版完全可以不依赖 Redis
```

这样更符合：

```text
Chat 不依赖 Redis
Maintenance 可自行恢复
```

Generation / Asset 继续使用 Redis。

---

# 47. PR E 测试

### Multi Worker

```text
Worker A
Worker B
同时 claim
↓
同一 Job 只有一个成功
```

### Crash Recovery

```text
A claim
↓
不 complete
↓
lease expire
↓
B reclaim
```

### Retry

```text
Provider 429
↓
pending + attempts=1
availableAt future
↓
下一次成功
```

### Terminal Fail

```text
Invalid payload
→ failed
```

---

# 48. PR E 验收

```text
[x] 多 Worker 不重复消费
[x] Worker Crash 可恢复
[x] Retry 生效
[x] Backoff 生效
[x] Generation 不被 Memory 阻塞
[x] Summary 不阻塞 Memory
```

---

# 49. PR F：Memory Provenance + Consolidation 闭环

建议分支：

```text
feat/v2-memory-consolidation-worker
```

标题：

```text
feat: validate memory provenance and complete consolidation pipeline
```

---

# 50. 验证 `sourceMessageIds`

Extraction Prompt 中要求 LLM 返回：

```text
sourceMessageIds
```

但不能信任模型。

Worker 必须：

```ts
const allowedSourceIds = new Set(
  sourceMessages.map(m => m.messageId)
);
```

每个 Candidate：

```text
sourceMessageIds
必须全部属于 allowedSourceIds
```

---

## 50.1 Invalid Candidate

推荐：

```text
丢弃当前 Candidate
记录 Validation Warning
```

不要因为一个 Candidate 错误就丢弃整个 Job 的所有正确记忆。

但 JSON 结构本身非法：

```text
整个 Job fail
```

---

# 51. Memory Normalize

加入基础 Normalize：

```text
trim
统一中文/英文空格
去除重复末尾标点
Unicode normalize NFKC
```

生成：

```text
normalizedContent
```

用于 Exact Dedup。

---

# 52. Exact Dedup

如果：

```text
normalizedContent 完全一致
```

则：

```text
不创建新 Memory
更新 existing.updatedAt
可提升 confidence
合并 sourceMessageIds
```

---

# 53. Candidate Similar Search

新 Memory Candidate：

```text
FTS Search Top 5
```

如果没有明显候选：

```text
直接 create
```

有候选：

```text
进入 Consolidation
```

---

# 54. Memory Consolidation Job

新增：

```text
memory_consolidate
```

Payload：

```ts
{
  existingMemoryId,
  candidate: {
    kind,
    content,
    importance,
    confidence,
    sourceMessageIds,
  }
}
```

---

# 55. Consolidation Worker

执行：

```text
existing Memory
+
candidate
↓
memory.consolidate.v1
↓
keep_both / merge / supersede / ignore
```

---

# 56. Action 语义

## keep_both

```text
现有保留
新建 Candidate Memory
```

## ignore

```text
不创建新 Memory
```

## merge

```text
创建 consolidated Memory
旧 Memory → superseded
```

## supersede

```text
新 Memory active
旧 Memory superseded
new.supersedesMemoryId = old.id
```

---

# 57. 事务

Merge / Supersede 必须同一个 SQLite Transaction：

```text
create new
↓
update old status
```

否则 Worker Crash 可能产生两个 active 冲突 Memory。

---

# 58. Memory Importance / Confidence

Merge：

```text
importance = max(old, new)
confidence = consolidation result
```

Supersede：

```text
使用新 Candidate confidence
```

---

# 59. Memory Tests

### Exact Same

```text
用户喜欢咖啡
用户喜欢咖啡
→ 1 memory
```

### Rephrase

```text
用户喜欢咖啡
用户平时爱喝咖啡
→ merge 或 ignore
```

### Contradiction

```text
用户喜欢咖啡
用户现在戒咖啡
→ old superseded
```

### Both Valid

```text
用户喜欢咖啡
用户喜欢茶
→ keep both
```

### Invalid Source IDs

```text
LLM 返回不存在 Message ID
→ Candidate rejected
```

---

# 60. PR F 验收

```text
[x] sourceMessageIds 可追溯
[x] Exact Dedup
[x] Similar Candidate 进入 Consolidation
[x] merge 可执行
[x] supersede 可执行
[x] keep_both 可执行
[x] ignore 可执行
[x] Transaction 安全
```

---

# 61. PR G：Conversation Summary 正确化

建议分支：

```text
fix/v2-conversation-summary-ranges
```

标题：

```text
fix: make conversation summaries incremental and range-safe
```

---

# 62. Summary 必须增量覆盖

正确：

```text
Summary V1 covers 1～30
↓
Summary V2 = V1 + 31～60
↓
Summary V3 = V2 + 61～90
```

错误：

```text
每次都 summarize latest 30
```

---

# 63. Summary Worker 输入

从 Job Payload 读取：

```text
sourceMessageIds
```

并读取 Previous Summary。

---

# 64. Summary Job 成功后

保存：

```text
coveredUntilMessageId = payload.toMessageId
sourceMessageCount = previous + currentRangeCount
version = previous.version + 1
```

---

# 65. Out-of-order Job Protection

如果 Worker 拿到：

```text
Summary Job B
```

但当前 Summary 尚未覆盖 Job B 的 expected previous boundary：

```text
不要执行
```

可：

```text
requeue
```

因为 Summary Job 必须顺序执行。

---

# 66. Summary 内容约束

Prompt 输出：

```text
500～1200 中文字符
```

必须保留：

```text
当前场景
重大事件
角色关系变化
未解决冲突
当前目标
重要角色状态
```

避免：

```text
原文搬运
寒暄
大量重复长期 Memory
```

---

# 67. Summary 长度防护

Worker 保存前：

```text
trim
```

如果：

```text
< 50 chars
```

可视为 suspicious，重试一次。

如果：

```text
> 5000 chars
```

拒绝。

---

# 68. Summary Tests

### 90 Messages

```text
Job 1 = 1～30
Job 2 = 31～60
Job 3 = 61～90
```

最终：

```text
coveredUntil = 90
version = 3
```

### Delayed Worker

创建 Job 后继续产生消息，执行范围不变。

### Restart

Worker 重启后继续下一段。

---

# 69. PR G 验收

```text
[x] Summary 不漏消息
[x] Summary 不重复覆盖同一段
[x] Summary 严格顺序
[x] Worker 延迟无影响
[x] Restart 可继续
```

---

# 70. PR H：500 Turn 系统级 E2E

建议分支：

```text
test/v2-long-running-system
```

标题：

```text
test: validate long-running v2 chat system continuity
```

---

# 71. 当前 500 Turn 测试的不足

当前测试证明：

```text
1000 Messages
→ Context Bounded
→ Existing Memory Retrieval
```

但未证明：

```text
Memory 自动提取
Summary 自动生成
Worker 重启
API 重启
Retry
Redis 故障
```

---

# 72. 新 System E2E 目标

用真实：

```text
SQLite
API Runtime
Worker Logic
Fake LLM Provider
```

执行完整系统链路。

不依赖真实外网模型。

---

# 73. Fake LLM Provider

根据 Prompt Task 返回确定输出：

```text
chat.reply
→ deterministic text

memory.extract
→ deterministic JSON

memory.consolidate
→ deterministic JSON

conversation.summary
→ deterministic summary
```

---

# 74. 500 Turn Scenario

### Turn 1

Persona 建立。

### Turn 10

用户：

```text
我的生日是 3 月 12 日。
```

不得手工插 Memory。

必须通过：

```text
Memory Job
→ Worker
→ Extraction
```

产生 Memory。

---

### Turn 80

触发多个 Summary。

验证：

```text
summary.version > 1
```

---

### Turn 150

停止 Worker。

继续：

```text
50 Turns
```

要求：

```text
Chat 仍工作
Maintenance Jobs pending
```

---

### Turn 200

重新启动 Worker。

要求：

```text
Pending Jobs 恢复
```

---

### Turn 250

关闭 API，重新打开同一 SQLite。

要求：

```text
Conversation / Message / Memory / Summary 全部恢复
```

---

### Turn 300

模拟 Memory Provider 第一次 429。

要求：

```text
Job retry
后续成功
```

---

### Turn 400

写入新的偏好：

```text
我现在不喝咖啡了。
```

触发 Memory Consolidation。

---

### Turn 500

用户：

```text
你还记得我的生日吗？
```

Prompt Source 必须包含：

```text
birthday Memory
```

---

# 75. Context Stability 断言

每 50 Turn：

```text
estimatedTokens <= inputBudget
```

同时记录：

```text
recentMessageCount
memoryCount
summaryVersion
estimatedTokens
```

---

# 76. 期望 Token 曲线

不要求完全恒定，但不能线性增长：

```text
Turn 50  ~ 3K
Turn 100 ~ 4K
Turn 250 ~ 4K
Turn 500 ~ 4K
```

在同一 Model Context 下：

```text
始终 <= budget
```

---

# 77. Redis Fault Test

如果 Maintenance 不依赖 Redis：

```text
Redis down
```

必须不影响：

```text
Chat
Memory
Summary
```

只影响：

```text
Scene / Asset Queue
```

这更符合架构目标。

---

# 78. PR H 验收

```text
[ ] 500 Turns
[ ] 1000 Messages
[ ] Memory 自动生成
[ ] Summary 自动生成
[ ] Consolidation 可运行
[ ] Worker Restart
[ ] API Restart
[ ] Retry
[ ] Context Bounded
[ ] Long-term Recall
```

---

# 79. PR I：Chat 历史分页与 Diagnostics

建议分支：

```text
feat/v2-chat-history-diagnostics
```

标题：

```text
feat: add chat history pagination and context diagnostics
```

---

# 80. Chat UI 上拉加载历史

首次：

```text
GET limit=50
```

得到：

```text
messages
hasMore
nextBeforeMessageId
```

---

# 81. 上拉加载

当：

```text
scrollTop < 120px
```

请求：

```text
beforeMessageId=nextBeforeMessageId
```

---

# 82. Scroll Position 保持

加载前：

```ts
oldScrollHeight
oldScrollTop
```

prepend 后：

```ts
newScrollTop =
  oldScrollTop
  + (newScrollHeight - oldScrollHeight)
```

防止页面跳动。

---

# 83. 请求去重

状态：

```text
loadingOlder
```

防止滚动事件并发发送多个 history 请求。

---

# 84. Diagnostics 数据结构

增加：

```ts
interface V2ChatTraceDto {
  traceId;
  conversationId;
  messageId?;

  task;
  templateId;
  templateVersion;
  contextHash;

  model;
  profileId?;

  contextWindow;
  inputBudget;
  estimatedTokens;

  recentMessageCount;
  memoryIds;
  canonIds;
  summaryVersion?;
  imageCount;

  startedAt;
  firstTokenLatencyMs?;
  totalLatencyMs?;

  status;
  errorCode?;
}
```

---

# 85. 不记录完整 Prompt

默认 Diagnostics 不保存：

```text
完整 Persona
完整 Memory 内容
完整 Message 内容
图片 Base64
API Key
```

只保存 ID / 计数 / Token / Hash。

---

# 86. 开发期 Context Inspector

可以提供：

```text
GET /api/v2/chat/conversations/:id/diagnostics/latest
```

返回：

```text
Template
Budget
Selected Memory IDs
Summary Version
Recent Count
Image Count
```

不一定现在做前端复杂 UI。

---

# 87. PR I 验收

```text
[ ] 500 条历史可以逐页访问
[ ] 上拉不跳动
[ ] 无重复消息
[ ] Diagnostics 可看 Budget
[ ] Diagnostics 可看 Memory IDs
[ ] Diagnostics 不泄露敏感数据
```

---

# 88. PR J：最终整合进 `main`

建议分支：

```text
integration/v2-2-system-stabilization
```

标题：

```text
feat: complete v2.2 long-running instant story foundation
```

---

# 89. 整合前先做 Branch 清理

当前 stacked branches / PR 较多。

整合前必须明确最终唯一事实：

```text
main
```

不要长期保留“某功能只在 feature stack 中存在”。

---

# 90. Integration PR 内容

应该包含：

```text
Chat Core Final
Prompt Hard Budget
Production Vision
Durable Maintenance
Memory Extraction
Memory Consolidation
Conversation Summary
500 Turn Stability
Chat-first UX
Diagnostics
```

---

# 91. Integration PR 禁止新增新功能

这个 PR 只允许：

```text
Resolve conflicts
Fix integration bugs
Fix tests
Fix migration order
Fix wiring
```

不允许顺手开发：

```text
Story Analyzer
Graph
Timeline
Canon Extraction
Group Chat
Voice
```

---

# 92. Integration CI

必须运行：

```text
Architecture Boundaries
Typecheck
Unit Tests
Lint
Build
SQLite Integration
Redis Integration
E2E
Long-running System Test
```

---

# 93. Real Provider 测试

不作为 Required。

提供：

```text
workflow_dispatch
```

测试：

```text
OpenAI-compatible text
OpenAI-compatible image
Anthropic text
Anthropic image
```

---

# 94. Main 合并后验证

合并后再跑一次：

```text
main CI
```

如果 main CI 与 PR CI 条件不同：

```text
必须确保 integration / e2e 实际运行
```

---

# 95. 主分支保护

Required：

```text
verify
```

可以继续保持轻量。

但建议新增一个整合类检查：

```text
chat-integration
```

只在：

```text
apps/api/src/v2/chat/**
packages/ai/src/prompt-engine/**
packages/database/src/v2/chat/**
apps/worker/src/v2/*memory*
apps/worker/src/v2/*summary*
```

变更时触发。

---

# 96. Migration 顺序检查

最终 Migration 应保证：

```text
0300 chat memory
0310 chat core finalization
0320 maintenance jobs
0330 model runtime metadata
0340 maintenance reliability
...
```

测试不能硬编码数量。

只验证：

```text
registered migration IDs
==
applied migration IDs
```

---

# 97. 最终架构

```text
User
↓
Chat UI
↓
API
↓
Resolve Model
├ contextWindow
├ maxTokens
├ modalities
└ provider
↓
Context Builder
├ Persona
├ World
├ Canon
├ Memory
├ Summary
├ Recent Messages
└ Current Input / Images
↓
Prompt Engine
↓
Hard Budget
↓
Vision Media Resolver
↓
Provider Streaming
↓
Assistant Message
↓
SQLite Commit
↓
Maintenance Job Creation
├ Memory Extract
└ Summary
↓
Independent Maintenance Pumps
├ Claim / Lease
├ Retry
├ Memory Extraction
├ Consolidation
└ Summary
```

---

# 98. 最终同步链路

必须保持：

```text
Save User
→ Resolve Model
→ Build Context
→ Prompt
→ LLM
→ Stream
→ Save Assistant
```

不得加入：

```text
Memory Extraction
Summary
Consolidation
Story Analyze
```

同步等待。

---

# 99. 最终异步链路

```text
Assistant Saved
↓
Create Durable Job
↓
Return Chat
```

后台：

```text
Claim
→ Execute
→ Complete
```

失败：

```text
Retry / Backoff
```

---

# 100. 性能目标

## Chat Internal Overhead

```text
Message Save < 20ms
Recent Query < 30ms
Memory Search < 50ms
Prompt Build < 100ms
Summary Read < 20ms
```

---

# 101. Maintenance 性能

无需追求毫秒级。

目标：

```text
Memory Extraction
在任务创建后数秒～数十秒完成
```

Summary：

```text
允许更慢
```

核心要求是：

```text
不会丢
不会重复
能恢复
```

---

# 102. Memory 可靠性优先级

优先级：

```text
正确性
> 可追溯
> 去重
> 时效
> 召回率
```

不要为了“记更多”降低准确性。

---

# 103. Summary 可靠性优先级

```text
覆盖完整
> 顺序正确
> 稳定压缩
> 语言漂亮
```

---

# 104. Vision 可靠性优先级

```text
真实模型可用
> 错误明确
> 安全
> 图片压缩优化
```

图片自动压缩可以后做。

---

# 105. 错误码最终整理

推荐统一：

```text
MODEL_NOT_CONFIGURED
MODEL_CONFIGURATION_INVALID
MODEL_CAPABILITY_MISMATCH

VISION_NOT_SUPPORTED

PROVIDER_TIMEOUT
PROVIDER_RATE_LIMIT
PROVIDER_ERROR

PROMPT_BUDGET_EXCEEDED

MEDIA_TOO_LARGE
UNSUPPORTED_MEDIA
INVALID_MEDIA_REF
MEDIA_NOT_FOUND
MEDIA_READ_FAILED

CONVERSATION_NOT_FOUND
MESSAGE_NOT_FOUND

IDEMPOTENCY_CONFLICT

MAINTENANCE_JOB_INVALID
MAINTENANCE_JOB_FAILED

MEMORY_EXTRACTION_FAILED
MEMORY_VALIDATION_FAILED
MEMORY_CONSOLIDATION_FAILED

SUMMARY_GENERATION_FAILED
SUMMARY_RANGE_CONFLICT
```

---

# 106. 日志要求

日志必须包含：

```text
traceId
conversationId
jobId
jobType
attempt
model
provider
status
errorCode
latency
```

不得包含：

```text
API Key
完整 Base64
未经截断的长 Prompt
```

---

# 107. Development Diagnostics

建议 CLI / API 能快速回答：

```text
这个 Conversation 有多少 Message？
当前 Summary 覆盖到哪里？
有多少 Active Memory？
有多少 Pending Job？
最近一个 Maintenance Error 是什么？
最近 Prompt 用了哪些 Memory？
```

---

# 108. 建议新增健康检查

开发期可增加：

```text
/api/v2/health/chat
```

包括：

```text
sqlite=true
modelConfigured=true/false
pendingMaintenanceJobs=N
failedMaintenanceJobs=N
```

不要暴露敏感配置。

---

# 109. Test Pyramid

## Unit

重点：

```text
Prompt Budget
Memory Parser
Consolidation
Job Range
Retry Policy
Pagination
```

## Integration

重点：

```text
SQLite
API
Worker
Vision Resolver
Job State Machine
```

## E2E

重点：

```text
用户真实路径
```

---

# 110. 不要再追求机械覆盖率

不要回到：

```text
100% line coverage
```

目标改为：

```text
高风险链路必须有测试
```

---

# 111. 当前阶段明确不做

以下内容继续冻结：

```text
Story Analyzer
Canon Auto Write
Graph Auto Maintenance
Timeline
Multi Character Group Chat
Voice
Video
Agent Tool Calling
Qdrant Mandatory
Prompt Visual Editor
```

---

# 112. Definition of Done：System Stabilization

必须全部满足：

```text
[ ] Pagination 无丢失
[ ] Model Profile 有 Context Window
[ ] Model Profile 有 Input Modalities
[ ] Vision 真实配置可用
[ ] Prompt 绑定真实 Model Budget
[ ] Prompt 最终 Hard Guard
[ ] Maintenance Job Range 固定
[ ] Summary 不重复排队
[ ] Claim / Lease
[ ] Retry / Backoff
[ ] Worker Crash Recovery
[ ] Memory Source Validation
[ ] Consolidation Worker
[ ] Incremental Summary
[ ] 500 Turn System E2E
[ ] API Restart
[ ] Worker Restart
[ ] Chat History Pagination
[ ] Diagnostics
[ ] Integration PR 合入 main
[ ] main CI Green
```

---

# 113. 最终用户验收 Scenario

从全新数据库开始：

```text
1. 打开 /v2
2. 输入 Persona
3. 点击开始故事
4. AI Opening 正常
5. 连续文字聊天
6. 上传图片
7. 配置支持 Vision 的真实 Profile
8. AI 能读取图片
9. 用户说“我的生日是 3 月 12 日”
10. 继续聊天
11. Memory Job 自动执行
12. Memory 可查询
13. Summary 自动生成
14. 停止 Worker
15. 继续聊天仍正常
16. 重启 Worker
17. Pending Job 自动恢复
18. 模拟一次 Provider 429
19. Job 自动 Retry
20. 关闭 API
21. 使用相同 SQLite 重启
22. Conversation / Memory / Summary 恢复
23. 聊到 500 Turn
24. Prompt 始终不超过 Model Budget
25. 用户询问生日
26. Prompt 命中长期 Memory
27. AI 正确延续
28. 用户向上滚动历史消息
29. 500 条历史无丢失、无重复
30. Diagnostics 可定位本轮使用的 Memory / Summary / Budget
```

这条路径全部通过后，V2.2 才可定义为：

> **长期即时故事基础架构完成。**

---

# 114. 完成 V2.2 后再进入的阶段

只有在本方案全部完成后，才开始：

```text
V2.3
Story Analyzer
↓
Chat → Candidate
↓
Character Fact
World Fact
Relationship
Timeline
Graph
↓
Review
↓
Canon
```

仍然坚持：

```text
AI 不直接修改 Canon
```

---

# 115. 给 AI Coding Agent 的执行要求

每个 PR 开始前：

```text
1. 拉取最新 base
2. 检查当前实现
3. 只处理本 PR 范围
4. 不顺手做下一阶段
5. 保留无关用户改动
6. 先写/调整测试
7. 实现
8. 运行 targeted tests
9. 运行 typecheck
10. 运行 verify:fast
11. 输出修改文件
12. 输出测试结果
13. 明确未完成事项
```

---

# 116. AI Coding Agent 禁止行为

禁止：

```text
未经要求重构整个架构
删除现有功能
把 Chat 接入 Worker
让 Chat 强依赖 Redis
引入新数据库
为了修一个问题引入复杂框架
跳过测试
通过 type cast 隐藏类型错误
通过修改测试断言掩盖真实 Bug
```

---

# 117. 推荐里程碑

## M1 — Real Chat Runtime [已完成]

完成：

```text
PR A～C
```

意味着：

```text
分页、模型上下文、真实 Vision 正常
```

---

## M2 — Reliable Background Intelligence [已完成]

完成：

```text
PR D～G
```

意味着：

```text
Memory / Summary 不丢、不乱、不重复、可恢复
```

---

## M3 — Long-running System

完成：

```text
PR H
```

意味着：

```text
500 Turn 真正成立
```

---

## M4 — Product-operable V2.2

完成：

```text
PR I～J
```

意味着：

```text
用户可长期使用
开发者可诊断
main 是唯一事实源
```

---

# 118. 最终执行顺序摘要

```text
第一步 [已完成]
修 Pagination

第二步 [已完成]
Model Profile 增加 Context + Modalities

第三步 [已完成]
Prompt 绑定真实 Model Runtime

第四步 [已完成]
生产 Vision 完成

第五步 [已完成]
Maintenance 固定 Message Range

第六步 [已完成]
Summary 去重复

第七步 [已完成]
Claim / Lease / Retry

第八步 [已完成]
Maintenance Pump 隔离

第九步 [已完成]
Memory Provenance

第十步 [已完成]
Memory Consolidation Worker

第十一步 [已完成]
Summary Incremental Correctness

第十二步 [待进行 - 第三阶段]
500 Turn System E2E

第十三步 [待进行 - 第三阶段]
Chat History Pagination

第十四步 [待进行 - 第三阶段]
Prompt / Memory / Model Diagnostics

第十五步 [待进行 - 第三阶段]
Integration → main
```

---

# 119. 本阶段最终原则

后续所有实现优先满足：

```text
Correct Before Clever
Durable Before Fast
Bounded Before Rich
Recoverable Before Automated
Main Is Truth
```

对应产品侧继续保持：

```text
Chat First
Context Bounded
Memory Async
Structure Lazy
User Path First
```

---

# 120. 最终完成判定

当且仅当：

```text
用户可以只输入 Persona
持续聊天 500 Turn
发送图片
自动形成长期 Memory
自动形成 Summary
经历 API / Worker 重启
经历临时 Provider 错误
仍然保持上下文连续
且 Prompt 不突破真实模型上下文
```

才可以认为：

> **GameStart 的即时故事长期运行底座已经真正完成。**

