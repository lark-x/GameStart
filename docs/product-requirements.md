# Living Network V2 产品需求

最后核对：2026-08-13

Living Network V2 是一个本地优先的 AI 互动游戏脚本创作、审核、发布和游玩平台。它服务于希望自己定义世界、控制 AI 输出并游玩版本化互动故事的创作者和玩家。

## 产品原则

- 创作者拥有世界 Canon、叙事图和 Typed State 的最终控制权。
- AI 是不可信的协作工具，只能产生带来源、版本和校验结果的候选或临时内容。
- 只有审核后的内容才能进入 Canon；只有通过 preflight 的 Canon 才能形成不可变 Release。
- 玩家运行绑定 Release，存档绑定 Release version；工作区后续修改不能改变既有游玩结果。
- SQLite 支持本地离线核心路径；Redis、LLM、ComfyUI 和 Qdrant 都不是核心编辑、发布和已发布游玩的硬依赖。

## 当前 P0 能力

| 能力 | 当前状态 |
| --- | --- |
| 创建本地 Story World | 已实现，HTTP API 和 Web Starter World |
| Canon（世界、角色、地点、事实、规则、时间线） | 已实现，SQLite + revision/idempotency |
| Narrative Graph（Arc、Scene、Choice、入口和诊断） | 已实现 |
| Typed State（变量、初始值、delta/gate 校验） | 已实现 |
| Generation Context 与场景 Job | 已实现，外部 LLM 默认关闭 |
| Scene Candidate 审核和应用 | 已实现，approve 才改变 Canon |
| Asset Job、媒体哈希和 Asset Candidate 审核 | 已实现，外部 ComfyUI 默认关闭 |
| Release preflight、不可变 manifest 和导出 | 已实现，支持 JSON/Markdown |
| Player Runtime、选择、Save/Restore | 已实现，运行绑定 Release |
| V2 Worker、派发、重试和租约恢复 | 已实现，Redis 只用于可重建队列 |
| V2 Web 创作者工作区 | 已实现，HTTP 默认、Mock 显式启用 |

## 核心用户路径

1. 创作者创建世界，编辑 Canon、Narrative Graph 和 Typed State。
2. 创作者预览生成上下文，提交场景或资产 Job。
3. Worker（外部能力启用时）生成候选；创作者查看 diff、来源和校验信息。
4. 创作者批准候选，或拒绝/要求修改；系统记录审核审计。
5. 创作者运行 Release preflight，创建不可变发布版本并导出。
6. 玩家从该 Release 开始运行，提交选择、保存、恢复并继续游玩。

## 能力边界

| 能力 | 状态与约束 |
| --- | --- |
| LLM 场景生成 | 适配器已接入；真实服务需显式配置和单独验收 |
| ComfyUI 资产生成 | 适配器、Worker 和媒体边界已接入；真实服务需单独验收 |
| FTS5 | V2 本地关键词检索已作为可重建 SQLite 索引接入 |
| Qdrant | Slice D 延期；不得成为核心路径硬依赖 |
| Social Temp | Slice D 延期；不阻塞核心创作/发布/游玩 |
| 认证、TLS、备份恢复和生产监控 | 不属于当前本地 V2 集成验收，需独立产品化任务 |

## 非目标

- 不把 V1 角色社交模拟、旧 `/v1` API 或 PostgreSQL 迁移兼容带回 V2。
- 不做 V1 到 V2 的数据迁移、双写或 shadow read。
- 不让模型、Redis、媒体服务或向量库成为唯一业务事实来源。
- 不在本阶段声称真实 LLM、ComfyUI、Qdrant 或生产安全能力已验收。

当前实现、验证状态和后续路线见 [PROGRESS.md](./PROGRESS.md)；V1 产品愿景和历史任务保留在 Git 历史/归档资料中。
