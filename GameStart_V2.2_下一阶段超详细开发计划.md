# GameStart V2.2 下一阶段开发计划
## Chat Core Finalization → Vision → Long-Term Memory → Summary → 500 Turn Stability → Chat-first UX

> 文档类型：下一阶段详细实施方案  
> 适用基线：`main` 已合并 PR #19 `fix: stabilize v2 chat core`  
> 当前目标：完成 Chat Core 收尾，并把「图片理解、长期 Memory、会话 Summary、长对话稳定性」真正做成可运行闭环  
> 开发阶段：快速开发期，但开始进入“核心链路稳定化”阶段  
> 核心原则：**Chat First / Context Bounded / Memory Async / Structure Lazy / User Path First**

---

# 1. 执行摘要

当前项目已经完成了第一轮 Instant Story + Chat 的可运行骨架，并完成了一次 Chat Core Stabilization。

当前已经比较稳定的能力：

```text
Persona
→ Instant Story
→ Conversation
→ User Message
→ Prompt Engine
→ LLM Streaming
→ Assistant Message
→ SQLite Persistence
```

同时已经完成：

```text
Media Upload
Recent Message 修复
Message Idempotency
Opening Idempotency
Provider AbortSignal
CHAT Capability
CJK Token Estimate
500 Message Repository Test
```

下一阶段不应该继续大规模扩张功能，而应该沿以下顺序推进：

```text
Phase 0
Chat Core Finalization
↓
Phase 1
Prompt Engine Hard Budget
↓
Phase 2
Real Vision Chat
↓
Phase 3
Durable Async Chat Maintenance
↓
Phase 4
Long-Term Memory V1
↓
Phase 5
Conversation Summary
↓
Phase 6
500 Turn Context Stability
↓
Phase 7
Chat-first UX
↓
Phase 8
Observability / Diagnostics
↓
Phase 9
Story Analyzer Readiness
```

本阶段最重要的产品目标不是：

```text
增加多少模块
增加多少 API
增加多少表
```

而是：

> 用户只输入一个 Persona，就可以开始一个长期运行的故事；系统能理解文字和图片，能记住长期重要内容，能在数百轮对话后仍保持上下文稳定，并能在重启后继续。

---

# 2. 当前基线与剩余问题

## 2.1 已完成

当前应视为已完成或基本完成：

- Instant Story Bootstrap
- Persona 原文保存
- Conversation
- Chat Message
- SSE Streaming
- SQLite 持久化
- Chat 页面
- 图片上传与展示
- SHA256 Media Hash 修复
- Recent Messages Repository
- 500 Message Repository 测试
- Message 基础幂等
- Opening 固定幂等 Key
- Provider AbortSignal
- OpenAI-compatible 图片 Provider 基础
- Anthropic 图片 Provider 基础
- `V2ModelCapability.CHAT`
- CJK Token Estimate
- PromptBudgetDebug 基础

## 2.2 当前必须继续处理的问题

### P0

1. `main` Integration 仍因 Migration Count 魔法数字失败
2. UI History 仍可能读取最早 200 条，而非最近 200 条
3. Prompt Budget 仍然没有真正限制最终 `PreparedPrompt.messages`
4. Vision Provider 已支持图片，但 Chat Context 没有把真实图片内容送入模型

### P1

5. 相同图片重复上传可能产生 DB Primary Key 冲突
6. 多附件幂等比较依赖 SQL `IN` 返回顺序
7. Message Idempotency 没有包含 `replyToMessageId`
8. Stop Generation 缺少真实 Client Abort → Provider Abort → interrupted 持久化测试
9. Instant Story Idempotency 只按 key，不校验 payload
10. Chat 仍硬编码 `temperature/maxTokens`
11. Model Profile 尚未描述 input modalities / context window
12. Long-Term Memory 只有 Schema / Repository / FTS，没有 Extraction
13. Conversation Summary 只有 Schema / Read，没有生成器
14. `/v2` 默认入口仍是 Workspace
15. Chat Shell 仍与高级创作 Shell 混合

---

# 3. 下一阶段总体目标

## 3.1 用户体验目标

最终用户路径：

```text
打开 GameStart
↓
输入 Persona
↓
开始故事
↓
AI Opening
↓
用户发送文字
↓
AI 流式回复
↓
用户发送图片
↓
AI 真正理解图片
↓
继续长期聊天
↓
系统异步提取长期 Memory
↓
系统异步生成 Conversation Summary
↓
重启应用
↓
继续聊天
↓
AI 仍能记住长期信息
```

## 3.2 技术目标

必须达到：

