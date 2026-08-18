# GameStart V2.3 Memory Evaluation Phase 1 改造计划

> 目标：把“事实提取”从现有 Memory 实现中独立出来，建立统一 Fact Layer，并让至少两套 Memory Engine 在相同事实输入下并行运行，从而为后续客观评估不同长期记忆方案建立基础。
>
> 本阶段不是要立即决定“哪套 Memory 最好”，而是先保证以后能够公平、低成本、可重复地比较不同方案。

---

## 1. 阶段目标

本阶段只解决以下问题：

1. 将“原始事实定义”放到 Memory Engine 之前，形成唯一 Fact Extraction 入口。
2. 建立不可变、可重放的 Fact Ledger。
3. 将当前 Memory 实现改造成第一个 Memory Engine：`builtin_structured`。
4. 新增第二个 Memory Engine：`builtin_hybrid`。
5. 两个 Engine 消费完全相同的 Fact Assertions。
6. 支持 Primary / Shadow 模式并行写入。
7. Prompt Engine 只消费统一 `RetrievedMemory[]`，不感知具体 Memory Engine。
8. 建立最小 Memory Evaluation Harness，能够比较两套 Engine 的召回质量、时延、成本和错误率。
9. 保持现有 Chat 主链路可用，不因为 Shadow Engine、Embedding 或评估任务阻塞用户回复。
10. 为未来 `temporal_graph` / Mem0 / Graphiti / Custom Engine 留出扩展点，但本阶段不正式实现第三套生产级 Engine。

---

## 2. 非目标

本阶段明确不做：

- 不引入 Neo4j / FalkorDB 等正式 Graph DB。
- 不直接接入完整 Graphiti Pipeline。
- 不直接将 Mem0 作为主 Memory 实现。
- 不实现复杂的 Memory 插件市场。
- 不把 Prompt Engine 拆成独立微服务。
- 不重写 Chat、Canon、Story Analyzer。
- 不把 Fact Assertion 当作 Canon。
- 不允许每个 Memory Engine 自己重新解释同一批原始消息。
- 不要求一次性迁移所有旧 Memory 数据到新方案。
- 不要求本阶段完成最终 Memory 方案选型。

---

# 3. 当前问题

当前 Memory 处理主要集中在 Worker Maintenance Pump 中：

```text
Raw Chat Messages
        ↓
memory_extract
        ↓
LLM 直接提取 MemoryCandidate
        ↓
查找已有 Memory
        ↓
Exact Dedup / Similar Search
        ↓
memory_consolidate
        ↓
keep_both / ignore / merge / supersede
        ↓
v2_memories
```

当前实现的问题不是“不能用”，而是对于后续 Memory 方案评估存在几个结构性限制。

### 3.1 Extraction 与 Memory Strategy 耦合

目前 LLM 直接输出：

```text
profile
preference
relationship
episodic
world_fact
```

然后立即进入当前 Memory 的去重、Consolidation 和持久化流程。

这意味着：

```text
事实是什么
+
Memory 如何管理
```

仍然属于同一条 Pipeline。

以后如果直接增加：

```text
Structured Memory
Hybrid Memory
Graph Memory
Mem0
```

并让每套 Engine 从 Raw Messages 自己提取，则无法公平比较 Memory 本身。

---

## 3.2 无法区分“Extraction 好”还是“Retrieval 好”

例如用户说：

```text
“我最近不怎么喝拿铁了，现在更喜欢手冲。”
```

如果三套 Engine 各自提取：

```text
Engine A
→ 用户喜欢手冲

Engine B
→ 用户不喜欢拿铁

Engine C
→ 用户的咖啡偏好由拿铁转为手冲
```

最终 Engine C 表现更好，并不能说明 Graph / Structured / Hybrid 更好。

有可能只是它第一次事实提取更准确。

因此本阶段必须建立：

```text
Raw Messages
      ↓
唯一 Fact Extractor
      ↓
统一 FactAssertions
      ↓
多个 Memory Engines
```

---

# 4. 核心架构原则

以下原则视为本次改造的强约束。

## 4.1 Fact Layer 必须位于 Memory Engine 之前

标准流程：

```text
Raw Chat Messages
        │
        ▼
┌──────────────────────────────┐
│       Fact Extractor         │
│ 唯一事实解释 / 结构化入口     │
└──────────────┬───────────────┘
               │
               ▼
        Fact Assertions
               │
               ▼
        Immutable Fact Ledger
               │
               ▼
         Memory Dispatcher
               │
       ┌───────┴─────────┐
       ▼                 ▼
builtin_structured   builtin_hybrid
       │                 │
       ▼                 ▼
 Structured Store     Hybrid Store
```

---

## 4.2 Raw Message / Fact Assertion / Memory 必须区分

### Raw Message

真实聊天内容。

```text
USER:
“我最近不怎么喝拿铁了，现在更喜欢手冲。”
```

这是最终来源。

### Fact Assertion

系统对原始消息做出的统一事实解释。

例如：

