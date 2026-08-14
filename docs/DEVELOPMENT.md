# Living Network 开发原则

状态：当前长期规范（V2 正式运行时）

当前架构以 [architecture.md](./architecture.md) 为准，完成状态以 [PROGRESS.md](./PROGRESS.md) 为准，执行规则以根目录 [AGENTS.md](../AGENTS.md) 为准。ADR-0006、`docs/v2/common-baseline.md` 和 V2 主计划定义 V2 的目标边界。

## 1. 产品与工程目标

Living Network 是本地优先的 AI 互动游戏创作、审核、发布和游玩系统。创作者维护 Canon、Narrative Graph 和 Typed State；模型只提交可追踪候选；审核后的内容进入不可变 Release；玩家运行绑定 Release 并可保存/恢复。

工程目标是让状态变化可解释、可验证、可重放、可审计，并保持 SQLite 离线可用和外部服务可替换。

## 2. 架构原则

- 保持模块化单体 Fastify API 与独立 Worker，不因局部需求拆微服务。
- SQLite + FTS5 是 V2 唯一业务事实来源；Redis 只保存可重建 BullMQ 状态；Qdrant 只保存可重建向量索引。
- Domain 保存无框架业务规则，不依赖 HTTP、数据库、队列、UI、供应商 SDK 或 Ports。
- Contracts 是跨进程共享类型来源；Ports 是应用需要的最小能力；Adapters 实现 Ports。
- HTTP 层只负责协议，Use Case 负责应用编排，Domain 负责不变量。
- 长任务返回 Job/Candidate，不让请求无限等待生成或派发。
- 所有外部生成结果先解析、校验、审计，再决定是否进入候选或正式事实。

V1 的 PostgreSQL、旧 `node:http` API 和旧 `/v1` Contract 已冻结，仅作为归档和后续删除任务的对象，不得在新 V2 功能中依赖或复活。

## 3. 一致性、幂等与异步任务

- 具有副作用的命令必须有稳定 idempotency key；相同载荷可重放，冲突载荷明确失败。
- 并发编辑使用 revision/条件写保护。
- 审核和应用必须记录 reviewer、时间、原因、来源 revision 和 resulting revision。
- Worker 使用有限重试、租约恢复和明确终态；永久错误不能伪装成成功。
- SQLite 事实写入与 outbox 派发记录保持同一事务边界；队列丢失可由 SQLite 重建。
- 媒体输入校验协议、大小、内容类型、内容哈希和受控引用，拒绝路径穿越。

## 4. API 与 Contract

- API 请求遵循 Route → Parser → Use Case → Port → Adapter。
- Parser 拒绝未知字段、非法枚举和越界输入；Route 不复制业务规则。
- API、Worker、Web 共用 `packages/contracts`，不得复制同义 DTO。
- 错误响应必须区分非法输入、资源不存在、冲突、能力未配置和内部错误。
- `/api/v2` 是当前公共 API 前缀；旧 Web 页面路径只做退役重定向，旧 `/v1` API 不是兼容目标。

## 5. 数据库、AI 与外部服务

- V2 SQLite migration 必须顺序执行，并有对应 down 和 migration/行为测试；服务启动不自动执行 down。
- 仓储映射验证数据库值，不能静默接受坏行。
- LLM/ComfyUI 默认测试使用 Fake/注入 Fetch；真实验收必须显式开关并单独报告。
- 关闭 LLM、ComfyUI 或 Qdrant 时，Core 编辑、发布和已发布游玩仍应可用。
- 秘密不能进入前端状态、候选正文、Prompt 记录或明文日志。
- 模型 API 档案由 V2 Platform 边界统一管理；API 密钥只能通过 `INTEGRATION_SECRET_KEY` 加密后进入 SQLite，Web 只能提交新密钥或看到 `hasApiKey`。模型调用日志默认保留 30 天，写入前必须脱敏并限制请求/响应大小。

## 6. Web

修改 `apps/web/**` 时遵守 [frontend-development-standard.md](./frontend-development-standard.md)：复用组件和语义令牌，覆盖加载/空/失败/禁用/窄屏/无障碍状态，不新增裸控件、硬编码品牌色或 `!important`。

## 7. 测试与完成标准

测试投入与实际风险匹配，优先验证用户路径、真实失败模式和业务不变量，不以测试数量或机械逐行覆盖代替正确性。

- Canon、Candidate Review、Release、Runtime/Save、migration、事务、Worker 幂等和外部输出解析等关键逻辑，成功与失败行为应完整覆盖；目标是关键行为路径 100%，不是要求每个生产文件逐行 100%。
- 普通 UI、路由注册、composition root、简单 DTO 映射和声明式胶水按行为风险测试，不为覆盖数字制造无业务价值的分支用例。
- 低风险改动运行最小相关检查；普通业务改动运行受影响包测试和 typecheck；高风险、跨包、发布或合并节点才运行全仓测试、build、覆盖率及对应集成/E2E。
- 真实 Redis、LLM、ComfyUI 和其他外部服务验收与 Fake 测试分开报告；没有运行就明确说明，不阻塞与其无关的离线核心改动。
- 不通过删除有效测试、弱化关键断言或任意排除关键模块来修绿。覆盖率门槛应保护关键逻辑，而不是迫使普通功能增加低价值防御代码。

所有执行过的命令报告真实退出码；交付说明保持简洁，只列已执行、跳过及其原因，不重复复述未变化的架构规则。

## 8. 开发效率与治理边界

- 默认目标是尽快形成可运行、可验证的用户闭环。架构与边界用于阻止具体风险，不作为普通实现前的独立研究阶段。
- 自动门禁已经覆盖且本次未改变的依赖边界，无需人工重复证明。发现真实越界再修复，不为可能发生的越界预建复杂抽象。
- 每项校验、恢复分支和兼容逻辑都应能对应输入来源、已知故障、领域不变量或明确验收条件；否则默认不增加。
- ADR 记录长期且难以逆转的架构选择，不记录常规实现决策。当前文档只在行为、接口、运行方式或完成状态实际变化时更新。
- 三 AI Gate 0、owner paths、共享文件冻结和 interface request 属于已经结束的并行建设阶段。普通集成后开发不再执行这些流程；未来需要并行冻结时，由任务显式重新启用。