```text
同步 Chat Path
≤ 必要组件

异步维护能力
不得阻塞用户回复

Prompt Context
必须有硬上限

SQLite
仍然是唯一业务事实源

Redis
可重建，不成为 Chat 可用性的前置条件
```

---

# 4. 阶段划分

| 阶段 | 目标 | 是否阻塞后续 |
|---|---|---|
| Phase 0 | Chat Core Finalization | 是 |
| Phase 1 | Prompt Hard Budget | 是 |
| Phase 2 | Real Vision | 是 |
| Phase 3 | Durable Async Foundation | 是 |
| Phase 4 | Long-Term Memory V1 | 是 |
| Phase 5 | Conversation Summary | 是 |
| Phase 6 | 500 Turn Context Stability | 是 |
| Phase 7 | Chat-first UX | 否 |
| Phase 8 | Observability | 否，但强烈建议 |
| Phase 9 | Story Analyzer Readiness | 最后 |

---

# 5. Phase 0：Chat Core Finalization

建议独立 PR：

```text
fix: finalize v2 chat core
```

目标：

> 关闭 Chat Core 阶段所有剩余高优先级技术问题。

---

# 6. Phase 0.1：修复 Integration Migration Count

## 当前问题

Integration Test 直接断言 Migration 数量，例如：

```ts
assert.equal(applied.count, 12)
```

新增 Migration 后，这种测试必然再次失效。

## 修改目标

禁止：

```ts
assert.equal(count, 12)
assert.equal(count, 13)
assert.equal(count, 14)
```

改为验证：

```text
实际数据库 Migration IDs
=
代码当前注册的 Migration IDs
```

## 推荐实现

数据库 Migration Registry 提供：

```ts
export function listV2Migrations(): readonly V2SqliteMigration[]
```

Integration Test：

```ts
const expected = listV2Migrations()
  .map((migration) => migration.id)
  .sort();

const actual = db.prepare(`
  SELECT migration_id
  FROM v2_schema_migrations
  ORDER BY migration_id
`).all();

assert.deepEqual(
  actual.map((row) => row.migration_id),
  expected,
);
```

## 验收

```text
新增任何 Migration
→ 不需要手动修改 Migration Count Test
```

同时：

```text
漏执行某个 Migration
→ Test 必须失败
```

---

# 7. Phase 0.2：UI History 改为最近消息

## 当前问题

Prompt 已经使用最近消息，但 API `listMessages()` 仍可能读取最早的固定 200 条，导致 201+ 消息时刷新后最新消息消失。

## 第一阶段修复

```ts
listMessages(conversationId)
→ listRecentByConversation(conversationId, 200)
```

保证：

```text
UI 初次加载
=
最近 200 条
```

## 第二阶段分页接口

后续增加：

```http
GET /api/v2/chat/conversations/:conversationId/messages
  ?beforeMessageId=<message-id>
  &limit=50
```

响应：

```ts
interface V2ChatMessagePageResponse {
  readonly messages: readonly V2ChatMessageDto[];
  readonly hasMore: boolean;
  readonly nextBeforeMessageId?: V2MessageId;
}
```

## Web 行为

初始：

```text
加载最近 50 条
↓
滚动到底部
```

向上滚动：

```text
scrollTop < threshold
↓
GET beforeMessageId
↓
prepend messages
↓
保持 scroll offset
```

## 验收

插入：

```text
500 Messages
```

页面重新进入：

```text
默认显示 451～500
```

向上加载：

```text
401～450
```

---

# 8. Phase 0.3：Media Upload 幂等

## 当前问题

相同图片：

```text
相同 SHA256
→ 相同 mediaId
→ 第二次 INSERT
→ Primary Key Conflict
```

## 推荐行为

Media 视为 Content Addressed Resource：

```text
同一文件
→ 同一 SHA256
→ 同一 Media
```

## Repository 新增

```ts
getByContentHash(
  contentHash: string
): Promise<V2ChatMedia | undefined>
```

由于 `mediaId` 已由 hash 生成，也可直接复用 `get()`。

## createMedia()

```text
计算 hash
↓
构造 mediaId
↓
Repository.get(mediaId)
↓
存在
→ 返回已有 Media
↓
不存在
→ INSERT
```

## 数据库约束建议

```sql
UNIQUE(content_hash)
```

## 验收

连续上传同一张图片：

```text
第一次成功
第二次成功
mediaId 相同
DB 只有 1 条 Media
文件只有 1 份
```

---

# 9. Phase 0.4：Attachment 顺序稳定

## 当前问题

```sql
WHERE media_id IN (...)
```

不保证返回顺序，而幂等比较按 index。

## 推荐实现

