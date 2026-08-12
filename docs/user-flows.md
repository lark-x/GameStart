# Living Network 当前核心业务流程

最后核对：2026-08-12

本文描述当前已实现的主要用户路径。产品愿景见 [product-requirements.md](./product-requirements.md)，系统边界见 [architecture.md](./architecture.md)。图中的外部服务仅在显式配置后调用。

## 1. 私聊与模型回复

```mermaid
sequenceDiagram
    actor User as 用户
    participant Web as ChatView
    participant API as node:http API
    participant UC as Conversation Use Case
    participant DB as Repository
    participant LLM as Active LLM Provider

    User->>Web: 发送文本/图片/贴纸
    Web->>API: POST /v1/conversations/:id/messages
    API->>UC: 解析请求并校验可信 Actor
    UC->>DB: 校验成员并幂等保存消息
    API-->>Web: 返回已保存消息

    Note over API,LLM: USER → AI 私聊文本可触发自动回复
    API->>DB: 读取角色人设、关系、最近消息和可见记忆
    API->>LLM: 组装 Prompt 并流式请求
    LLM-->>API: 文本增量
    API-->>Web: SSE 增量与结束事件
    API->>DB: 幂等保存 AI 消息
    API->>DB: 可选写入带来源和置信度的派生记忆
```

当前记忆检索使用内存关键词匹配或 PostgreSQL FTS，不包含 pgvector 或 RRF。模型不可用时保留用户消息并提供显式失败/重试路径；默认自动测试不访问真实模型。

## 2. 定时事件与动态输出

```mermaid
flowchart TD
    Trigger["定时窗口 / 创作者派发"] --> Occurrence["Scheduled Occurrence"]
    Occurrence --> Queue["BullMQ Occurrence Queue"]
    Queue --> Executor["Worker Executor"]
    Executor --> Rule["领域规则与输入快照"]
    Rule --> Output["Event Output Planning"]
    Output --> Message["主动消息"]
    Output --> Draft["Moment Draft"]
    Output --> Image["Image Job"]
    Message --> PG[(PostgreSQL)]
    Draft --> Publish["Publication"]
    Image --> ComfyUI["ComfyUI"]
    ComfyUI --> Media["本地媒体存储"]
    Media --> Publish
    Publish --> PG
    PG --> Feed["FeedView"]
```

Occurrence、Execution、消息、动态和图片任务分别持有幂等标识。是否立即发布、等待图片或进入人工审核由领域状态与功能开关决定；不能把规划中的“原子发布”当作所有输出都已具备同一事务的证明。

## 3. 聊天与事件图片

```mermaid
sequenceDiagram
    participant Source as 聊天/事件输出
    participant DB as PostgreSQL
    participant Worker as Image Job Pump
    participant ComfyUI as ComfyUI
    participant Store as MEDIA_ROOT
    participant Target as 消息/动态/相册

    Source->>DB: 创建 QUEUED Image Job
    Worker->>DB: 扫描可处理任务和设置
    Worker->>ComfyUI: HTTP 提交版本化 Workflow
    ComfyUI-->>Worker: WebSocket/历史终态
    Worker->>Store: 下载并校验媒体
    Worker->>DB: 更新成功或失败终态
    DB-->>Target: 暴露 mediaRef 与任务状态
```

角色视觉身份、场景 Prompt、负面词和 Workflow 绑定共同构成图片请求。Worker 校验协议与输出，失败进入可观察、可重试状态；浏览器不直接访问 ComfyUI。

## 4. 创作者事件派发

```mermaid
flowchart TD
    Creator["CreatorDispatchView"] --> Scan["扫描候选"]
    Scan --> Preview["只读影响预览"]
    Preview --> Confirm["确认批次"]
    Confirm --> API["API Use Case"]
    API -->|"事务写入"| Requests[(PostgreSQL Dispatch Requests)]
    Requests --> Pump["Worker Dispatch Pump"]
    Pump -->|"幂等 enqueue"| Redis[(BullMQ / Redis)]
    Redis --> Executor["Worker Executor"]
    Executor --> Result["更新执行与批次状态"]
    Result --> Requests
```

内存模式支持扫描与预览，不允许正式派发。持久模式要求 PostgreSQL、Redis 和活跃 Worker；API 本身不直接调用 BullMQ，Redis 不可用时请求仍保留在 PostgreSQL 中等待恢复。

## 5. 角色切换与可信 Actor

```mermaid
sequenceDiagram
    actor User as 用户
    participant Web as Web
    participant API as node:http API
    participant DB as Repository

    User->>Web: 选择目标角色
    Web->>API: POST /v1/actor-sessions/switch
    Note right of Web: actorSessionId + nextCharacterId
    API->>DB: 读取 Session 与目标角色
    API->>API: 校验世界归属和可信 Actor
    API->>DB: 保存切换后的 ActorSession
    API-->>Web: 返回 ActorSession

    User->>Web: 后续读取或写入
    Web->>API: x-actor-character-id
    API->>API: 校验成员、可见性和操作权限
```

角色切换只表达世界内身份。生产或远程部署仍需真实认证代理，并把外部用户映射到允许扮演的角色。

## 6. Story Graph 创作工作区

```mermaid
flowchart LR
    Creator["ContentSettingsView"] --> API["Story Graph API"]
    API --> UC["Story Graph Use Cases"]
    UC --> Arc["Story Arc"]
    UC --> Node["Story Node"]
    UC --> Edge["Story Edge"]
    UC --> Template["Prompt Template"]
    UC --> Candidate["Memory Candidate"]
    Arc & Node & Edge & Template & Candidate --> Store[(内存或 PostgreSQL)]
    Node --> Preview["Prompt Context Preview"]
    Template --> Preview
    Candidate --> Review["批准/拒绝/合并"]
    Review --> Memory["经审核的 Memory Item"]
```

当前能力是编辑、校验、持久化、Prompt 上下文预览和记忆候选审核。预览不会调用模型；自动生成剧情正文、推进节点或把模型建议直接应用到世界状态尚未实现。
