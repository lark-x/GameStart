# Living Network 开发执行契约

本文件是本仓库中面向编码模型和自动化开发代理的根级强制规则。任何任务开始前都必须先确认工作区状态、任务范围与本文件要求；目录内存在更具体的 `AGENTS.md` 时，局部规则在不冲突的前提下补充本文件。

## 1. 权威文档与必读顺序

1. `docs/architecture.md`：当前实现架构的唯一文档事实来源。
2. `docs/DEVELOPMENT.md`：长期开发原则、质量标准和变更纪律。
3. `docs/frontend-development-standard.md`：修改 `apps/web/**` 时必须阅读。
4. `docs/PROGRESS.md`：当前能力、验证状态和待办，不替代代码与测试证据。
5. `docs/decisions/`：已接受的架构决策；变更决策前必须新增或替代 ADR。

`docs/archive/**` 是历史记录，不能作为当前技术选型或完成状态的依据。文档与实现冲突时，先以代码、依赖和测试核实事实，再在同一任务中更新当前文档；不得静默保留冲突。

## 2. 当前架构边界

- 系统保持 TypeScript monorepo、模块化单体 API 和独立 Worker，不因局部需求拆微服务。
- API 使用原生 `node:http`。Fastify、Drizzle、TypeBox、pgvector、Turborepo 和完整 OpenTelemetry 都不是当前既定技术；引入前必须有独立 ADR 和任务授权。
- 依赖方向为：应用层依赖 Contracts、Domain 和 Ports；Database 实现 Ports；运行时入口负责组装 Database、AI 和其他适配器。
- `packages/domain` 不得依赖 Vue、HTTP 框架、数据库、队列、供应商 SDK 或 `packages/ports`。
- `packages/contracts` 不得依赖 Domain、Ports、Database 或应用包。
- `packages/ports` 只定义应用需要的接口，可依赖 Domain/Contracts 类型，不得依赖具体适配器。
- API 请求遵循 Route → Parser → Use Case → Port；路由只处理协议分发，业务规则进入 Use Case 或 Domain。
- PostgreSQL 是持久模式下的业务事实来源，也保存 Worker 心跳和派发状态。Redis 只承担 BullMQ 队列及其可重建运行数据，不保存不可重建的业务事实。
- LLM 与 ComfyUI 是不可信外部适配器。其输出必须经过解析、领域校验、权限检查和幂等控制，不能直接修改关系、资产、世界状态或已发布内容。

## 3. 按改动范围执行

- 修改 API、共享契约或前端调用时，必须同步检查请求/响应类型、解析校验、错误状态和调用方；共享类型优先来自 `packages/contracts`。
- 修改数据库时，必须提供顺序迁移、对应 down migration、仓储实现和迁移/行为测试；服务启动不得自动执行 down migration。
- 修改 Worker 或异步链路时，必须说明幂等键、重试上限、终态、失败恢复和 Outbox/事务边界。
- 修改前端时，必须复用基础组件和语义令牌，覆盖加载、空、失败、禁用、窄屏和无障碍状态；不得新增裸交互控件、硬编码品牌色或 `!important`。
- 修改外部服务调用时，必须保持超时、错误归一化、秘密脱敏、可测试替身和默认测试不访问真实供应商。
- 修改架构、数据流、公共接口、运行方式或完成状态时，必须同步对应的当前文档或 ADR。

## 4. 任务与变更纪律

- 开始前检查未提交改动并保护用户已有工作；只修改任务明确涉及的范围。
- 不顺手引入框架、生产依赖、无关重构或格式化整个仓库。
- 不用 `any`、重复 DTO、跨包相对导入或 Database 兼容导出来规避正确边界。
- 不通过删除测试、弱化断言、降低覆盖率、增加忽略项或把错误改成 warning 来让门禁通过。
- 新功能先明确领域规则、Contract、失败模式和验收标准，再接 UI 或外部服务。
- 大文件中的新增能力优先按既有业务模块落位；不得继续把无关职责堆入公共巨型文件。

## 5. 验证与交付

按变更范围至少执行相关检查，并报告实际退出状态：

- 通用：`pnpm check:boundaries`、`pnpm typecheck`、相关包测试。
- 跨包或发布相关：`pnpm test`、`pnpm build`。
- 前端：`pnpm --filter @living-network/web lint`、`typecheck`、`test`、`build`；交互改动补 Playwright 核心路径。
- 数据库/队列：相关迁移测试和集成测试；真实服务未运行时必须明确说明，不能声称已验收。
- 纯文档：检查链接、术语一致性、`git diff --check` 和变更范围。

“服务能启动”不等于测试通过；Fake/内存测试通过不等于真实 PostgreSQL、Redis、LLM 或 ComfyUI 已验收。交付说明必须区分已执行、跳过和无法执行的验证。