```ts
const mediaById = new Map(
  mediaItems.map((item) => [item.mediaId, item]),
);

const orderedMediaItems = attachmentIds.map((id) => {
  const item = mediaById.get(id);
  if (!item) throw ...
  return item;
});
```

## 幂等 Payload

统一计算：

```ts
function messagePayloadFingerprint(input): string
```

包含：

```text
text
attachmentIds
replyToMessageId
```

Canonical JSON：

```json
{
  "text": "...",
  "attachmentIds": ["...", "..."],
  "replyToMessageId": "..."
}
```

再 SHA256。

---

# 10. Phase 0.5：Instant Story 严格幂等

## 正确语义

```text
same key + same payload
→ replay

same key + different payload
→ 409 IDEMPOTENCY_CONFLICT
```

Payload 至少包含：

```text
persona
displayName
```

标准化：

```text
persona.trim()
displayName?.trim()
```

## 推荐方案

新增：

```sql
CREATE TABLE v2_instant_story_requests (
  idempotency_key TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

---

# 11. Phase 0.6：Stop Generation 集成测试

新增 Slow Abort-aware Provider：

```ts
class SlowAbortAwareProvider implements ChatProvider {
  public aborted = false;

  async *stream(request) {
    yield { content: "第一段" };

    await waitUntilAbort(request.signal);

    this.aborted = true;

    throw new ProviderError(
      "STREAM_ERROR",
      "aborted",
    );
  }
}
```

测试：

```text
POST /replies
↓
接收第一段 SSE
↓
Client Abort
↓
Provider signal.aborted === true
↓
查询 DB
↓
Assistant Message.status = interrupted
↓
text = 第一段
```

如果尚未产生任何输出就 Abort：

```text
不创建 Assistant Message
```

---

# 12. Phase 0.7：Chat 使用 Model Profile 参数

## 目标

Route 不再硬编码：

```text
temperature = 0.8
maxTokens = 1024
```

新增：

```ts
interface ResolvedChatModel {
  readonly provider: ChatProvider;
  readonly profileId?: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly contextWindow?: number;
  readonly inputModalities: readonly ("text" | "image")[];
}
```

Resolver：

```text
CHAT Binding
↓
Model Profile
↓
Decrypt Secret
↓
Create Provider
↓
Return ResolvedChatModel
```

Route：

```ts
const model = await chatModelResolver.resolve();

model.provider.stream({
  messages,
  temperature: model.temperature,
  maxTokens: model.maxTokens,
  signal,
});
```

---

# 13. Phase 0 完成标准

全部满足才关闭 Chat Core：

```text
main CI Green
UI 最近消息正确
Media 重复上传安全
Attachment 顺序稳定
Message 幂等包含 replyTo
Instant Story 严格幂等
Stop 有真实集成测试
Chat 使用 Model Profile 参数
```

---

# 14. Phase 1：Prompt Engine Hard Budget

建议 PR：

```text
refactor: enforce bounded prompt context
```

目标：

> `PromptBudgetDebug` 从“统计工具”升级为“真正的上下文约束机制”。

---

# 15. Hard Budget 模型

```text
inputBudget
=
contextWindow
-
outputReserve
-
safetyReserve
```

例如：

```text
8192
-
1200
-
256
=
6736
```

---

# 16. Context Priority

## Priority 0：绝对保留

```text
Platform Rules
Persona
Current Input
```

如果三者本身超过 Budget：

```text
PROMPT_BUDGET_EXCEEDED
```

不要静默删除 Persona。

## Priority 1

```text
Recent Messages
```

至少保留最近：

```text
4 个完整 Turn
```

尽可能扩展到：

```text
20～30 Messages
```

## Priority 2

```text
Relevant Memory
```

## Priority 3

```text
Relevant Canon
```

## Priority 4

```text
Conversation Summary
```

---

# 17. Prompt Selection Algorithm

```ts
function buildPrompt(context) {
  const budget = calculateInputBudget(context.model);

  const required = [
    platformRules,
    persona,
    currentInput,
  ];

  ensureFit(required, budget);

  let remaining = budget - tokens(required);

  const recent = selectRecentMessages(
    context.recentMessages,
    remaining,
    { minTurns: 4 },
  );

  remaining -= tokens(recent);

  const memories = selectMemories(
    context.memories,
    remaining,
  );

  remaining -= tokens(memories);

  const canon = selectCanon(
    context.canon,
    remaining,
  );

  remaining -= tokens(canon);

  const summary = selectSummary(
    context.summary,
    remaining,
  );

  return assemble(...);
}
```

---

# 18. Recent Messages 选择

从最新开始选择：

```text
最新消息
↑
逐条向前
```

最终传给模型仍按时间正序。

按 Turn 保证完整性：

```text
User
Assistant
```

尽量作为同一个最小单元。

---

# 19. Persona 不允许普通 truncate

不要再用：

```text
truncate(systemText)
```

整体截断。

Persona 超限时：

```text
显式失败
```

未来需要时再引入 Persona Compact Version。

---

# 20. Token Estimator

第一阶段：

```text
CJK ≈ 1 token / char
ASCII ≈ 1 token / 4 chars
message overhead = 4～8 tokens
```

图片先保守估算：

```text
每图 512～1024 tokens
```

后续按 Provider 精细化。

---

# 21. Prompt Budget Test Matrix

必须覆盖：

```text
Small Prompt
→ 不裁剪