```json
{
  "assertionId": "fact:xxx",
  "subject": {
    "entityType": "user",
    "entityId": "user:local"
  },
  "predicate": "preferred_coffee",
  "object": {
    "type": "text",
    "value": "pour_over"
  },
  "kind": "preference",
  "changeHint": "replaces_previous",
  "confidence": 0.96,
  "importanceHint": 0.7,
  "sourceMessageIds": ["message:152"]
}
```

Fact Assertion：

- 不是 Memory。
- 不是 Canon。
- 不表达某个 Engine 的状态。
- 不带 `active / superseded`。
- 不带 Retrieval Score。
- 不带 Embedding。
- 不带 Graph Edge ID。

### Memory

某个 Engine 对 Fact Assertions 进行管理之后的内部状态。

例如：

#### Structured Engine

```text
preferred_coffee = latte
status = superseded

preferred_coffee = pour_over
status = active
```

#### Hybrid Engine

```text
Assertion #50  用户喜欢拿铁
Assertion #152 用户更喜欢手冲
```

两条都保存，通过 Retrieval + Recency / Change Signal 决定返回哪一条。

---

## 4.3 Fact Ledger 是 Memory 系统真正的可重放输入

Fact Extraction 完成后，结果必须持久化。

任何 Memory Engine：

```text
挂掉
重装
算法升级
索引丢失
重新测试
```

都应该能够通过 Fact Ledger 重建，而不需要重新扫描全部 Raw Chat 或再次调用 Extraction LLM。

---

## 4.4 多 Engine 并行不得影响 Chat

Chat 主链：

```text
User
↓
API
↓
Prompt Engine
↓
Model
↓
Assistant Reply
```

不得等待：

```text
Hybrid Embedding
Shadow Engine
Benchmark
External Memory
Graph Build
```

Memory 写入继续保持后台异步。

---

## 4.5 Prompt Engine 不感知具体 Memory Engine

Prompt Engine 只能接收统一结构：

```ts
RetrievedMemory[]
```

不允许出现：

```text
if engine === "structured"
if engine === "hybrid"
if engine === "graph"
```

Prompt Engine 的职责仍然是：

```text
Context Assembly
Prompt Template
Token Budget
Priority
Cropping
Structured Output
Trace
```

Memory Engine 的职责是：

```text
Consume Fact
Store
Mutation
Retrieve
Rank
Forget / Rebuild
```

---

# 5. 本阶段目标架构

```text
                         Raw Chat Messages
                                │
                                ▼
                       Maintenance Scheduler
                                │
                                ▼
                    ┌──────────────────────┐
                    │    Fact Extractor    │
                    │   fact.extract:v1    │
                    └──────────┬───────────┘
                               │
                               ▼
                     FactAssertionBatch
                               │
                               ▼
                      Immutable Fact Ledger
                               │
                               ▼
                     Memory Event Dispatcher
                               │
               ┌───────────────┴────────────────┐
               │                                │
               ▼                                ▼
      builtin_structured                builtin_hybrid
          Primary                          Shadow
               │                                │
       Structured Store            Append-only + FTS/Vector
               │                                │
               └───────────────┬────────────────┘
                               │
                         Retrieval Layer
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
         Primary Retrieval             Evaluation Retrieval
                │                             │
                ▼                             ▼
        RetrievedMemory[]             Engine Comparison
                │
                ▼
           Prompt Engine
                │
                ▼
             Chat Model
```

---

# 6. Fact Layer 设计

## 6.1 新增 FactAssertion Contract

建议新增到 V2 Contracts / Domain 中。

参考结构：

```ts
export type V2FactKind =
  | "profile"
  | "preference"
  | "relationship"
  | "episodic"
  | "world_fact";

export type V2FactScopeType =
  | "user"
  | "world"
  | "character"
  | "conversation";

export type V2FactEntityType =
  | "user"
  | "character"
  | "location"
  | "item"
  | "faction"
  | "concept";

export type V2FactObjectType =
  | "text"
  | "number"
  | "boolean"
  | "entity";

export type V2FactChangeHint =
  | "new"
  | "restate"
  | "corrects"
  | "replaces_previous"
  | "unknown";

export interface V2FactAssertion {
  readonly assertionId: string;
  readonly batchId: string;

  readonly storyWorldId: V2StoryWorldId;
  readonly conversationId: V2ConversationId;

  readonly scopeType: V2FactScopeType;
  readonly scopeId: string;

  readonly subject: {
    readonly entityType: V2FactEntityType;
    readonly entityId: string;
    readonly label?: string;
  };

  readonly predicate: string;

  readonly object: {
    readonly type: V2FactObjectType;
    readonly value: string | number | boolean;
    readonly entityId?: string;
  };

  readonly kind: V2FactKind;
  readonly text: string;
  readonly changeHint: V2FactChangeHint;

  readonly confidence: number;
  readonly importanceHint: number;

  readonly sourceMessageIds: readonly V2MessageId[];
  readonly observedAt: string;
  readonly extractorVersion: string;
}
```

---

## 6.2 Fact Assertion 保留自然语言 `text`

即使引入 `subject / predicate / object`，仍必须保留 `text`。

原因：

1. Structured Engine 可以主要使用 SPO。
2. Hybrid Engine 可以使用自然语言做 FTS / Embedding。
3. Prompt Engine 最终通常需要自然语言。
4. 调试和人工评估更直观。
5. Predicate Schema 后续变化时，不会丢失原始语义。

