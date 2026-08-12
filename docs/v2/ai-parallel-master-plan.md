# Living Network V2 三 AI 并行开发主文档

状态：已审查，待维护者分配执行

最后审查：2026-08-12

适用范围：明确标记为 V2 replacement 的开发

唯一执行计划：本文替代 `three-ai-execution-plan.md`；公共产品与架构边界仍以 `common-baseline.md` 和 ADR-0006 为准。

## 1. 结论与执行方式

V2 可以交给三个 AI 在三个独立分支开发，但不能直接从只有文档的当前基线同时开工。当前方案存在共享目录重叠、核心 contract 尚未冻结、候选审核事务归属不清和最终一次性集成过大的风险。

采用“短串行骨架 + 三分支并行 + 分阶段集成”方式：

```text
当前文档基线
  -> Gate 0：V2 最小骨架提交（短串行，不实现业务功能）
      -> AI-1：核心领域 / SQLite 核心事实 / Release / Runtime
      -> AI-2：Generation / Worker / Assets / Search / Social Temp
      -> AI-3：Web / Mock Adapter / Web E2E
          -> Slice A 集成：离线创作 + 发布 + 游玩
          -> Slice B 集成：LLM 候选生成 + 审核
          -> Slice C 集成：资产生成
          -> Slice D 集成：向量检索与临时社交（可延期）
```

Gate 0 只冻结可并行工作的接口和目录，不算第四个开发任务。建议由 AI-1 先完成 Gate 0，维护者验收并记录提交 SHA 后，再从该 SHA 创建三个实现分支。三个 AI 不从彼此的业务提交派生。

## 2. 产品目标与范围

V2 是本地优先的 AI 互动游戏脚本创作、审核、发布和游玩系统。

创作者维护世界、角色、地点、时间线、事实、规则、叙事图和类型化状态。AI 与 ComfyUI 只产生候选；候选通过审核和领域校验后才能修改工作区 canon。发布版本不可变，玩家运行与存档固定绑定发布版本。

本轮必须形成的主闭环：

1. 创建并编辑 canon。
2. 编辑和校验 Scene / Choice / Gate / Consequence 图。
3. 生成并审核场景候选。
4. 创建不可变 release。
5. 基于 release 游玩、选择、保存和恢复。
6. 导出 JSON + Markdown。

资产生成是第二优先级。Qdrant、临时聊天、crossover 和 social feed 是增强范围，不得阻塞主闭环，也不得成为首个可集成版本的完成条件。

明确非目标：

- 不迁移 V1 数据，不兼容 V1 API。
- 不引入微服务、远程多租户、完整 RBAC 或桌面包装。
- 不让 pending candidate、临时会话或外部输出直接进入 release/save。
- 不在本轮顺带清理全部 V1 技术债。

## 3. 目标架构与实现约定

- TypeScript pnpm workspace，Node.js 24，保持模块化单体 API 和独立 Worker。
- Web 使用 Vue 3 + Vite + Pinia，复用当前 UI primitives、主题和语义令牌。
- V2 API 使用 Fastify，统一前缀为 `/api/v2`。
- API 依赖路径保持 Route -> Parser -> Use Case -> Port -> Adapter。
- SQLite + FTS5 是唯一业务事实来源；Redis 只保存 BullMQ 可重建队列数据；Qdrant 只保存可重建向量索引。
- SQLite 使用 Node 24 内置 `node:sqlite`，Gate 0 不引入 ORM；若实际验证发现能力不满足，必须先新增 ADR，不能由某个并行分支私自更换驱动。
- SQLite 每个进程独立连接，启用 foreign keys、WAL 和有限 busy timeout；migration runner 由 API/显式命令执行，Worker 不自行迁移。
- 运行时解析沿用显式 `unknown -> parser -> typed value` 方式；本轮不引入 TypeBox/Zod 等新 schema 库。Fastify schema 只负责协议级约束，领域不变量仍在 Domain。
- `packages/domain` 不依赖 Fastify、Vue、SQLite、BullMQ、Qdrant、供应商 SDK 或 `packages/ports`。
- `packages/contracts` 不依赖 Domain、Ports、Database 或应用包；跨进程 ID、DTO、错误码和 wire 类型只定义一次。
- `packages/ports` 可依赖 Domain/Contracts，只描述 Use Case 需要的最小能力，不建立新的 Repository Bag。
- AI、ComfyUI、文件、队列和 Qdrant 都是适配器；默认测试使用 Fake，不访问真实服务。

