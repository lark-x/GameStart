# Living Network 开发进度

最后核对：2026-08-17（`codex/integration/v2-authoring-data-chain`）

本文是当前能力、切换状态和验证证据的进度视图。当前架构见 [architecture.md](./architecture.md)，历史 V1 报告不替代当前代码和测试证据。

## 1. 当前阶段

V2 进入六阶段创作闭环集成期：前端信息架构已按“项目、人工创作、AI 场景生成、ComfyUI 素材生成、发布与运行、外部服务”重排；Web 默认使用真实 HTTP API 和 SQLite，不再把 Mock 作为默认产品路径。当前目标是让真实页面、API、Worker 和 SQLite 串成可持续创建数据的纵向闭环。

当前仍处于功能闭环优先期：任务/scope 治理暂停，模块依赖边界继续保留。V1 已冻结并归档，不作为新功能入口。

## 2. 当前能力矩阵

| 能力 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| Narrative Authoring V2 | 已实现 | 故事大纲四级树(Arc/Chapter/Quest/Scene)、Blocks分块剧本编辑器(dialogue/narration/action/command)、Revision单调CAS并发保护与Idempotency Key、Scene Draft状态机防丢失(Navigation Guard与Autosave)、Focus独立沉浸路由、按需加载架构与Canon异步搜索、Quest-Local局部图谱、诊断块级跳转与⌘K全局搜索、候选审核多维度Diff与靶向刷新、全套Workbench专项测试；见 [narrative-authoring.md](./narrative-authoring.md) |
| World Canon | 已实现 | SQLite、revision/idempotency、世界/地点/角色/事实/规则/时间线与 FTS5 |
| Narrative Graph | 已实现 | Arc/Scene/Choice、入口/可达性/引用校验和图诊断 |
| Typed State | 已实现 | 类型化 schema、初始状态、delta preview、gate/consequence 校验 |
| Candidate Review | 已实现 | 场景/资产候选、approve/reject/request changes、审计和原子应用；场景候选归 AI 模块，素材候选归 ComfyUI 模块 |
| Immutable Release | 已实现 | preflight、稳定 content hash、release manifest 与导出 |
| Play Runtime/Save | 已实现 | Release 绑定运行、选择、条件、保存、恢复和版本校验 |
| Generation/Assets API | 已实现 | Job、prepare 预览、上下文快照、资产 Job、受控媒体引用、手动正式素材上传和能力状态；AI 场景预览与 Worker provider 调用共用同一模型请求 builder，ComfyUI 预览展示与 Worker HTTP 提交共用同一 `/prompt` payload builder |
| V2 Worker | 已实现 | SQLite outbox 派发、BullMQ、有限重试、租约恢复、场景候选提交、素材候选提交和本地媒体 |
| Web `/v2` | 已实现 | 中文单语言分组侧栏、独立路由页面、HTTP 默认 adapter、显式 Mock、人工创作/AI/ComfyUI/发布/游玩/导出工作区、旧路由重定向；全局候选审核页已移除，场景/素材候选分别留在 AI 与 ComfyUI 模块 |
| Platform 配置 | 已实现 | V2 SQLite 持久化模型档案、能力绑定、ComfyUI 图片服务、外观主题；API 密钥服务端加密且不回显，能力状态可区分 enabled/configuration/binding/connection |
| 模型调用日志 | 已实现 | Worker 记录脱敏请求/响应、耗时、用量、错误和关联上下文；Web 支持筛选、详情、分页和 30 天清理 |
| 触发器模块 | 边界已建立 | 独立路由和占位页面已提供，触发器引擎按计划后续实现 |
| V1 运行时 | 已冻结 | 归档分支保留；不再作为默认入口、CI 或新功能依赖 |
| LLM/ComfyUI/Qdrant | 可选未验收 | 关闭时 Core 编辑/发布/游玩可用；真实服务需显式配置并单独验收 |

## 3. 已执行验证

最近本地已执行并通过：