---

## 6.3 Fact 不等于绝对事实

故事系统中可能存在：

```text
角色说谎
用户猜测
传闻
梦境
错误信息
```

本阶段至少预留：

```ts
readonly epistemicStatus?:
  | "asserted"
  | "observed"
  | "reported"
  | "inferred"
  | "unknown";
```

本阶段如果实现成本较高，可先默认 `asserted`，但 Contract 不应把所有 Assertion 当 Canon Truth。

---

# 7. Fact Batch

不要一条 Fact 一个独立 Extraction Job。

建立 `V2FactAssertionBatch`。

建议字段：

```text
batch_id
story_world_id
conversation_id
from_message_id
to_message_id
source_message_ids_json
source_hash
extractor_version
status
created_at
completed_at
```

其中 `source_hash` 用于保证：

> 同样一批原始消息 + 同样 Extractor Version 不重复 Extraction。

建议 Dedupe：

```text
fact_extract:{conversationId}:{fromMessageId}:{toMessageId}:{extractorVersion}
```

---

# 8. Fact Extractor

## 8.1 将当前 Memory Extraction 改造成 Fact Extraction

当前 Worker 中的 `handleMemoryExtract()` 后续职责应拆分。

原本：

```text
Messages
↓
Prompt
↓
MemoryCandidate
↓
Exact Match
↓
Search Similar
↓
Memory Consolidate
↓
Persist Memory
```

改成：

```text
Messages
↓
Fact Extraction Prompt
↓
FactAssertions
↓
Validate
↓
Persist Fact Batch + Assertions
↓
Dispatch Engines
```

Fact Extractor 不允许：

```text
查询 v2_memories
判断 Memory 冲突
Supersede
Merge
调用具体 Memory Engine Repository
```

---

## 8.2 Prompt Engine 统一管理 Fact Extraction Prompt

不要继续在 Worker 中硬编码 Memory Extraction Prompt。

建议 Prompt Engine 新增：

```text
fact/
├── build-fact-extraction-prompt.ts
├── parse-fact-extraction-output.ts
└── fact-extraction-schema.ts
```

Worker 只负责：

```text
获取 Source Messages
↓
调用 Prompt Builder
↓
调用 Model Provider
↓
调用 Structured Parser
↓
写 Fact Ledger
```

---

## 8.3 Extractor Version

第一版：

```text
fact.extract:v1
```

后续升级：

```text
fact.extract:v2
```

不修改历史 Assertions。

Benchmark 必须能够指定 `extractorVersion`，确保不同 Engine 比较时事实输入完全一致。

---

# 9. 数据库改造

建议新增以下表。

## 9.1 `v2_fact_batches`

建议字段：

```sql
batch_id TEXT PRIMARY KEY,
story_world_id TEXT NOT NULL,
conversation_id TEXT NOT NULL,
from_message_id TEXT NOT NULL,
to_message_id TEXT NOT NULL,
source_message_ids_json TEXT NOT NULL,
source_hash TEXT NOT NULL,
extractor_version TEXT NOT NULL,
status TEXT NOT NULL,
created_at TEXT NOT NULL,
completed_at TEXT
```

建议唯一约束：

```sql
UNIQUE (
  conversation_id,
  from_message_id,
  to_message_id,
  extractor_version
)
```

---

## 9.2 `v2_fact_assertions`

建议字段：

```sql
assertion_id TEXT PRIMARY KEY,
batch_id TEXT NOT NULL,
story_world_id TEXT NOT NULL,
conversation_id TEXT NOT NULL,
scope_type TEXT NOT NULL,
scope_id TEXT NOT NULL,
subject_entity_type TEXT NOT NULL,
subject_entity_id TEXT NOT NULL,
subject_label TEXT,
predicate TEXT NOT NULL,
object_type TEXT NOT NULL,
object_value_json TEXT NOT NULL,
object_entity_id TEXT,
kind TEXT NOT NULL,
text TEXT NOT NULL,
change_hint TEXT NOT NULL,
confidence REAL NOT NULL,
importance_hint REAL NOT NULL,
source_message_ids_json TEXT NOT NULL,
observed_at TEXT NOT NULL,
extractor_version TEXT NOT NULL,
created_at TEXT NOT NULL
```

建议索引：

```text
conversation_id
story_world_id
scope_type + scope_id
subject_entity_id
predicate
kind
batch_id
extractor_version
```

---

## 9.3 `v2_memory_engine_offsets`

用途：每套 Engine 独立追踪消费进度。

```sql
engine_id TEXT NOT NULL,
scope_key TEXT NOT NULL,
last_batch_id TEXT,
last_assertion_sequence INTEGER,
updated_at TEXT NOT NULL,
PRIMARY KEY (engine_id, scope_key)
```

第一版 `scope_key` 可使用：

```text
conversation:{conversationId}
```

以后扩展 World / User Scope。

---

## 9.4 `v2_memory_engine_runs`

用于评估与诊断：

```text
run_id
engine_id
batch_id
status
started_at
completed_at
input_assertion_count
output_memory_count
llm_call_count
embedding_call_count
duration_ms
error_code
```

