# Living Network 系统架构

## 概述

Living Network 是一个 AI 角色生活模拟与社交叙事系统，采用 TypeScript monorepo 架构。前端为 Vue 3 + Vite 单页应用，后端为 Fastify 模块化单体 API 加独立 BullMQ Worker，数据层使用 PostgreSQL（关系数据 + 全文检索 + pgvector）、Redis（队列与缓存）和本地文件存储，外部接入 OpenAI-compatible / Anthropic LLM 和 ComfyUI 图片生成服务。

## 整体架构

```mermaid
graph TD
    subgraph Web["Vue Web App（:4173）"]
        Feed["朋友圈 FeedView"]
        Chat["聊天 ChatView"]
        Rel["关系 RelationshipsView"]
        Cal["日历 CalendarView"]
        Assets["资源 AssetsView"]
        CD["调度台 CreatorDispatchView"]
        CC["内容管理 ContentSettingsView"]
        CV["视觉工作台 CreatorVisualView"]
        CI["集成设置 CreatorIntegrationsView"]
        CL["交互日志 InteractionLogsView"]
        Admin["管理 AdminView"]
    end

    subgraph API["Fastify API（:3001）"]
        App["app.ts 核心路由"]
        CO["conversation-orchestrator\n对话编排"]
        CE["creator-events\n创作者事件"]
        IL["interaction-logging\n交互日志"]
        AR["auto-reply\n自动回复"]
        AII["auto-image-intent\n图片意图"]
        MS["media-store\n媒体服务"]
    end

    subgraph Worker["BullMQ Worker"]
        Sch["scheduler\n事件调度"]
        Exec["executor\n执行器"]
        EO["event-outputs\n事件输出规划"]
        Pro["proactive\n主动消息"]
        Pub["publication\n动态发布"]
        IJP["image-job-pump\n图片任务"]
        DP["dispatch-pump\n创作者派发"]
        OP["outbox-publisher\n事件出站"]
        ILW["interaction-log\n日志记录"]
    end

    subgraph Storage["数据存储"]
        PG["PostgreSQL\n关系数据 + FTS + pgvector"]
        Redis["Redis\nBullMQ 队列 + 缓存"]
        FS["本地文件存储\n图片/媒体/缩略图"]
    end

    subgraph External["外部服务"]
        LLM["LLM Provider\nOpenAI-compatible / Anthropic"]
        ComfyUI["ComfyUI\n图片生成"]
    end

    Web -->|"HTTP + SSE"| API
    API -->|"BullMQ Job"| Redis
    Redis -->|"Job 消费"| Worker
    API -->|"读写"| PG
    API -->|"缓存"| Redis
    Worker -->|"读写"| PG
    Worker -->|"文件写入"| FS
    Worker -->|"HTTP 流式"| LLM
    Worker -->|"HTTP + WebSocket"| ComfyUI
    API -->|"HTTP 流式"| LLM
    API -->|"Outbox 事件"| PG
    PG -->|"Outbox 轮询"| OP
```

## 包依赖关系

```mermaid
graph LR
    contracts["packages/contracts\nAPI Schema 与事件契约"]
    domain["packages/domain\n领域模型与规则"]
    database["packages/database\nDrizzle Schema、迁移、仓储"]
    ai["packages/ai\nLLM Provider 适配"]
    config["packages/config\n环境变量与共享配置"]
    api["apps/api\nFastify API"]
    worker["apps/worker\nBullMQ Worker"]
    web["apps/web\nVue 前端"]

    contracts --> domain
    domain --> database
    database --> ai
    ai --> api
    ai --> worker
    config --> api
    config --> worker
    contracts --> api
    contracts --> worker
    database --> api
    database --> worker

    web -.->|"HTTP 调用"| api
```

## Worker 内部模块

```mermaid
graph TD
    Sch["scheduler\n创建 ScheduledOccurrence"]
    Exec["executor\n读取快照、规则引擎校验"]
    EO["event-outputs\n规划文本/消息/图片输出"]

    Sch --> Exec --> EO

    EO -->|"发送消息"| Pro["proactive\n主动消息"]
    EO -->|"发布动态"| Pub["publication\n动态发布"]
    EO -->|"生成图片"| IJP["image-job-pump\nComfyUI 图片任务"]

    DP["dispatch-pump\n处理创作者派发链"] -->|"BullMQ"| Exec

    OP["outbox-publisher\n轮询领域事件 Outbox"] -->|"触发"| Sch
    OP -->|"触发"| Pro

    ILW["interaction-log\n全链路日志"] -.->|"记录"| Exec
    ILW -.->|"记录"| IJP
    ILW -.->|"记录"| Pub
```

## 数据存储

| 存储 | 内容 |
|------|------|
| **PostgreSQL** | 角色、关系、世界观、事件定义、调度执行、聊天消息、动态、记忆、交互日志、图片任务、创作者派发请求、LLM/ComfyUI 配置（加密）、视觉工作流模板、表情包 |
| **Redis** | BullMQ 任务队列（事件执行、图片生成、派发）、Worker 心跳、幂等键去重 |
| **本地文件系统** | ComfyUI 生成的原始图片、缩略图、表情包资源、媒体文件（`MEDIA_ROOT` 目录） |

## 外部服务集成

### LLM Provider

- **接入方式**：通过 `packages/ai/src/provider.ts` 统一适配，支持 OpenAI-compatible（含 DeepSeek、MiMo 等）和 Anthropic 原生 Messages API
- **配置方式**：Web 创作中心集成设置页可创建多个 LLM 档案，手动选择当前生效档案；API Key 以 AES-256-GCM 加密存入 PostgreSQL
- **降级策略**：未配置档案时回退到 `.env` 中的 `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY`；LLM 不可用时聊天返回确定性占位回复，事件输出跳过 AI 生成改用系统通知

### ComfyUI

- **接入方式**：通过 HTTP 提交版本化 Workflow JSON，WebSocket 监听节点进度
- **配置方式**：Web 创作中心视觉设置页配置地址、超时、默认工作流版本；视觉工作流页管理与 ComfyUI 节点字段匹配的模板
- **降级策略**：ComfyUI 不可用时图片任务进入 FAILED 状态，支持手动重试；聊天和事件的文本功能不受影响