History 超长
→ 只保留最近 Turn

Memory 超长
→ 只选 Top Relevant

Persona + Current Input 超 Budget
→ PROMPT_BUDGET_EXCEEDED

usedTokens <= inputBudget

Persona 永远存在

Current Input 永远存在

History 不重复
```

---

# 22. Phase 1 完成标准

任何正常请求：

```text
PreparedPrompt.estimatedTokens
<= PromptBudgetDebug.inputBudget
```

且：

```text
Persona
Current Input
不被静默删除
```

---

# 23. Phase 2：Real Vision Chat

建议 PR：

```text
feat: add real multimodal chat context
```

---

# 24. 新 Chat Image Context

```ts
interface ChatImageContext {
  readonly mediaId: V2MediaId;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
}
```

ChatInput：

```ts
interface ChatInput {
  readonly text?: string;
  readonly images: readonly ChatImageContext[];
}
```

ChatMessageContext：

```ts
interface ChatMessageContext {
  readonly messageId: V2MessageId;
  readonly role: "user" | "assistant" | "system";
  readonly text?: string;
  readonly images: readonly ChatImageContext[];
}
```

---

# 25. Media Resolver

Port：

```ts
interface V2ChatMediaResolver {
  resolve(
    media: ChatImageContext
  ): Promise<ResolvedChatImage>;
}
```

返回：

```ts
interface ResolvedChatImage {
  readonly mediaType: string;
  readonly dataBase64: string;
}
```

本地 Resolver：

```text
media://local/v2/chat/<filename>
↓
validate scheme
↓
validate filename
↓
resolve path
↓
确保仍在 media root
↓
read bytes
↓
base64
```

---

# 26. Vision 安全

禁止：

```text
../../
任意绝对路径
file://
未经允许的远程 URL
```

第一版只允许：

```text
media://local/v2/chat/
```

---

# 27. Prompt Engine 多模态

最终当前 User Message：

```ts
{
  role: "user",
  content: [
    { type: "text", text: "这是什么？" },
    {
      type: "image",
      mediaType: "image/png",
      dataBase64: "..."
    }
  ]
}
```

---

# 28. 历史图片策略

```text
当前 Turn 图片
→ 必须保留

最近 1～2 Turn 图片
→ Budget 允许时保留

更早图片
→ 不重复发送原图
```

长期信息通过：

```text
Summary / Memory
```

保留。

---

# 29. Model Profile Modalities

增加：

```ts
inputModalities: readonly ("text" | "image")[]
```

现有 Profile 默认：

```text
["text"]
```

支持 Vision：

```text
["text", "image"]
```

如果当前请求有图片而模型不支持：

```text
422 VISION_NOT_SUPPORTED
```

---

# 30. Vision Tests

Provider Unit：

```text
OpenAI → image_url data URI
Anthropic → image base64 source
```

API Integration：

```text
Upload PNG
↓
Send Message attachment
↓
Reply
↓
Fake Provider 捕获 messages
↓
assert image content exists
```

异常：

- Model 不支持 image
- Media 不存在
- MediaRef 非法
- 文件被删除
- MIME 不合法
- 图片过大

---

# 31. Phase 2 完成标准

```text
用户发送图片
↓
Provider Request 真正含图片 bytes
↓
模型能够根据图片内容回答
```

---

# 32. Phase 3：Durable Async Chat Maintenance

Memory 与 Summary 必须异步，但不能因 Redis 不可用而丢任务。

---

# 33. Durable Maintenance Jobs

建议新增：

```sql
CREATE TABLE v2_chat_maintenance_jobs (
  job_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT
);
```

Job Type：

```text
memory_extract
conversation_summary
memory_consolidate
story_analyze
```

前两项先实现。

---

# 34. Post Reply Trigger

Assistant Reply 保存成功后：

```text
同一 SQLite Transaction
↓
根据规则写 Maintenance Job
```

例如：

```text
每 4 个 User Turns
→ memory_extract