---

# 10. Memory Engine Contract

新增统一 Memory Engine 接口。

```ts
export interface V2MemoryEngineCapabilities {
  readonly acceptsFactAssertions: boolean;
  readonly acceptsRawMessages: boolean;
  readonly supportsMutation: boolean;
  readonly supportsEmbedding: boolean;
  readonly supportsEntityIndex: boolean;
  readonly supportsTemporalFacts: boolean;
}

export interface V2MemoryEngine {
  readonly id: string;

  capabilities(): V2MemoryEngineCapabilities;

  consume(input: {
    readonly batch: V2FactAssertionBatch;
    readonly assertions: readonly V2FactAssertion[];
  }): Promise<V2MemoryConsumeResult>;

  retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]>;

  rebuild?(input: V2MemoryRebuildRequest): Promise<void>;
}
```

注意：普通 Managed Memory Engine 接口中不要放 `extract()`。

因为 Fact Extraction 已位于 Memory Engine 之前。

未来如果支持 Native Full Pipeline Engine，可增加另一种 Capability：

```text
acceptsRawMessages = true
```

但不用于 Fair Benchmark。

---

# 11. 统一 Retrieval Contract

建议：

```ts
export interface V2MemoryQuery {
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly characterId?: string;
  readonly query: string;
  readonly limit: number;
  readonly now?: string;
}

export interface V2RetrievedMemory {
  readonly memoryId: string;
  readonly engineId: string;
  readonly scopeType: V2FactScopeType;
  readonly scopeId: string;
  readonly kind: V2FactKind;
  readonly text: string;
  readonly relevance: number;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceAssertionIds: readonly string[];
  readonly sourceMessageIds: readonly string[];
  readonly observedAt?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
}
```

Chat / Prompt Engine 不允许读取 Engine 私有结构。

---

# 12. Memory Engine A：`builtin_structured`

这是当前 Memory 的演进版本，也是第一套 Primary Engine。

主要思想参考：

- 当前 GameStart Structured Memory。
- LangMem 的 Memory State / Mutation 思想。
- Letta 的 Core / Persistent State 思想。

## 12.1 Engine A 的职责

消费 `FactAssertion[]` 后维护：

```text
Current Structured State
+
Episodic Memory
+
Relationship Memory
```

## 12.2 Slot Key

对于适合结构化状态的事实，生成：

```text
scope
+
subject
+
predicate
```

例如：

```text
user:local
preferred_coffee
```

第一版可使用：

```text
slot_key = scopeType + ":" + scopeId + ":" + subjectEntityId + ":" + predicate
```

## 12.3 Mutation 策略

优先使用确定性规则：

```text
不存在 Slot
→ ADD

同 Slot + 同 Value
→ NOOP / reinforce

同 Slot + changeHint=replaces_previous
→ SUPERSEDE

同 Slot + changeHint=corrects
→ SUPERSEDE

复杂 Relationship / Episodic
→ KEEP / APPEND

确实无法确定
→ 可进入 LLM Mutation Resolver
```

原则：

> LLM Consolidation 从“默认路径”降级为“困难冲突的 fallback”。

## 12.4 当前 `v2_memories`

本阶段尽量复用现有 `v2_memories`，避免大规模破坏。

可新增：

```text
engine_id
source_assertion_ids_json
slot_key
```

或者新建 `v2_structured_memories`。

Agent 应以“最小风险 + 清晰边界”决定，不为少一个表牺牲长期结构。

## 12.5 Structured Retrieval

第一版继续使用：

```text
FTS5
+
Importance
+
Recency
+
Scope
```

但增加 Scope Filter，不再只依赖 StoryWorld 全局搜索。

---

# 13. Memory Engine B：`builtin_hybrid`

第二套 Engine 作为 Shadow。

主要参考：

- Mem0 的 ADD-oriented Memory 思想。
- Hybrid Retrieval：BM25 / Semantic / Entity。
- 多路候选 + rerank 的 RAG 思路。

## 13.1 Engine B 写入策略

原则：

> Append-first，尽量不在写入阶段删除旧 Fact。

```text
Fact
↓
Append Store
↓
FTS Index
↓
Embedding Index
↓
Entity Index
```

第一版不做 LLM Consolidation。

## 13.2 Hybrid Store

建议建立 `v2_hybrid_memories`：

```text
memory_id
assertion_id
story_world_id
conversation_id
scope_type
scope_id
subject_entity_id
predicate
text
importance
confidence
observed_at
embedding_ref / vector data
created_at
```

## 13.3 Retrieval Signals

第一版至少：

```text
FTS / BM25
+
Recency
+
Importance
+
Scope
+
Entity Metadata
```

如果项目当前已有可靠本地 Embedding 能力，再增加：

```text
Semantic Embedding
```

如果 Embedding 依赖尚不稳定，可拆为：

```text
Hybrid v0 = FTS + Entity + Metadata
Hybrid v1 = FTS + Embedding + Entity + Metadata
```

不得因为 Embedding 阻塞 Phase 1 主体交付。

## 13.4 Hybrid Rerank

不要一开始写死复杂权重。

初始配置可以类似：