## 4. 核心领域与唯一责任

| 能力 | 权威 owner | 核心规则 |
| --- | --- | --- |
| World Canon | AI-1 | 世界内引用、修订版本、删除约束 |
| Narrative Graph | AI-1 | 图合法性、入口、可达性、Gate/Consequence |
| Typed State | AI-1 | schema、初始值、delta 校验与应用 |
| Canon Candidate Review | AI-1 | 通用状态机、基线版本、防过期、批准写 canon 的事务 |
| Generation Job/Context | AI-2 | 上下文快照、任务状态、来源与重试 |
| Release | AI-1 | 只读取已审核 canon、manifest 完整性、不可变 |
| Play Runtime/Save | AI-1 | 只读 release + save，save 绑定 release version |
| Assets | AI-2 | Workflow/seed/media provenance、资产候选审核和资产库事务 |
| Search Index | AI-2 | SQLite FTS5 回退、Qdrant 可重建 |
| Social/Chat Temp | AI-2 | 临时记录与候选边界，不自动进入 canon |
| Web Experience | AI-3 | 创作者与玩家交互、状态、可访问性 |

候选审核的责任边界必须固定：

- AI-2 通过 Gate 0 冻结的 `CanonSnapshotReaderPort` 读取指定 revision 的生成上下文；它不能直接读取 AI-1 repository。
- AI-2 创建 generation job 和 context snapshot，并通过 Gate 0 冻结的 `CandidateSubmissionPort` 提交 pending canon candidate；canon 候选事实表不由 AI-2 私自建立。
- AI-1 定义通用 Candidate Envelope、审核状态机和 `applyApprovedCandidate` 用例。
- 批准操作由 AI-1 在一个 SQLite 事务中完成：检查 candidate 状态与 `baseCanonRevision`、校验 payload、写入 canon、增加 revision、写审核记录和审计事件。
- AI-2 不直接实现“批准后写 canon”；它只调用 AI-1 暴露的 contract/use-case 边界。
- 基线 revision 已变化时返回明确的 stale candidate 冲突，不自动覆盖。
- Asset Candidate 使用同一套审核状态枚举，但其批准事务由 AI-2 负责，只能写 approved asset/media facts。Release 通过只读 `ApprovedAssetReaderPort` 校验引用，不允许资产审核修改 canon。

## 5. Gate 0：并行前置骨架

### 5.1 负责人和输出

负责人：AI-1，使用临时分支 `codex/v2-bootstrap`。

目标工作量：1 至 2 个 AI 工作日，取决于 contract 评审返工。

完成后维护者记录 `V2_BOOTSTRAP_SHA`，三个实现分支都从该提交创建。

Gate 0 只允许完成：

1. 新增 V2 命名空间和空模块入口，不迁移 V1 业务。
2. 在 `apps/api` 建立 Fastify composition root、`/api/v2/health` 和插件注册接口。
3. 在 `packages/database` 建立 `node:sqlite` connection factory、migration registry 和测试临时库工具。
4. 冻结共享基础 contract：branded ID、时间、分页、错误 envelope、revision、idempotency、job/candidate 基础状态和 `SceneCandidatePayload`。
5. 冻结共享端口：`CanonSnapshotReaderPort`、`CandidateSubmissionPort` 和 `ApprovedAssetReaderPort`；端口只能使用稳定 Domain/Contract 类型。
6. 冻结 Slice A/B 的 wire contract v0：HTTP 方法、路径、请求、响应、错误码与至少一个 fixture；后续允许兼容性增加，不允许分支私自做破坏性更改。
7. 冻结模块插件接口，使 AI-1/AI-2 分别导出 Fastify plugin，由 composition root 组装。
8. 预建各包 V2 顶层 barrel、`core/index.ts`、`generation/index.ts`、Fastify 空插件和 migration 子注册表。顶层入口在 Gate 0 已引用子入口，后续分支只更新自己的子入口也能独立 typecheck。
9. 在 Web 根路由和应用壳建立唯一的 `/v2` 懒加载挂载点，由 `apps/web/src/v2/index.ts` 提供 V2 route records/layout；Gate 0 后 AI-3 只修改 V2 子目录即可访问页面。
10. 建立 contract fixtures 目录，至少包含 world、scene graph、candidate、release、run 的最小示例。
11. 调整各包测试脚本，使 Node test runner 递归包含 `src/v2/**/*.test.ts`，同时保留 V1 测试；不要依赖不同 shell 行为不一致的 `**` 展开，优先使用 Node test discovery 或仓库内显式测试清单；增加 V2 sentinel test 防止 glob/参数错误导致零测试成功。
12. 更新 coverage include/exclude、边界检查和 CI 入口，使 V2 命名空间进入门禁；不通过降低当前覆盖门槛来接纳 V2。
13. 一次性加入 Fastify 依赖并更新 lockfile；并行期默认冻结根依赖。Qdrant 默认使用 HTTP adapter，新增 SDK 必须走接口请求和依赖评审。