未摘要消息 > 30
→ conversation_summary
```

---

# 35. Dispatcher

```text
SQLite Pending Jobs
↓
Dispatcher
↓
BullMQ
↓
Worker
```

Redis 不可用：

```text
SQLite Job 保持 pending
```

恢复：

```text
重新 dispatch
```

---

# 36. Job Dedupe

```text
memory_extract:<conversationId>:<coveredMessageId>

summary:<conversationId>:<coveredMessageId>
```

避免重复。

---

# 37. Phase 3 完成标准

```text
Redis Offline
→ Chat 仍正常

Redis 恢复
→ Pending Maintenance Jobs 可补执行
```

---

# 38. Phase 4：Long-Term Memory V1

建议 PR：

```text
feat: add long-term memory extraction
```

---

# 39. Memory 职责

只保存：

```text
未来对长期故事有价值的信息
```

类型：

```text
profile
preference
relationship
episodic
world_fact
```

---

# 40. Extraction Trigger

第一版：

```text
每 4 个 User Turns
```

输入：

```text
Persona
+
最近 8～16 Messages
+
已有相关 Memory
```

---

# 41. memory.extract.v1

输出：

```json
{
  "memories": [
    {
      "kind": "preference",
      "content": "用户不喜欢香菜",
      "importance": 0.72,
      "confidence": 0.96,
      "sourceMessageIds": [
        "message:user:..."
      ]
    }
  ]
}
```

---

# 42. Validation

严格验证：

```text
kind 合法
content 非空
importance 0～1
confidence 0～1
sourceMessageIds 存在
```

不保存半合法数据。

---

# 43. Memory Dedup

第一版：

```text
FTS Candidate
+
normalize(content)
```

完全相同：

```text
不新增
更新 metadata
```

潜在冲突进入 Consolidation。

---

# 44. Memory Consolidation V1

输入：

```text
existing memory
new candidate
```

输出：

```json
{
  "action": "keep_both | merge | supersede | ignore",
  "mergedContent": "...",
  "confidence": 0.9
}
```

---

# 45. Supersede

```text
旧：
用户喜欢咖啡

新：
用户戒咖啡
```

结果：

```text
Old.status = superseded
New.status = active
New.supersedesMemoryId = Old.id
```

---

# 46. Retrieval

第一版：

```text
FTS5
+
Application Ranking
```

候选：

```text
20
```

最终：

```text
Top 6～8
```

建议权重：

```text
relevance    0.55
importance   0.20
confidence   0.15
recency      0.10
```

做成 Policy，不放 Domain。

---

# 47. Memory Trace

Prompt Debug 记录：

```text
selectedMemoryIds
```

用于定位：

```text
Memory 错
还是模型错
```

---

# 48. Memory Tests

```text
“我的生日是 3 月 12 日”
→ profile memory

“哈哈哈”
→ no memory

“我不喜欢香菜”
→ preference

“我以前喜欢咖啡，现在戒了”
→ supersede