```ts
{
  keyword: 0.25,
  semantic: 0.30,
  entity: 0.15,
  scope: 0.10,
  importance: 0.10,
  recency: 0.10
}
```

所有子分数统一归一化到 `0..1`。

权重只作为起点，后续交给 Evaluation Harness 调参。

---

# 14. Primary / Shadow 模式

新增 Memory Profile / Binding 的最小实现。

本阶段不要求复杂 UI。

配置至少支持：

```yaml
memory:
  primary: builtin_structured

  engines:
    builtin_structured:
      mode: primary

    builtin_hybrid:
      mode: shadow
```

### primary

```text
Consume Fact
+
Write
+
Retrieve
+
真实进入 Chat Prompt
```

### shadow

```text
Consume Fact
+
Write
+
允许 Benchmark Retrieval
+
不进入真实 Chat Prompt
```

未来可预留 `mirror` / `disabled`。

---

# 15. Memory Fan-out

Fact Batch 落库之后，不直接在同一事务里执行全部 Engine。

正确：

```text
Fact Extraction Job
↓
Persist Fact Batch
↓
Commit
↓
Dispatch Engine Jobs
├─ memory_engine_consume:builtin_structured
└─ memory_engine_consume:builtin_hybrid
```

错误：

```text
Fact Extract Job
↓
Structured
↓
Hybrid
↓
Embedding
↓
所有完成
↓
Fact Job 才完成
```

## 15.1 Engine Job Dedupe

建议：

```text
memory_engine_consume:{engineId}:{batchId}
```

必须可重试。

## 15.2 幂等要求

同一个 `engineId + batchId` 重复消费不得产生重复 Memory。

Engine A 应基于 `sourceAssertionId / slot mutation` 保证幂等。

Engine B 的 `assertion_id` 应 UNIQUE。

---

# 16. Prompt Engine 边界

本阶段 Prompt Engine 只需要两项改造。

## 16.1 将 Fact Extraction Prompt 收归 Prompt Engine

新增：

```text
fact.extract
```

任务。

## 16.2 Chat Prompt 继续只接统一 Memory Context

目标：

```text
Memory Runtime
↓
primaryEngine.retrieve()
↓
V2RetrievedMemory[]
↓
mapToPromptMemoryContext()
↓
Prompt Engine
```

Prompt Engine 不知道：

```text
Structured
Hybrid
Mem0
Graph
```

---

# 17. 与当前系统兼容方案

本阶段不能一次性切断现有 Memory。

建议使用 Bridge 迁移。

## Stage A：Fact Layer 上线，但保持旧 Memory 输出

```text
Messages
↓
Fact Extractor
↓
Fact Ledger
↓
Legacy Structured Adapter
↓
现有 v2_memories
```

用户行为不变。

## Stage B：将 Legacy Adapter 正式命名为 `builtin_structured`

将当前 Memory 包装进 `V2MemoryEngine`。

Chat Primary 切到：

```text
builtin_structured
```

输出应与改造前基本等价。

## Stage C：新增 `builtin_hybrid`

```text
Fact Ledger
↓
Structured Primary
+
Hybrid Shadow
```

两套同时积累数据。

## Stage D：开启评估

Shadow Engine Retrieval 不进入 Chat，只记录：

```text
query
engine
result IDs
scores
latency
```

---

# 18. Maintenance Job 类型建议

当前已有：

```text
memory_extract
memory_consolidate
conversation_summary
story_analyze
```

本阶段建议逐步演进成：

```text
fact_extract
memory_engine_consume
conversation_summary
story_analyze
```

`memory_consolidate`：

- 暂时保留给 `builtin_structured` fallback。
- 不再作为整个 Memory 系统的通用 Job。
- 后续可变为 Engine 私有内部任务。

兼容期内不要立即删除旧 Job Type，确保历史 Pending Job 可处理或安全迁移。

---

# 19. Memory Evaluation Harness

这是本阶段不可省略的内容。

如果只是让两个 Engine 同时跑，而没有统一评估，很快仍会变成主观判断。

## 19.1 Evaluation Case

建议：

```ts
interface MemoryEvaluationCase {
  caseId: string;
  storyWorldId: string;
  conversationId: string;
  query: string;

  expected: {
    requiredAssertionIds?: string[];
    expectedText?: string[];
    forbiddenAssertionIds?: string[];
  };

  category:
    | "stable_fact"
    | "preference_change"
    | "relationship"
    | "episodic"
    | "long_range"
    | "scope"
    | "contradiction"
    | "historical";
}
```

## 19.2 第一批标准测试场景

必须覆盖：

### Stable Fact

```text
Turn 20:
我的生日是 3 月 12 日。

Turn 500:
我的生日是什么？
```

### Preference Change

```text
Turn 30:
我喜欢拿铁。

Turn 240:
最近更喜欢手冲。

Query:
我现在更喜欢什么咖啡？
```

### Old Preference

```text
Query:
我以前是不是喜欢拿铁？
```

### Relationship Change

```text
Turn 80:
Alice 不信任用户。

Turn 300:
Alice 开始信任用户。

Query:
Alice 现在信任我吗？
```

### Episodic

```text
Turn 100:
用户送 Alice 一条蓝色围巾。

Turn 700:
我以前送过她什么？
```

