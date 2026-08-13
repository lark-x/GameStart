# Living Network V2 当前核心业务流程

最后核对：2026-08-13

本文描述当前 V2 已实现的创作者、生成审核、发布和游玩路径。系统边界以 [architecture.md](./architecture.md) 为准；外部服务只在显式配置后调用。旧 V1 社交模拟流程保留在归档资料中，不属于当前产品流程。

## 1. 创建和编辑本地世界

```mermaid
sequenceDiagram
    actor Creator as 创作者
    participant Web as Vue Web /v2
    participant API as Fastify V2 API
    participant UC as Core Use Case
    participant Domain as Domain
    participant DB as SQLite + FTS5

    Creator->>Web: 创建 Starter World 或编辑 Canon
    Web->>API: POST /api/v2/core/worlds/*
    API->>API: Parser 校验 body、revision、idempotency key
    API->>UC: 执行 Canon/Graph/State 命令
    UC->>Domain: 校验不变量和并发版本
    Domain-->>UC: 领域结果或冲突
    UC->>DB: 事务写入 SQLite 事实
    DB-->>Web: 返回当前 revision 和 snapshot
```

World Canon、角色、地点、事实、规则、Narrative Graph 和 Typed State 都写入同一个 SQLite 事实库。FTS5 只提供可重建的本地关键词检索；Redis 不参与业务事实写入。

## 2. 生成候选和审核应用

```mermaid
sequenceDiagram
    actor Creator as 创作者
    participant Web as Web
    participant API as Fastify API
    participant SQLite as SQLite
    participant Redis as BullMQ / Redis
    participant Worker as V2 Worker
    participant AI as 可选 LLM

    Creator->>Web: 预览上下文或创建场景 Job
    Web->>API: POST /api/v2/generation/context-preview
    API->>SQLite: 读取指定 canon revision
    API-->>Web: 返回带来源和 hash 的上下文快照
    Web->>API: POST /api/v2/generation/jobs/scene
    API->>SQLite: Job + pending dispatch 同事务写入
    Worker->>SQLite: 读取并校验 Job
    Worker->>Redis: 幂等派发/消费
    Worker->>AI: 请求结构化输出（显式启用时）
    AI-->>Worker: 不可信原始输出
    Worker->>Worker: 解析、领域校验、stale revision 检查
    Worker->>SQLite: 只提交 pending Candidate
    Creator->>Web: 查看 diff 并 approve/reject/request changes
    Web->>API: POST /api/v2/core/worlds/:id/candidates/.../review
    API->>SQLite: 审核审计；只有 approve 才应用 Canon
```

LLM 未配置时，Core 编辑、Release 和已发布游玩仍可用；生成端点返回能力不可用或使用测试替身，不得绕过 Candidate/Review 边界直接写入 Canon。

## 3. 资产生成和受控媒体

```mermaid
flowchart LR
    Creator[创作者] --> AssetAPI[Asset Job API]
    AssetAPI --> SQLite[(SQLite Job/Candidate)]
    SQLite --> Pump[Dispatch Pump]
    Pump --> Queue[BullMQ / Redis]
    Queue --> Worker[V2 Asset Worker]
    Worker --> Comfy[可选 ComfyUI]
    Worker --> Media[内容哈希媒体根目录]
    Worker --> Candidate[Asset Candidate]
    Candidate --> Review[审核]
    Review --> Library[Approved Asset]
    Web[Web] -->|受控 media:// 引用| MediaAPI[API media route]
    MediaAPI --> Media
```

资产输出必须经过协议、大小、内容类型、哈希和路径校验。Web 只访问 `/api/v2/media/assets/<hash>.<ext>`，不直接访问 ComfyUI；失败任务进入有限重试和明确终态。

## 4. 发布、游玩、保存和导出

```mermaid
sequenceDiagram
    actor Player as 玩家
    participant Web as Web
    participant API as Fastify API
    participant Domain as Release/Runtime Domain
    participant DB as SQLite

    Web->>API: GET /api/v2/core/worlds/:id/releases/preflight
    API->>Domain: 校验图、Typed State、候选和资源引用
    Domain-->>Web: diagnostics + valid
    Web->>API: POST /api/v2/core/worlds/:id/releases
    API->>DB: 写入不可变 Release manifest/content hash
    Player->>Web: 开始游玩
    Web->>API: POST /api/v2/core/runtime/runs
    API->>DB: 创建绑定 release version 的 Run
    Player->>Web: 提交选择 / 保存
    Web->>API: POST /api/v2/core/runtime/runs/:id/choices|saves
    API->>Domain: 只读取 Release，校验 gate/consequence
    API->>DB: 写入 Run、Choice History、Save
    Web->>API: GET /api/v2/core/releases/:id/export
    API-->>Web: JSON 或 Markdown 导出包
```

Pending Candidate 不会进入 Player Runtime。修改工作区不会改变旧 Release 或绑定该 Release 的 Save；运行时只接受固定 Release 版本。

## 5. 外部能力和运行边界

- API 启动时执行 V2 SQLite up migration；Worker 等待 `/api/v2/ready`，不执行 migration。
- Redis 只保存可重建队列和派发状态，队列丢失后可从 SQLite pending dispatch 重建。
- 场景生成、资产生成、LLM、ComfyUI 和 Qdrant 默认关闭或未接入；真实服务验收必须显式启用并单独记录。
- V1 PostgreSQL、旧 `/v1` API、旧 Worker 和旧 Web 流程已冻结，不参与当前默认入口、Compose 或 CI。
