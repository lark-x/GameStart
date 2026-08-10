# Living Network 核心业务流程

本文档梳理系统 5 条核心用户路径，展示从用户操作到系统响应的完整链路。实线箭头表示同步调用，虚线箭头表示异步/延迟处理。

## 1. 聊天交互

用户在私聊中发送一条消息，经过记忆检索和 LLM 生成后流式返回回复，同时异步写入记忆并可选触发图片生成。

```mermaid
sequenceDiagram
    actor User as 用户
    participant Web as ChatView
    participant API as Fastify API
    participant CO as ConversationOrchestrator
    participant DB as PostgreSQL
    participant LLM as LLM Provider
    participant Queue as BullMQ
    participant Worker as Worker

    User->>Web: 输入消息并发送
    Web->>API: POST /v1/conversations/:id/messages
    API->>DB: 保存用户消息（幂等键）
    API->>CO: 触发对话编排

    CO->>DB: 检索角色人设 + 关系上下文
    CO->>DB: 检索最近消息历史
    CO->>DB: 混合记忆检索（FTS + pgvector）

    CO->>LLM: 组装 Prompt 并流式请求
    LLM-->>CO: 流式文本回复
    CO-->>API: 转发文本增量
    API-->>Web: SSE 推送文本到前端
    Web-->>User: 实时显示回复

    CO->>DB: 保存完整 AI 回复

    Note over CO,Worker: 以下为异步后处理
    CO->>DB: 写入记忆（低置信度标记）
    CO->>Queue: 可选：图片意图 job
    Queue->>Worker: 消费图片任务
```

**关键节点：**
- 幂等键防止重复消息
- 记忆检索三路召回：关键词（FTS）、向量（pgvector）、实体关系，用 RRF 融合
- 图片意图不阻塞文本回复，走异步队列

## 2. 朋友圈动态

事件触发后，Worker 完成从调度到发布的全链路，用户在 Feed 页看到新动态卡片。

```mermaid
flowchart TD
    Trigger["触发源"] -->|"定时事件 / 用户互动 / 创作者手动"| Sch["Worker scheduler"]
    Sch -->|"创建 ScheduledOccurrence\n（带幂等键）"| DB[(PostgreSQL)]

    DB --> Exec["Worker executor"]
    Exec --> Snap["读取角色/关系/世界快照"]
    Snap --> Rule["规则引擎判断"]
    Rule -->|"触发"| Plan["行为规划器\n生成结构化候选行动"]
    Rule -->|"延后/合并/取消"| End["记录状态，结束"]

    Plan --> Validate["领域层校验\n权限边界 + 剧情保护"]
    Validate --> Output["event-outputs 规划输出"]

    Output -->|"发送消息"| Pro["proactive\n创建聊天消息"]
    Output -->|"发布动态"| Draft["创建动态草稿\n文本 + 可选图片任务"]
    Output -->|"生成图片"| IJP["image-job-pump"]

    IJP -->|"提交 ComfyUI"| ComfyUI["ComfyUI 生成图片"]
    ComfyUI -->|"完成回调"| Media["media-storage\n生成缩略图"]
    Media --> Pub["publication\n原子发布 Moment"]

    Draft -->|"无图片时直接发布"| Pub

    Pub --> Feed["用户在 FeedView 看到卡片"]
```

**关键节点：**
- 每个环节都有幂等键，重放不会产生重复动态
- 关闭动态关系开关后，整条链路不修改关系状态
- 图片完成后才原子发布，避免出现无图动态

## 3. 图片生成

无论触发源是什么，图片任务都经过统一的三层 Prompt 组装和 ComfyUI 提交流程。