### Scope Isolation

```text
World A:
角色害怕猫。

World B:
角色喜欢猫。
```

不得串数据。

### Character Scope

```text
Alice 知道秘密 X。
Bob 不知道秘密 X。
```

Bob 的 Context 不得召回 Alice-only Memory。

### Contradiction

```text
Turn 20:
门是红色。

Turn 100:
前面的信息错了，门其实是蓝色。
```

---

# 20. 评估指标

至少采集：

```text
Recall@5
Recall@10
MRR
Current State Accuracy
Contradiction Rate
Scope Leakage Rate
Provenance Accuracy
Retrieval P50
Retrieval P95
Write P50
Write P95
LLM Calls / 100 Turns
LLM Tokens / 100 Turns
Embedding Calls / 100 Turns
Storage Growth / 1000 Turns
```

## 20.1 最终回答质量

除 Retrieval 指标外，保留最终回答 Benchmark：

```text
同一个 Conversation Snapshot
          │
     ┌────┴────┐
     ▼         ▼
Structured   Hybrid
     │         │
RetrievedMemory[]
     │         │
     └────┬────┘
          ▼
同一个 Prompt Engine
          ▼
同一个 Chat Model
          ▼
Answer
```

只有 Memory Context 不同。

---

# 21. Evaluation 日志

建议新增：

```text
v2_memory_retrieval_traces
```

字段：

```text
trace_id
engine_id
conversation_id
query_hash
query_text 可选，仅 debug 模式
result_memory_ids_json
result_assertion_ids_json
retrieval_ms
candidate_count
returned_count
created_at
```

默认只存 query hash；debug / benchmark 环境可保存原文。

---

# 22. Replay 能力

必须增加开发级命令：

```text
memory:replay
```

目标：

```text
Fact Ledger
↓
选择 Engine
↓
从头重建
```

例如：

```bash
pnpm memory:replay --engine=builtin_hybrid --conversation=<id>
```

或者采用项目现有 CLI 约定的等价形式。

要求：

- 不修改 Raw Messages。
- 不重新调用 Fact Extraction。
- 可以清空该 Engine 派生状态后重建。
- 不能影响其他 Engine。

---

# 23. 目录建议

Agent 可按当前 monorepo 实际结构调整，但依赖方向应保持。

```text
packages/
├── contracts/
│   └── v2/
│       └── fact/
├── domain/
│   └── v2/
│       ├── fact/
│       └── memory/
├── ports/
│   └── v2/
│       ├── fact/
│       └── memory-engine/
├── database/
│   └── src/v2/
│       ├── fact/
│       └── memory/
└── ai/
    └── prompt-engine/
        └── fact/

apps/
├── api/
│   └── src/v2/
│       └── memory-runtime/
└── worker/
    └── src/v2/
        ├── fact/
        └── memory/
            ├── dispatcher
            ├── builtin-structured
            └── builtin-hybrid
```

不要为了完全匹配目录树而大规模搬现有代码。

核心要求是：

```text
Contracts
↓
Domain / Ports
↓
Adapters
↓
API / Worker Orchestration
```

边界清晰即可。

---

# 24. 分 PR 实施计划

建议不要一个超大 PR 一次完成。

## PR 1 — Fact Contracts + Ledger

目标：建立 Fact Layer 的数据模型和持久化能力。

任务：

- 新增 Fact Contracts。
- 新增 Fact Domain。
- 新增 Fact Repository Port。
- 新增 SQLite Migration。
- 新增 `v2_fact_batches`。
- 新增 `v2_fact_assertions`。
- 新增 Repository。
- 新增基本 CRUD / listAfter / getBatch。
- 新增 Dedupe / UNIQUE。
- 增加单元测试。

验收：

```text
Fact Batch 可以持久化
Fact Assertions 可以查询
相同 Source Range + Version 不重复
Source Message IDs 可追溯
```

此 PR 不改变真实 Chat 行为。

## PR 2 — Fact Extractor

目标：将“事实定义”从 Memory Engine 中抽离。

任务：

- Prompt Engine 新增 `fact.extract`。
- 提取当前 Worker Memory Extraction Prompt。
- 新增严格 Structured Output Parser。
- Worker 新增 Fact Extraction Handler。
- 结果只写 Fact Ledger。
- 保留 Legacy Memory Adapter，继续生成现有 Memory。
- 引入 `extractorVersion`。
- 增加 Source Citation 验证。

验收：

```text
Raw Messages
→ Fact Assertions
→ Legacy Memory

Chat 行为与改造前基本一致
```

## PR 3 — Memory Engine Abstraction + Structured Engine

目标：当前 Memory 正式成为 `builtin_structured` Engine。

任务：

- 新增 `V2MemoryEngine`。
- 新增 `V2MemoryQuery`。
- 新增 `V2RetrievedMemory`。
- 包装当前 Memory Mutation / Store / Retrieval。
- Engine 输入从 MemoryCandidate 改为 FactAssertion。
- 增加 Engine Offset。
- 增加 Engine Run。
- Primary Binding 指向 `builtin_structured`。
- API 通过 Memory Runtime 调用 Primary Engine。
- Prompt Engine 保持无 Engine 感知。