- `apps/web/node_modules/.bin/vue-tsc -p apps/web/tsconfig.v2.json --noEmit`：exit 0。
- `node_modules/.bin/tsc -p packages/contracts/tsconfig.json --noEmit`：exit 0。
- `node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`：exit 0。
- `node_modules/.bin/tsc -p apps/worker/tsconfig.json --noEmit`：exit 0。
- `node scripts/check-boundaries.mjs`：exit 0。
- `node scripts/check-task-scope.mjs`：exit 0，功能闭环优先期 scope 治理按预期暂停。
- `node --check scripts/run-with-env.mjs`：exit 0。
- `node scripts/run-with-env.mjs CODEX_E2E_ENV_CHECK=ok -- node -e "if (process.env.CODEX_E2E_ENV_CHECK !== 'ok') process.exit(2)"`：exit 0。
- `node scripts/run-with-env.mjs CODEX_E2E_ENV_CHECK=ok -- pnpm -v`：exit 0，输出 `11.1.2`。
- `git diff --check`：exit 0。

当前仓库包含一条真实 SQLite 集成证明：`integration/v2-authoring-chain.test.ts` 覆盖 API 创建故事、状态、场景、手动素材、发布、运行、存档、导出、Worker 生成场景候选、审核写入 Canon、Worker 生成素材候选、审核写入正式素材库、失败任务可观察，以及服务重启后读取。AI 场景生成请求预览已由 `apps/api/src/v2/generation/plugin.test.ts` 和 `packages/ai/src/v2-scene-generation.test.ts` 增加断言，保证 API prepare 返回的只读模型请求与 Worker 实际 provider 调用使用同一构造函数。ComfyUI 素材生成请求预览已由 `apps/api/src/v2/generation/plugin.test.ts` 和 `apps/worker/src/media.test.ts` 增加断言，保证 API prepare 返回的只读 payload 与 Worker 实际 POST 到 ComfyUI `/prompt` 的 payload 使用同一构造函数。当前 Windows/WSL 混合环境直接执行 Node 集成测试会被 pnpm Linux symlink/workspace 包解析问题挡住；WSL 内部当前没有 `node` 可执行文件；`pnpm` 在执行 workspace 命令前也可能卡在本机 store 状态检查。该问题属于本地工具链阻塞，CI/Linux 环境仍应运行完整验证。

真实 LLM、ComfyUI、Qdrant 和生产级认证/TLS/备份恢复未配置或未执行，不能据此声称已验收；CI 已提供真实 Redis job。

## 4. 当前限制

- Playwright E2E 已改为真实 API/SQLite 人工创作路径，并补充跨平台环境变量启动脚本；当前本机 pnpm store/symlink 问题仍会阻塞实际启动。
- 真实 LLM、ComfyUI、Qdrant 和生产级认证/TLS/备份恢复尚未验收。
- Worker 的真实 Redis round-trip 需要在可用 Redis 环境或 CI lane 中继续验收；Fake/SQLite 测试仍不能替代真实 LLM、ComfyUI 或 Qdrant 证据。
- V1 代码、PostgreSQL 迁移和旧文档仍存在于仓库历史/工作树，后续必须以独立删除任务清理，不能在本切换中误删或误改数据。

## 5. 后续优先顺序

1. 在可用 Linux/CI 工具链中运行 `pnpm test:integration` 和 `pnpm test:e2e`，确认真实 API/SQLite/Worker/Web 路径全部通过。
2. 使用真实或可控本地替身验收阶段 4：AI 场景生成 dispatch、Worker 回写、候选审核入 Canon、刷新读取；prepare 预览与实际 provider request 一致性已接通。
3. 使用真实或可控本地替身验收阶段 5：ComfyUI dispatch、Worker 回写、候选审核入正式素材库、刷新读取；prepare 预览与实际 HTTP payload 一致性已接通。
4. 修复当前 Windows/WSL 下 pnpm workspace symlink 与 store 检查阻塞，或提供稳定 Linux Node 运行环境。
5. 真实 LLM/ComfyUI 与备份恢复验收。
6. Slice D：可重建 Qdrant 索引和 Social Temp。
7. 物理删除 V1 运行时、PostgreSQL 适配与旧入口（另行批准，保留归档和历史 migration）。
8. 产品化安全、认证、监控和发布流程。
