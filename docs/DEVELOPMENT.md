# Living Network 开发原则

状态：当前长期规范（功能闭环优先期）

当前首要目标是让实际页面产生、处理并持久化第一批业务数据。工程完整性服务于这个目标；在首个真实业务闭环完成前，不以任务治理、模块拆分或发布级验收阻塞普通功能开发。

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

测试投入与实际风险匹配，优先验证当前用户路径、真实失败模式和业务不变量，不以测试数量或机械逐行覆盖代替可运行功能。

- Canon、Candidate Review、Release、Runtime/Save、migration、事务、Worker 和外部输出解析只覆盖当前已接通流程需要的成功路径与真实失败模式；不在入口尚未可用时预先补完整矩阵。
- 普通 UI、路由注册、composition root、简单 DTO 映射和声明式胶水按行为风险测试，不为覆盖数字制造无业务价值的分支用例。
- 日常功能改动运行直接受影响模块的 typecheck、一个关键测试，并实际操作本次页面路径。跨包本身不触发全仓验证；PR、main、发布或明确里程碑才运行全仓测试、build、覆盖率及对应集成/E2E。
- 真实 Redis、LLM、ComfyUI 和其他外部服务验收与 Fake 测试分开报告；没有运行就明确说明，不阻塞与其无关的离线核心改动。
- 不通过删除有效测试、弱化关键断言或任意排除关键模块来修绿。覆盖率门槛应保护关键逻辑，而不是迫使普通功能增加低价值防御代码。

所有执行过的命令报告真实退出码；交付说明保持简洁，只列已执行、跳过及其原因，不重复复述未变化的架构规则。

## 8. 开发效率与治理边界

- 默认目标是尽快形成可运行、可验证且产生持久数据的用户闭环。先实现最短 happy path，再处理当前入口实际遇到的失败；架构与边界不作为普通实现前的独立研究阶段。
- 普通功能收到明确目标后直接编码，不要求先写计划、列允许路径、申请中风险确认或等待共享接口先行合并。只有产品语义不明确和不可逆高风险操作才停下来询问。
- 一个功能分支可以纵向修改 Web、API、Worker、Contracts、Domain、Ports 和 Database。分支与提交按用户结果组织，不按内部模块拆分。
- 自动门禁已经覆盖且本次未改变的依赖边界，无需人工重复证明。发现真实越界再修复，不为可能发生的越界预建复杂抽象。
- 每项校验、恢复分支和兼容逻辑都应能对应输入来源、已知故障、领域不变量或明确验收条件；否则默认不增加。
- ADR 记录长期且难以逆转的架构选择，不记录常规实现决策。当前文档只在行为、接口、运行方式或完成状态实际变化时更新。
- 三 AI Gate 0、owner paths、共享文件冻结和 interface request 属于已经结束的并行建设阶段。普通集成后开发不再执行这些流程；未来需要并行冻结时，由任务显式重新启用。

## 9. AI 功能开发

`.ai/modules.json` 继续描述 Core、Generation/Assets、Platform、Web Shell 和 Integration 的依赖关系，供边界检查和代码导航使用，不再作为文件写权限表。现有 `docs/tasks/*.json` 作为历史记录保留，功能闭环优先期不创建新任务记录。

- AI 围绕一个用户可见结果完成纵向改动，不因涉及多个内部模块拆分分支或 PR。
- 共享 Contract、migration、组合入口、顶层导出、依赖和锁文件可随当前功能一起修改，不需要 Interface Request；破坏性 migration、依赖框架变化和不可逆公共接口仍按高风险处理。
- V1 默认只读；只有用户明确要求物理退役或兼容修复时修改。
- `pnpm check:scope` 在当前阶段不执行授权检查；`pnpm check:boundaries` 继续保护依赖方向。
- 日常使用 `pnpm verify:fast` 加本次功能的定向命令；`pnpm verify:release` 仅用于 PR、发布和明确里程碑。

简单规则使用最小 Port Fake/Mock。数据链路功能优先用一个真实临时 SQLite、受控 HTTP 或组合测试证明端到端写入与读取，避免为每层复制 Mock。真实 Redis、LLM、ComfyUI 仍与 Fake 分开报告，但未配置时不阻塞离线核心流程。

功能闭环优先期在实际 Web/API/Worker 环境满足以下条件后结束：创建非测试业务数据、审核候选进入 Canon、生成任务成功或失败状态回写、页面刷新可读取，并在服务重启后保持一致。达到该节点后另行制定轻量治理规则，不自动恢复历史流程。