验收：

```text
Chat Primary Retrieval 由 builtin_structured 提供
旧 Memory 功能无明显回归
```

## PR 4 — Engine Fan-out + Shadow Runtime

目标：支持多个 Engine 并行消费。

任务：

- 新增 Dispatcher。
- Fact Batch 完成后 fan-out Engine Consume Jobs。
- Engine Job Dedupe。
- Engine 独立 Retry / Cursor。
- Primary / Shadow 配置。
- Shadow 失败不影响 Primary。
- Primary 失败也不得阻塞当前 Chat Reply，只影响后续 Memory 完整性。

验收：

```text
同一个 Fact Batch
Structured 收到
Hybrid 可收到
各自 Cursor 独立
```

## PR 5 — `builtin_hybrid`

目标：建立第二套真正不同的 Memory 策略。

任务：

- Append-only Store。
- Assertion ID 唯一写入。
- FTS Index。
- Scope Filter。
- Entity / Subject / Predicate Metadata Index。
- Recency / Importance Ranking。
- 如果 Embedding 基础设施稳定，加入 Semantic Retrieval。
- 不做 LLM Consolidation。

验收：

```text
Hybrid 可以独立 rebuild
Hybrid 可以独立 retrieve
Hybrid 不影响真实 Chat
```

## PR 6 — Evaluation Harness

目标：开始真正比较两个 Engine。

任务：

- 建 Evaluation Case Schema。
- Retrieval Benchmark Runner。
- Retrieval Trace。
- 计算 Recall@K / MRR / Scope Leakage。
- Latency Metrics。
- Engine Cost Counters。
- 添加第一批标准 Fixtures。
- 支持同 Query 对两个 Engine 同时执行。

验收示例：

```text
Case: preference_change_001

builtin_structured
Recall@5: 1
CurrentState: PASS
Latency: 6ms

builtin_hybrid
Recall@5: 1
CurrentState: PASS
Latency: 14ms
```

---

# 25. 测试要求

## Fact Layer

必须测试：

```text
相同 batch dedupe
invalid sourceMessageId
invalid kind
invalid confidence
empty Fact
duplicate Assertion
extractorVersion isolation
transaction rollback
```

## Structured Engine

必须测试：

```text
new → ADD
same → NOOP
replaces_previous → SUPERSEDE
corrects → SUPERSEDE
episodic → KEEP
scope isolation
engine idempotency
replay
```

## Hybrid Engine

必须测试：

```text
append-only
duplicate assertion rejected
FTS retrieval
entity metadata retrieval
scope isolation
recency ranking
importance ranking
rebuild
```

如果有 Embedding：

```text
embedding failure fallback FTS
embedding timeout 不影响 Worker 主队列
```

## Fan-out

必须测试：

```text
Primary success + Shadow success
Primary success + Shadow fail
Primary success + Shadow retry
Worker crash after Fact commit before Engine dispatch
duplicate dispatch
Engine A lagging behind Engine B
restart resumes from offset
```

---

# 26. 可靠性原则

本阶段继续沿用现有 Durable Job / Lease 思想。

必须保证：

```text
Fact Ledger 先 commit
↓
Engine 消费后发生
```

Fact Ledger 是新的可恢复边界。

## 26.1 Backlog 自动追赶

新的 Engine Consumer 必须：

```text
重启后
↓
检查自己的 offset
↓
继续消费未处理 Fact Batch
```

不能依赖“必须有新的 Chat Message 才继续”。

---

# 27. 负载控制

多个 Engine 并行本身不是主要风险。

主要风险来自重复 LLM 与 Embedding。

本阶段强制：

```text
Fact Extraction
→ 只执行一次
```

Structured + Hybrid 都消费同一 Fact。

如果当前 Queue 支持优先级，建议：

```text
Chat Critical          100
Primary Memory          60
Summary                 50
Story Analyzer          40
Shadow Memory           20
Benchmark               10
```

如果当前队列不支持优先级，至少限制：

```text
Shadow Engine 并发
Embedding 并发
Evaluation 并发
```

不要为了本阶段大规模重写 Queue。

---

# 28. Feature Flags

所有新能力必须可关闭。

建议：

```text
V2_FACT_LAYER_ENABLED
V2_MEMORY_ENGINE_RUNTIME_ENABLED
V2_MEMORY_HYBRID_SHADOW_ENABLED
V2_MEMORY_EVALUATION_ENABLED
```

或者采用项目统一配置系统中的等价实现。

迁移阶段要求：关闭新功能后，现有主流程仍能正常运行。

---

# 29. 数据迁移策略

当前已有 `v2_memories` 不要直接删除。

第一阶段继续保留 Legacy Memory。

对于历史数据：

### 默认方案：不自动回填

从启用 Fact Layer 的时间点开始积累。

优点：风险最低。

### 可选方案：开发环境 Historical Fact Backfill

```text
旧 Messages
↓
Fact Extractor
↓
Fact Ledger
```

会产生 LLM 成本，因此生产迁移默认不自动 backfill，只提供手动工具。

---

# 30. 观察性与诊断

至少增加：

```text
Fact Extraction Trace
Engine Consume Trace
Engine Offset
Retrieval Trace
```