```mermaid
sequenceDiagram
    participant Source as 触发源
    participant Queue as BullMQ
    participant Pump as image-job-pump
    participant DB as PostgreSQL
    participant ComfyUI as ComfyUI
    participant WS as WebSocket
    participant Store as media-storage
    participant Target as 消息 / 动态

    Source->>Queue: 创建图片 job
    Note right of Source: 聊天意图 / 事件输出 / 创作者手动

    Queue->>Pump: 消费任务
    Pump->>DB: 读取视觉身份层
    Note right of DB: 发型、瞳色、服装基线<br/>LoRA、参考图、负面词
    Pump->>DB: 读取场景层
    Note right of DB: 地点、活动、情绪、同框人物
    Pump->>DB: 读取镜头模板层
    Note right of DB: 景别、角度、光线、画幅

    Pump->>Pump: Prompt Builder 合并三层\n记录 Workflow 版本
    Pump->>ComfyUI: HTTP 提交版本化 Workflow JSON
    ComfyUI-->>WS: 节点进度事件
    WS-->>Pump: 进度更新（可选转发前端）
    ComfyUI-->>Pump: 输出完成

    Pump->>Pump: 校验输出文件路径和大小
    Pump->>Store: 下载并生成缩略图
    Store->>DB: 保存媒体记录
    Pump->>Target: 关联到消息或动态
```

**关键节点：**
- 三层 Prompt 分离保证角色视觉一致性：身份层（稳定）+ 场景层（变化）+ 镜头层（构图）
- ComfyUI 输出限制在配置目录，服务端验证路径穿越
- 不直接用自由文本维持角色一致性

## 4. 创作者事件派发

创作者通过调度台批量管理待处理事件，系统扫描候选、预览影响后执行派发。

```mermaid
flowchart TD
    Creator["创作者打开 CreatorDispatchView"] --> Scan["扫描候选事件"]

    Scan --> Filter["过滤规则"]
    Filter --> A["逾期 PENDING"]
    Filter --> B["未来 7 天内"]
    Filter --> C["FAILED 可重试"]
    Filter --> D["超 15 分钟 RUNNING"]
    Filter --> E["启用的 MANUAL"]
    Filter -->|"排除"| X["disabled / completed / cancelled"]

    A & B & C & D & E --> List["展示候选列表"]

    List --> Select["创作者选择事件 + 操作"]
    Select --> Preview["预览影响（只读）\n不调用 LLM / ComfyUI"]
    Preview --> Confirm["批量确认派发"]

    Confirm --> API["POST 派发请求"]
    API --> DB[(PostgreSQL)]
    DB -->|"PENDING_DISPATCH"| Pump["dispatch-pump"]
    Pump -->|"BullMQ 幂等 job"| Worker["Worker executor"]
    Worker --> Execute["执行事件输出"]
    Execute --> Result["COMPLETED / FAILED"]
    Result --> DB
    DB --> Status["创作者查看批次状态"]
```

**关键节点：**
- 扫描是纯本地计算，不调用外部服务
- 预览是只读的，不会触发 LLM 或 ComfyUI
- 内存模式支持扫描和预览，但禁用正式派发

## 5. 角色切换

用户在不同角色间切换，改变自己在世界中的身份、可见范围和互动权限。

```mermaid
sequenceDiagram
    actor User as 用户
    participant Web as Web 前端
    participant API as Fastify API
    participant DB as PostgreSQL

    User->>Web: 选择目标角色
    Web->>API: POST /v1/actor-sessions/switch
    Note right of Web: body: { characterId, storyWorldId }

    API->>DB: 查询目标角色是否存在
    API->>API: 校验角色是否属于当前世界
    API->>DB: 创建 ActorSession
    Note right of DB: 存储：角色ID、可见范围、会话上下文

    API-->>Web: 返回 ActorSession

    Note over User,DB: 后续请求携带 actorCharacterId

    User->>Web: 发送消息 / 查看动态 / 编辑内容
    Web->>API: 请求（携带 actorCharacterId）
    API->>API: 校验：该角色是否有权限执行此操作
    API->>DB: 按角色可见范围过滤数据
    API-->>Web: 返回该角色可见的结果
```

**关键节点：**
- 角色切换不是身份认证，远程部署前需额外增加认证层
- 所有写操作必须携带 actorCharacterId，服务端强制校验
- 可见范围影响：聊天身份、动态可见性、关系查询范围、记忆检索范围