Extract
→ Restart
→ Retrieve
```

---

# 49. Phase 4 完成标准

```text
用户说长期信息
↓
后台提取
↓
SQLite Memory
↓
后续 Retrieval
↓
Prompt 注入
↓
模型正确使用
```

---

# 50. Phase 5：Conversation Summary

建议 PR：

```text
feat: add conversation summarization
```

---

# 51. Summary 定位

```text
Summary = 长历史压缩
Memory = 长期事实
```

不能互相替代。

---

# 52. Trigger

建议：

```text
未摘要 Message > 30
```

---

# 53. Incremental Summary

```text
Previous Summary
+
Next 20～30 Messages
↓
New Summary
```

不要每次重新总结全部历史。

---

# 54. Summary 内容

包含：

- 当前场景
- 重要事件
- 用户与角色关系变化
- 未解决冲突
- 当前目标
- 重要角色状态

避免：

- 大量原文
- 寒暄
- 所有 Memory 机械重复

建议长度：

```text
500～1200 中文字符
```

---

# 55. Summary Tests

```text
60 Messages
↓
Summary Job
↓
coveredUntilMessageId 正确
sourceMessageCount 正确
version + 1
```

再次触发：

```text
只处理未覆盖部分
```

---

# 56. Phase 5 完成标准

```text
100+ Messages
↓
Prompt 不需要读取整个历史
```

---

# 57. Phase 6：500 Turn Context Stability

这是本轮最重要的系统验收。

---

# 58. 测试规模

```text
500 User Turns
+
500 Assistant Turns
=
1000 Messages
```

每 50 Turn：

```text
Build Context
```

记录：

```text
estimatedTokens
recentMessageCount
memoryCount
summaryVersion
```

---

# 59. 正确的 Token 曲线

错误：

```text
Turn 10    2k
Turn 50    8k
Turn 100   15k
Turn 500   70k
```

正确：

```text
Turn 10    2k
Turn 50    ~5k
Turn 100   ~5.5k
Turn 500   ~5.8k
```

不要求完全不变，但必须趋于稳定。

---

# 60. 长期事实验证

Turn 10：

```text
我的生日是 3 月 12 日
```

Turn 300：

```text
我不喜欢香菜
```

Turn 490：

```text
你还记得我的生日吗？
```

必须：

```text
Memory Retrieval
→ 生日
```

---

# 61. Restart Test

Turn 250：

```text
停止 API
停止 Worker
重新启动
```

继续到 Turn 500。

必须：

```text
Context Continuity 正常
```

---

# 62. Redis Failure Test

Turn 200：

```text
停止 Redis
```

继续聊天 10 Turns：

```text
Chat 正常
Maintenance Pending
```

恢复 Redis：

```text
任务补执行
```

---

# 63. Phase 6 完成标准

```text
500 Turn ✅
Context Bounded ✅
Memory Works ✅
Summary Works ✅
Restart Works ✅
Redis Failure Does Not Break Chat ✅
```

---

# 64. Phase 7：Chat-first UX

建议 PR：

```text
feat: make instant story the primary v2 flow
```

---

# 65. `/v2` 默认入口

第一版：

```text
/v2
→ /v2/start
```

后续：

```text
有最近故事
→ Recent Stories
无故事
→ Start
```

---

# 66. Start 页面

默认：

```text
Persona
[开始故事]
```

角色名称：

```text
高级设置
```

---

# 67. Chat Shell

新增：

```text
V2StoryShell
```

只展示：

- Back
- Character
- Messages
- Composer
- Image
- Stop
- Retry

高级创作入口单独：

```text
进入高级创作
```

---

# 68. Workspace

保留：

```text
/v2/workspace/*
```

作为高级模式。

---

# 69. Phase 8：Observability

建议 PR：

```text
feat: add chat prompt and memory diagnostics
```

每次模型调用记录：

```text
traceId
conversationId
messageId
task

templateId
templateVersion
contextHash

profileId
provider
model

inputTokensEstimated
outputTokensActual

recentMessageCount
memoryIds
summaryVersion
imageCount

firstTokenLatencyMs
totalLatencyMs

status
errorCode
```

---

# 70. 隐私要求

禁止记录：

```text
API Key
完整图片 Base64
无限制完整 Prompt
```

Prompt Preview 限制：

```text
500～1000 chars
```

---

# 71. Phase 9：Story Analyzer Readiness

只有前面阶段稳定后开始。

输入：

```text
Summary
+
Relevant Memory
+
Recent Messages
```

输出：

```text
Character Fact Candidate
World Fact Candidate
Relationship Candidate
Timeline Candidate
Graph Candidate
```

永远：

```text
Candidate
→ Review
→ Canon
```

禁止 Chat 直接写 Canon。

---

# 72. Migration 规划

建议：

```text
0310_chat_core_finalization
0320_model_profile_modalities
0330_chat_maintenance_jobs
```

必要时再追加 Memory metadata migration。

---

# 73. Model Profile 建议

```ts
interface V2ModelProfileDto {
  id;
  name;
  protocol;
  baseUrl;
  model;

  timeoutMs;
  maxTokens;
  temperature;

  contextWindow;

  inputModalities: readonly (
    "text" |
    "image"
  )[];

  hasApiKey;
}
```

---

# 74. API 规划

Chat：

```text
GET  /api/v2/chat/conversations
GET  /api/v2/chat/conversations/:id
GET  /api/v2/chat/conversations/:id/messages
POST /api/v2/chat/conversations/:id/messages
POST /api/v2/chat/conversations/:id/replies
```

Media：

```text
POST /api/v2/chat/media
GET  /api/v2/chat/media/:filename
```

Debug 后续：

```text
GET /api/v2/chat/conversations/:id/memories
GET /api/v2/chat/conversations/:id/summary
```

---

# 75. Error Code 规划

```text
MODEL_NOT_CONFIGURED
MODEL_CAPABILITY_MISMATCH
VISION_NOT_SUPPORTED

PROVIDER_TIMEOUT
PROVIDER_RATE_LIMIT
PROVIDER_ERROR

MEDIA_TOO_LARGE
UNSUPPORTED_MEDIA
INVALID_MEDIA_REF
MEDIA_NOT_FOUND

CONVERSATION_NOT_FOUND
MESSAGE_NOT_FOUND

IDEMPOTENCY_CONFLICT

PROMPT_BUDGET_EXCEEDED

MEMORY_EXTRACTION_FAILED
MEMORY_VALIDATION_FAILED

SUMMARY_GENERATION_FAILED
```

---

# 76. 推荐 PR 顺序

| PR | 目标 |
|---|---|
| PR 20 | `fix: finalize v2 chat core` |
| PR 21 | `refactor: enforce bounded prompt context` |
| PR 22 | `feat: add real multimodal chat` |
| PR 23 | `feat: add durable chat maintenance jobs` |
| PR 24 | `feat: add long-term memory extraction` |
| PR 25 | `feat: add memory consolidation` |
| PR 26 | `feat: add conversation summary` |
| PR 27 | `test: validate 500-turn chat continuity` |
| PR 28 | `feat: make instant story the primary flow` |
| PR 29 | `feat: add chat diagnostics` |

---

# 77. CI 策略

普通 PR：

```text
Architecture Boundaries
Typecheck
Unit Tests
Lint
Build
```

Chat Core PR：

```text
+ Chat API Integration
```

main：

```text
Integration
E2E
```

Real LLM / Real Vision Provider：

```text
Manual
Nightly
```

不要所有 PR Required。

---

# 78. Performance Budget

目标：

```text
Message Save < 20 ms
Recent Messages Query < 30 ms
Memory FTS < 50 ms
Prompt Build < 100 ms
Summary Read < 20 ms
```

系统内部 Send → Provider 开始请求额外开销：

```text
< 200 ms
```

---

# 79. 图片性能

上传仍可保持：

```text
12 MB
```

但送 LLM 前建议额外限制：

```text
4～6 MB
```

后续可以：

```text
保存原图
↓
生成 Prompt 压缩版
```

当前先不增加复杂图像处理链。

---

# 80. Memory 成本控制

新增 Capability：

```text
memory_extraction
```

绑定低成本模型。

未来：

```text
story_analysis
```

绑定更强模型。

---

# 81. 风险控制

## Memory 过度记录

解决：

```text
importance
confidence
Extraction Rules
```

## Memory 错误

解决：

```text
sourceMessageIds
confidence
supersede
diagnostics
```

## Summary 漂移

解决：

```text
关键事实放 Memory
剧情状态放 Summary
```

## Vision Context 太大

解决：

```text
当前图片优先
历史图片限制
图片成本计入 Budget
```

## Redis 影响 Chat

解决：

```text
SQLite Durable Jobs
Redis 仅执行层
```

---

# 82. Definition of Done：Chat Core Final

```text
main CI Green
500 Message UI History Correct
Media Duplicate Safe
Message Idempotency Strict
Story Idempotency Strict
Stop Proven
Profile Config Effective
```

---

# 83. Definition of Done：Prompt Engine V2

```text
Hard Budget
Persona Guaranteed
Current Input Guaranteed
History No Duplicate
History Turn-safe
Memory Selectable
Canon Selectable
Debuggable
```

---

# 84. Definition of Done：Vision V1

```text
Upload
Persist
Display
Resolve
Model Receive
Model Understand
Capability Check
Integration Test
```

---

# 85. Definition of Done：Memory V1

```text
Trigger
Durable Job
Extract
Validate
Dedup
Persist
Retrieve
Prompt Inject
Restart
```

---

# 86. Definition of Done：Summary V1

```text
Trigger
Incremental
Persist
Version
Covered Until
Prompt Inject
```

---

# 87. Definition of Done：Long Chat

```text
500 Turns
Context Stable
Memory Stable
Summary Stable
Restart Stable
Redis Failure Stable
```

---

# 88. PR 20 任务清单

```text
[ ] 修 Migration Count Test
[ ] listMessages 改最近消息
[ ] 预留 Message Pagination
[ ] Media 重复上传幂等
[ ] Attachment 保序
[ ] replyTo 纳入幂等
[ ] Instant Story Payload Hash
[ ] Stop Integration Test
[ ] Chat Runtime Model Settings
[ ] main CI Green
```

---

# 89. PR 21 任务清单

```text
[ ] Model Context Window
[ ] outputReserve
[ ] safetyReserve
[ ] Hard inputBudget
[ ] Priority Selector
[ ] Turn-safe history
[ ] Persona guaranteed
[ ] Current Input guaranteed
[ ] image cost estimate
[ ] usedTokens <= inputBudget test
```

---

# 90. PR 22 任务清单

```text
[ ] ChatImageContext
[ ] Media Resolver Port
[ ] Local Resolver
[ ] ChatContent multi-part
[ ] OpenAI request
[ ] Anthropic request
[ ] Model input modalities
[ ] VISION_NOT_SUPPORTED
[ ] Vision API integration
```

---

# 91. PR 23 任务清单

```text
[ ] maintenance jobs migration
[ ] repository
[ ] post-reply trigger
[ ] dispatcher
[ ] BullMQ integration
[ ] retry
[ ] dedupe key
[ ] Redis offline test
```

---

# 92. PR 24 任务清单

```text
[ ] memory.extract prompt
[ ] structured JSON schema
[ ] extraction worker
[ ] validation
[ ] dedupe
[ ] source message trace
[ ] FTS retrieval
[ ] prompt integration
[ ] restart E2E
```

---

# 93. PR 25 任务清单

```text
[ ] memory conflict detection
[ ] consolidate prompt
[ ] keep / merge / supersede / ignore
[ ] supersede transaction
[ ] regression tests
```

---

# 94. PR 26 任务清单

```text
[ ] summary trigger
[ ] summary prompt
[ ] incremental update
[ ] versioning
[ ] coveredUntil
[ ] context integration
[ ] summary tests
```

---

# 95. PR 27 任务清单

```text
[ ] 1000 Messages fixture
[ ] 500 Turn simulation
[ ] long-term fact recall
[ ] context size report
[ ] restart midway
[ ] Redis offline midway
[ ] final continuity assertions
```

---

# 96. 里程碑

## M1 Stable Chat

```text
PR 20 + PR 21
```

## M2 Multimodal Chat

```text
PR 22
```

## M3 Persistent Character Memory

```text
PR 23～26
```

## M4 Long-running Story

```text
PR 27
```

## M5 Product-first UX

```text
PR 28
```

---

# 97. 本阶段禁止事项

暂时不要：

- 大规模重构 Domain
- 更换 Fastify
- 更换 Vue
- 引入向量数据库作为强依赖
- 引入新的主数据库
- Chat 经过 Worker
- Chat 强依赖 Redis
- Memory 直接写 Canon
- Story Analyzer 直接改 Canon
- 增加复杂 Multi-Agent 编排
- 为覆盖率制造低价值测试

---

# 98. 开发完成后的目标结构

```text
User
↓
Chat UI
↓
Message API
↓
SQLite Message
↓
Context Builder
├ Persona
├ Summary
├ Memory
├ Recent Messages
├ Canon
└ Current Images
↓
Prompt Engine
↓
Resolved Model Profile
↓
Provider
↓
Streaming Reply
↓
SQLite Assistant Message
↓
Maintenance Job
↓
Worker
├ Memory Extract
├ Memory Consolidate
└ Conversation Summary
```

---

# 99. 最终产品职责

```text
Chat
= 用户主体验

Memory
= 长期连续性

Summary
= 长对话压缩

Prompt Engine
= 上下文控制器

Vision
= 多模态输入

Canon
= 正式世界事实

Story Analyzer
= 后续结构化能力

Workspace
= 高级创作工具
```

---

# 100. AI Agent 执行规则

每个 PR 交给 AI 时：

```text
先检查 main 最新状态
↓
只处理当前 PR 范围
↓
不要顺手进入下一 Phase
↓
补真实测试
↓
运行 targeted tests
↓
运行 typecheck
↓
运行 verify
↓
输出实际结果
```

如果发生高风险变更：

```text
破坏性 Migration
删除数据
改变事实源
改变依赖方向
不可逆 Contract
```

才暂停并重新评估。

---

# 101. 最终验收 Scenario

从全新数据库开始：

```text
1. 打开 /v2
2. 输入角色 Persona
3. 开始故事
4. AI Opening
5. 聊 10 轮
6. 发送图片
7. AI 正确理解图片
8. 用户告诉角色自己的生日
9. 继续聊 100 轮
10. Restart API
11. Restart Worker
12. 继续聊天
13. AI 能记住生日
14. Redis 暂时停止
15. Chat 继续工作
16. Redis 恢复
17. Memory/Summary 任务补执行
18. 聊到 500 Turn
19. Prompt Context 仍在 Budget 内
20. 用户再次询问很早之前的重要信息
21. AI 可以通过 Memory/Summary 正确延续
```

---

# 102. 下一阶段总原则

所有开发决策优先回答：

```text
这个改动会不会缩短用户路径？

这个改动会不会让 Chat 更稳定？

这个改动会不会让 Context 更可控？

这个改动会不会让长期故事更连续？

这个改动是否真的需要现在做？
```

继续遵守：

```text
Chat First
Context Bounded
Memory Async
Structure Lazy
User Path First
```

最终目标不是建立一个越来越复杂的创作后台，而是先确保：

> **一个 Persona 可以自然地发展成一个长期、连续、可记忆、可理解图片、可逐步结构化的互动故事。**