日志必须能回答：

```text
这批消息是否已经 Extract？
生成了多少 Fact？
Structured 到哪个 Batch？
Hybrid 到哪个 Batch？
某条 Memory 来自哪些 Assertions？
Assertion 来自哪些 Messages？
某次 Query 为什么返回这几条？
```

---

# 31. 本阶段完成定义

当以下条件全部满足，可以认为：

```text
Memory Evaluation Infrastructure Phase 1 = DONE
```

### Architecture

- Fact Layer 已位于 Memory Engine 之前。
- 所有 Managed Engine 消费统一 Fact Assertions。
- Prompt Engine 不知道具体 Memory Engine。
- Fact Ledger 可 replay。

### Engine

- `builtin_structured` 可作为 Primary 正常运行。
- `builtin_hybrid` 可作为 Shadow 正常运行。
- 两个 Engine 数据相互隔离。
- 两个 Engine 有独立消费进度。

### Reliability

- Shadow 挂掉不影响 Chat。
- Worker 重启后 Shadow 自动追赶。
- Fact Batch 幂等。
- Engine Consume 幂等。
- Retry 不产生重复数据。

### Evaluation

- 可以用同一 Query 同时查询两个 Engine。
- 可以计算基础 Recall / MRR。
- 可以输出 Retrieval Latency。
- 可以检测 Scope Leakage。
- 至少存在一批固定 Evaluation Fixtures。

### Regression

- Chat Reply 正常。
- Summary 正常。
- Story Analyzer 正常。
- Vision 正常。
- Prompt Engine Budget 正常。
- 现有数据库升级路径正常。

---

# 32. Agent 执行规则

执行本计划时遵守以下规则：

1. 先审查当前 `main`，不要假设本文中的具体路径和类名完全未变化。
2. 优先复用当前 V2 Contracts / Domain / Ports / Repository / UnitOfWork 架构。
3. 不得为了新 Memory Engine 引入跨层 Repository 直接调用。
4. Fact Extractor 不允许依赖具体 Memory Engine。
5. Memory Engine 不允许修改 Raw Messages。
6. Prompt Engine 不允许读取 Memory 数据库。
7. Shadow Engine 不允许影响真实 Prompt Context。
8. 不得让不同 Engine 分别调用 Fact Extraction LLM。
9. 不得把 Fact Assertion 自动升级为 Canon。
10. 每个 PR 保证 typecheck / lint / unit tests / build。
11. 新 Migration 必须测试 fresh DB / current V2 DB upgrade / repeated startup。
12. 不删除现有 Memory 表，直到新架构经过稳定验证。
13. 如果实现过程中发现当前 V2.2 仍有 Correctness Blocker，优先修复 blocker，再继续 Memory V2。
14. 不在本阶段提前实现复杂 Graph Engine。
15. 任何新增 LLM 调用都必须说明“为什么不能复用统一 Fact Extraction”。

---

# 33. 最终预期

```text
                        Raw Messages
                             │
                             ▼
                    Unique Fact Layer
                             │
                             ▼
                       Fact Ledger
                             │
                 ┌───────────┴───────────┐
                 ▼                       ▼
          Structured Engine        Hybrid Engine
               Primary                 Shadow
                 │                       │
                 └───────────┬───────────┘
                             │
                    Memory Evaluation
                             │
                             ▼
                  Objective Benchmark
```

之后再进入下一阶段：

```text
Phase 2
→ 扩充 Benchmark 数据集
→ Structured vs Hybrid 长周期评估
→ 调整 Retrieval 参数
→ 分析真实 Conversation Trace
```

只有当 A/B 结果显示：

```text
人物关系
时间变化
历史查询
复杂实体关系
```

仍然明显不足时，再启动：

```text
Phase 3
→ temporal_graph Shadow Engine
```

届时可进一步参考 Graphiti 的 Temporal Knowledge Graph 思想，但仍优先消费 GameStart 已统一生成的 Fact Assertions，而不是重新定义原始事实。

---

# 34. 本阶段最重要的验收问题

Agent 完成后，应能够明确回答：

```text
Q1:
同一批 Chat Messages 是否只进行了一次 Fact Extraction？

Q2:
Structured 与 Hybrid 是否收到完全相同的 Fact Assertions？

Q3:
关闭 Hybrid 后，Structured 是否可以完全独立工作？

Q4:
Hybrid 崩溃后重启，是否可以从 Fact Ledger 自动追赶？

Q5:
删除 Hybrid 派生数据后，是否可以不重新调用 LLM，直接从 Fact Ledger 重建？

Q6:
Prompt Engine 是否完全不知道当前使用的是 Structured 还是 Hybrid？

Q7:
同一条 Query 是否可以同时获得两个 Engine 的 Retrieval 结果并比较？

Q8:
能否判断某条 Retrieved Memory 来源于哪个 Fact Assertion，以及哪个 Raw Message？

Q9:
Memory Engine 的性能比较是否排除了 Fact Extraction 差异？

Q10:
新增第三套 Engine 时，是否不需要修改 Chat / Prompt Engine 主流程？
```

十项全部为“是”，说明本阶段架构目标基本完成。