建议目录：

```text
apps/api/src/v2/platform/             # Gate 0 后冻结 / 最终集成 owner
apps/api/src/v2/core/                 # AI-1
apps/api/src/v2/generation/           # AI-2
packages/domain/src/v2/shared/        # Gate 0 后冻结
packages/domain/src/v2/core/          # AI-1
packages/domain/src/v2/generation/    # AI-2
packages/contracts/src/v2/shared/     # Gate 0 后冻结
packages/contracts/src/v2/core/       # AI-1
packages/contracts/src/v2/generation/ # AI-2
packages/ports/src/v2/shared/         # Gate 0 后冻结
packages/ports/src/v2/core/           # AI-1
packages/ports/src/v2/generation/     # AI-2
packages/database/src/v2/platform/    # Gate 0 后冻结
packages/database/src/v2/core/        # AI-1
packages/database/src/v2/generation/  # AI-2
apps/web/src/v2/                      # AI-3
```

实际 owner 以第 7 至 9 章为准。上图中的顶层 barrel、`shared`、`platform`、空插件和 registry 在 Gate 0 后全部冻结；注释中的 AI owner 只适用于对应 `core` / `generation` 子目录。

### 5.2 Gate 0 验收

- V1 当前命令仍可运行，V2 空骨架不会改变 V1 默认入口。
- `/api/v2/health` 的注入式 Fastify 测试通过，不占用真实端口。
- `/v2` Web 空壳可访问，且不会触发 V1 store 的世界/角色初始化；V1 现有路由保持不变。
- SQLite 空库 migration up/down、foreign key 和事务回滚测试通过。
- shared contracts/ports 有类型与 parser/Fake 测试，fixtures 能被 Web、API 和 Worker 测试导入。
- 空 core/generation 插件与 migration 子注册表能被 composition root 组装，不需要后续修改共享入口。
- `pnpm install --frozen-lockfile`、`pnpm check:boundaries`、`pnpm typecheck` 和相关测试通过。
- 测试输出能证明 V1 测试与 V2 sentinel test 都被发现；不得以“命令退出 0 但匹配零个 V2 测试”通过 Gate 0。
- Gate 0 未实现 canon CRUD、生成任务、页面或外部服务调用。

未满足 Gate 0 时，不创建三个业务实现分支。

## 6. 并行分支与共享文件规则

从同一个 `V2_BOOTSTRAP_SHA` 创建：

- AI-1：`codex/v2-core-domain-runtime`
- AI-2：`codex/v2-generation-assets`
- AI-3：`codex/v2-web-product`

并行期只读、不得由任一业务分支修改：

- 根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.base.json`
- 各 workspace `package.json` 中 Gate 0 冻结的 V2 test/build scripts、`.github/workflows/ci.yml`
- `apps/api/src/v2/platform/**`
- `apps/web/src/router/index.ts`、`apps/web/src/App.vue` 中 Gate 0 创建的 V2 挂载点
- `packages/domain/src/v2/shared/**`
- `packages/contracts/src/v2/shared/**`
- `packages/ports/src/v2/shared/**`
- `packages/database/src/v2/platform/**`
- 各包 `src/index.ts`、`src/v2/index.ts` 和 Gate 0 创建的 composition/migration registry
- `docs/v2/common-baseline.md`、本文、ADR-0006
- 其他 AI 的命名空间和交付报告

如确需新增依赖或修改共享入口，记录接口请求，由维护者在集成分支处理。不要在三个分支各自修改 lockfile。

文档也按分支隔离：

- AI-1 只写 `docs/v2/deliveries/core-domain-runtime.md` 和 `docs/v2/interface-requests/core-domain-runtime.md`。
- AI-2 只写 `docs/v2/deliveries/generation-assets.md` 和 `docs/v2/interface-requests/generation-assets.md`。
- AI-3 只写 `docs/v2/deliveries/web-product.md` 和 `docs/v2/interface-requests/web-product.md`。

每个开发阶段形成一个可独立审查的 commit，不在一个超大 commit 中交付整个分支。禁止改写公共 contract 来让本分支临时通过；阻塞请求应尽早登记，不等分支完成后再汇总。

## 7. AI-1：核心领域、SQLite 与运行时

### 7.1 Owner paths

- `packages/domain/src/v2/core/**`
- `packages/contracts/src/v2/core/**`
- `packages/ports/src/v2/core/**`
- `packages/database/src/v2/core/**`
- `apps/api/src/v2/core/**`
- `docs/v2/deliveries/core-domain-runtime.md`
- `docs/v2/interface-requests/core-domain-runtime.md`

根级 barrel export 如需变化，在分支交付报告中列出，最终集成统一处理。

### 7.2 分阶段任务

1. Canon：World、Character、Location、Fact、Rule、Timeline、引用与 revision。
2. Graph：Arc、Scene、Choice、Gate、Consequence、入口、可达性和诊断。
3. Typed State：schema、initial state、delta preview/apply、错误定位。
4. Candidate Review：envelope、状态机、stale detection、审核审计和原子应用。
5. SQLite core：migration `0001-0099`、repository、约束、事务和 FTS5 核心表。
6. Core API：Canon/Graph/State/Candidate Review/Release/Runtime，使用 Fastify plugin 导出。
7. Release：preflight、manifest、内容哈希/版本、创建后不可变。
8. Runtime：start/load scene/submit choice/save/load，确定性状态推进与幂等重放。
9. Export：从明确的 workspace revision 或 release 导出 JSON + Markdown。

### 7.3 强制规则

- 写 canon 使用 optimistic concurrency（`expectedRevision`）；命令重试使用 idempotency key。不要机械要求每个纯读取或天然幂等 PUT 都携带幂等键。
- 同一 idempotency key + 相同 payload 返回原结果；相同 key + 不同 payload 返回 409。
- release 只能引用通过审核且在目标 revision 中存在的内容。
- runtime 不查询工作区表、pending candidate、generation job 或临时社交表。
- save 记录 release ID/version、当前位置、typed state、choice history 和必要校验信息。

### 7.4 不做

- 不实现 LLM、ComfyUI、BullMQ consumer、Qdrant 和 Web 页面。
- 不复用 V1 `DomainRepositories` 作为 V2 入口。
- 不负责 AI-2 的 generation/asset migration。

### 7.5 验收

- Domain 覆盖成功、边界、失败、跨世界、过期候选和输入不可变。
- SQLite 覆盖空库 migration、约束、事务回滚、并发 revision 冲突和重开恢复。
- API 覆盖解析、404/409/422、幂等重放和错误 envelope。
- Release immutability、runtime replay、save version mismatch 和 export 测试通过。
- 报告实际执行的 boundaries/typecheck/test/build；外部服务均不应是本分支前提。

## 8. AI-2：生成、Worker、资产与可选增强

### 8.1 Owner paths

- `packages/ai/**` 中 V2 provider 扩展
- `packages/domain/src/v2/generation/**`
- `packages/contracts/src/v2/generation/**`
- `packages/ports/src/v2/generation/**`
- `packages/database/src/v2/generation/**`
- `apps/api/src/v2/generation/**`
- `apps/worker/src/v2/**`
- `docs/v2/deliveries/generation-assets.md`
- `docs/v2/interface-requests/generation-assets.md`

### 8.2 分阶段任务

Slice B（必须）：

1. 复用 Provider 协议、超时、错误归一化与 Fake，增加严格的场景候选解析。
2. Generation Context Snapshot：来源 revision、可见性/授权、引用 ID、prompt preview、token budget 和内容哈希。
3. Job：SQLite 事实记录 + BullMQ 可重建投递，定义幂等键、重试上限、取消、租约/恢复和终态。
4. Worker 只通过 `CandidateSubmissionPort` 提交 pending candidate，不调用 canon repository，也不创建第二套候选表。
5. Generation API：创建/查询/取消 job、context preview 和 job-to-candidate 引用；candidate list/review/apply 由 AI-1 Core API 提供。
6. migration 使用预留编号 `0100-0199`。

Slice C（主闭环后）：

7. ComfyUI asset job、workflow version、seed、输入、media ref、校验、缩略图和候选 provenance。
8. Asset Candidate Review：复用 shared review transition，在单个事务内写审核记录与 approved asset facts；不得写 canon。
9. 文件写入使用临时文件 + 原子 rename；数据库只保存受控相对引用，删除与失败恢复可重放。

Slice D（可延期）：

10. Qdrant HTTP adapter、索引 consumer、重建命令、checkpoint 和 FTS5 fallback。
11. 临时 chat、crossover、social feed candidate；默认不进入 release。

### 8.3 强制规则

- SQLite 是 job/candidate/asset 的事实来源；文本 candidate 的表和审核记录归 AI-1，AI-2 只通过端口提交。BullMQ job payload 只携带稳定 ID 和版本，不保存唯一事实。
- API 写 job 事实与 dispatch/outbox 记录必须同一事务；pump 再投递 BullMQ，避免“数据库成功、队列丢失”。
- Worker 使用稳定 job ID 和 claim/lease，重复消费不得产生重复 candidate 或媒体记录。
- 原始外部输出只保存受限、脱敏的审计内容；secret、Authorization、Cookie 和完整敏感 prompt 不写日志。
- Qdrant 不可用只影响语义排序；FTS5 和核心创作/发布/游玩仍可用。

### 8.4 不做

- 不修改 AI-1 的 canon/release/runtime 状态机。
- 不直接写 canon、release 或 save。
- 不把真实 LLM、ComfyUI、Redis 或 Qdrant 作为默认测试条件。
- 不因 Slice D 未完成而阻塞 Slice A-C 集成。

### 8.5 验收

- Fake LLM 覆盖成功、非法结构、空输出、超时、取消、重试耗尽和重复消费。
- Redis 短暂不可用后，可从 SQLite dispatch/outbox 恢复投递。
- Fake ComfyUI 覆盖进度、断连、失败、重复回调和媒体落盘失败。
- Qdrant 关闭时 fallback 测试通过；真实服务证据单独报告。
- 报告 boundaries/typecheck、AI/Worker/API/Database 相关测试和每个 Slice 的完成状态。

## 9. AI-3：Web 产品与交互闭环

### 9.1 Owner paths

- `apps/web/src/v2/**`
- `apps/web` 内 V2 专用测试与 fixtures
- `e2e` 中独立命名的 V2 specs（不得改写 V1 断言以通过）
- `docs/v2/deliveries/web-product.md`
- `docs/v2/interface-requests/web-product.md`

`packages/contracts` 对 AI-3 只读。Web 需要新字段时先登记请求；本地 mock 可以临时实现建议形状，但必须标记 proposal，不能作为后端事实。

Gate 0 已负责修改根 Router/App 以挂载 V2。AI-3 不再修改这些共享入口；V2 layout、导航、store 和 adapter 全部放在 `apps/web/src/v2/**`。

### 9.2 分阶段任务

1. 基于 Gate 0 fixtures 建立 typed API interface、Mock Adapter 和可切换 Http Adapter。
2. V2 壳与路由：Creator Workspace、Canon、Graph、Review、Assets、Release、Player、Operations。
3. Canon 编辑器和 revision conflict UI。
4. Graph 编辑器、校验问题定位与 typed state preview。
5. Generation job 状态、context preview、candidate diff 与审核动作。
6. Release preflight、manifest、player preview、选择、保存/恢复和 export。
7. 资产工作台；临时社交页面只在 Slice D contract 存在后接入。
8. 替换 mock 时只替换 adapter，不重写页面状态机。

### 9.3 强制规则

- 阅读并遵守 `frontend-development-standard.md`，复用现有基础组件、六套实际主题和语义令牌。
- 覆盖 loading、empty、error、disabled、retry、stale revision、job terminal、360px、键盘、aria 和 reduced motion。
- Candidate diff 显示来源 job/context、base revision、变更范围、验证问题和审核结果。
- UI 明确区分 workspace revision、candidate、release 和 save，不能只用名称暗示。
- Mock fixtures 必须直接满足共享 contract 类型；不得复制一套同义 DTO。

### 9.4 不做

- 不修改 Domain、Ports、Database、Worker 或共享 Contracts。
- 不实现后端规则、SQLite、LLM、ComfyUI 或 Qdrant。
- 不修改 V1 页面来伪装 V2 完成。

### 9.5 验收

- Web lint 0 warning，typecheck/test/build 通过。
- Mock 模式 Playwright 覆盖：创建世界 -> 编辑图 -> 查看生成候选 -> 审核 -> release -> 游玩 -> 保存恢复 -> export。
- 桌面和 360px 无横向溢出；核心路径有键盘与可访问名称检查。
- Http Adapter 接入后的 contract 测试与错误状态测试通过。

## 10. 接口请求与变更流程

每个请求写入本分支专属文件，格式见 `INTERFACE_REQUESTS.md`。严重度：

- `blocking`：当前 Slice 无法产生可测试结果；维护者应在继续该 Slice 前裁决。
- `integration`：可用 Fake/Adapter 完成，集成前处理。
- `enhancement`：不影响当前验收，可进入后续范围。

公共 contract 变更遵循：owner 提案 -> 记录生产者/消费者 -> 增加 parser/fixture/错误案例 -> 维护者在集成分支裁决 -> 同步各 adapter。最终集成时才发现的 blocking 请求，视为该分支交付不完整。

## 11. 工作量与检查点

以下是给 AI 开发的相对规模估算，不等同于人工日历承诺。每个检查点都应产生可测试 commit 和交付报告，不能只报告“代码已写完”。

| 工作项 | 预计 AI 工作日 | 建议检查点 |
| --- | ---: | --- |
| Gate 0 | 1-2 | skeleton、wire contract v0、SQLite/Fastify smoke tests |
| AI-1 Core | 8-13 | Canon；Graph/State；Review/SQLite；Release/Runtime/Export |
| AI-2 Slice B | 5-8 | Provider/Context；Job/Outbox；Worker/Candidate submission |
| AI-2 Slice C | 3-5 | ComfyUI/Media；Asset Review |
| AI-2 Slice D | 3-6，可延期 | Qdrant/Fallback；Social Temp |
| AI-3 Slice A/B | 7-11 | App shell/Adapters；Canon/Graph；Review；Release/Player |
| AI-3 Slice C/D | 2-5 | Assets；可选 Social Temp |
| 分阶段集成 | 4-7 | Slice A、B、C 各自集成验证；D 独立 |

三个主分支规模仍不完全相同：AI-1 的规则密度最高，AI-2 的外部故障面最大，AI-3 的页面量最大。判断进度时使用检查点和验收证据，不使用文件数或提交数。若 AI-1 的 Review contract 未到检查点，AI-2 继续使用 Gate 0 Fake，AI-3 继续使用 fixtures，不自行发明替代语义。

## 12. 分阶段集成，而非最终一次性合并

维护者建立 `codex/v2-integration`，始终从 `V2_BOOTSTRAP_SHA` 开始。按 commit/slice 合并，不直接盲合整个分支。

### Slice A：离线核心

合入 AI-1 的 Canon/Graph/State/Release/Runtime，以及 AI-3 对应 mock UI。先验证无 AI、Redis、ComfyUI、Qdrant 时可创作、发布和游玩。

### Slice B：文本生成

合入 AI-2 的 generation context/job/candidate 与 AI-3 Review UI；接通 AI-1 的 Candidate Review。验证 stale candidate、重复 job、失败恢复和审核原子性。

### Slice C：资产

合入 asset job、媒体候选与资产 UI；验证外部失败不破坏文本主闭环。

### Slice D：增强

合入 Qdrant 和临时社交。该 Slice 可独立延期，不影响 V2 核心版本成立。

每个 Slice 合入后立即执行相关 typecheck/tests/build，并解决接口请求；不要把所有冲突留到三个分支结束后。

Slice A 第一次集成时同步当前运行文档与本地命令；Slice B/C 增加外部服务的 Fake/显式真实验收入口；V2 默认 CI 不再依赖 PostgreSQL，但 V1 尚未退役前仍保留 V1 PostgreSQL/Redis 回归。何时移除 V1 CI 属于单独的切换决策。

## 13. 验收场景与完成定义

核心版本必须通过：

1. 从空 SQLite 文件执行 migration 并启动 API/Web。
2. 创建 world、角色、地点、事实、规则、typed state 和叙事图。
3. 在无外部服务时完成编辑、release、游玩、选择、保存、恢复和 export。
4. Fake LLM 创建单场景候选；批准后原子写入 canon，拒绝/过期候选不写入。
5. 创建不可变 release；修改 workspace 不改变旧 release 和旧 save。
6. Worker 重复消费、进程中断和 Redis 恢复不产生重复候选。
7. Fake ComfyUI 产物经审核进入资产库；失败不破坏文本内容。
8. Qdrant 关闭时自动使用 FTS5，主闭环不受影响。

单分支至少报告：范围、commit 列表、contract 变化、migration、领域规则、执行命令和退出码、未执行原因、Fake/真实服务证据等级、接口请求和计划偏差。

最终集成至少执行：

- `pnpm install --frozen-lockfile`
- `pnpm check:boundaries`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm build`
- `pnpm --filter @living-network/web lint`
- V2 SQLite migration/integration tests
- Worker Fake LLM/ComfyUI 与 Redis 恢复测试
- V2 Playwright 桌面与 360px 核心路径

真实 LLM、ComfyUI、Redis 和 Qdrant 验收必须单独报告。Fake 通过不等于真实服务已验收。Slice D 未实现时应明确标为延期，而不是伪装完成。

## 14. 维护者分配清单

1. 提交当前公共文档基线并创建 V1 归档引用。
2. 把 Gate 0 交给 AI-1，验收后记录 `V2_BOOTSTRAP_SHA`。
3. 从该 SHA 创建三个独立实现分支和一个 integration 分支。
4. 分别把本文第 7、8、9 章交给对应 AI，并要求遵守第 10 至 13 章。
5. 要求每个 AI 按 Slice/阶段提交，不接受单个巨大最终提交。
6. 每个 Slice 完成后集成一次，处理对应 interface requests。
7. Slice A-C 验收后再决定是否立即执行 Slice D。

## 15. 统一提示词

```text
你正在 Living Network 仓库执行明确标记的 V2 replacement 任务。

开始前必须阅读并遵守：
- AGENTS.md
- docs/DEVELOPMENT.md
- 修改 Web 时阅读 docs/frontend-development-standard.md
- docs/decisions/0006-v2-local-creator-game-platform.md
- docs/v2/common-baseline.md
- docs/v2/ai-parallel-master-plan.md 中分配给你的章节

你的分支从维护者提供的 V2_BOOTSTRAP_SHA 创建。
你的目标分支与任务章节：<branch-name> / <AI-1|AI-2|AI-3>。

只能修改 owner paths。公共基线、根依赖、lockfile、平台 composition root、其他 AI 命名空间和共享文档只读。需要公共变更时写入你的 docs/v2/interface-requests/<branch>.md。

按阶段形成可审查 commit。外部输出必须进入 candidate/review；SQLite 是事实来源；Redis 与 Qdrant 数据必须可重建；release 不可变；save 绑定 release version。

完成时报告修改范围、commit、contract、migration、规则、命令退出码、未执行验证、真实/Fake 服务证据、接口请求和计划偏差。不得把未执行或 Fake 验证描述为已完成真实验收。
```
