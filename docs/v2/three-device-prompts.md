# Living Network V2 三设备执行提示词

状态：待维护者分发

规划仓库：`https://github.com/lark-x/GameStart.git`

规划分支：`codex/architecture-governance`

唯一执行计划：`docs/v2/ai-parallel-master-plan.md`

## 使用顺序

三台设备不能同时从规划分支直接开始业务开发。

1. 设备 1 先执行“Gate 0 + AI-1”提示词中的 Gate 0 阶段。
2. 设备 1 将 `codex/v2-bootstrap` 推送至 GitHub，并向维护者报告准确的 `V2_BOOTSTRAP_SHA`。
3. 维护者确认 Gate 0 验收通过，将同一个 SHA 填入设备 1、2、3 后续任务。
4. 三台设备分别从该 SHA 创建：
   - `codex/v2-core-domain-runtime`
   - `codex/v2-generation-assets`
   - `codex/v2-web-product`
5. 三台设备按主计划的检查点提交并推送，不互相合并业务分支。
6. 维护者在 `codex/v2-integration` 中按 Slice A-D 集成。

设备 2、3 在收到 `V2_BOOTSTRAP_SHA` 前只能阅读和审查，不得实现业务代码，不得自行选择其他基线。

## 设备 1 提示词：Gate 0 与 AI-1 Core

```text
你负责 Living Network V2 的 Gate 0 和 AI-1 Core。你在一台独立设备上工作，远程仓库是：
https://github.com/lark-x/GameStart.git

第一阶段只能执行 Gate 0：

1. 在干净目录 clone 仓库并拉取远程：
   git clone https://github.com/lark-x/GameStart.git
   cd GameStart
   git fetch origin --prune
2. 从远程规划分支创建 bootstrap 分支：
   git switch -c codex/v2-bootstrap origin/codex/architecture-governance
3. 开始前完整阅读：
   - docs/architecture.md
   - docs/DEVELOPMENT.md
   - docs/decisions/0006-v2-local-creator-game-platform.md
   - docs/v2/common-baseline.md
   - docs/v2/ai-parallel-master-plan.md，重点是第 1-7、10-15 章
   - 修改 Web 骨架时阅读 docs/frontend-development-standard.md
4. 只完成主计划第 5 章 Gate 0。不得提前实现 Canon CRUD、Graph、Release、Runtime、生成任务或完整 Web 页面。
5. 严格执行 Gate 0 验收，确认 V1 测试和 V2 sentinel test 都实际被发现。
6. 提交并推送 codex/v2-bootstrap，报告：
   - bootstrap commit SHA（完整 40 位）
   - 修改文件
   - contract/port/fixture 清单
   - 执行命令及退出码
   - 未执行验证和原因
7. 推送后停止，等待维护者明确确认该 SHA 为 V2_BOOTSTRAP_SHA。不得自行认定 Gate 0 已获批准。

第二阶段只有收到维护者提供的 V2_BOOTSTRAP_SHA 后才能执行：

1. git fetch origin --prune
2. 验证 git cat-file -e <V2_BOOTSTRAP_SHA>^{commit} 成功。
3. 从准确 SHA 创建业务分支：
   git switch -c codex/v2-core-domain-runtime <V2_BOOTSTRAP_SHA>
4. 执行主计划第 7 章 AI-1，以及第 10-13 章协作、检查点、集成和验收规则。
5. 只能修改 AI-1 owner paths。共享文件、根依赖、lockfile、platform/composition root、顶层 barrel、其他 AI 命名空间只读。
6. 按以下检查点形成独立、可测试 commit 并逐次推送：
   - Canon
   - Graph + Typed State
   - Candidate Review + SQLite Core
   - Release + Runtime + Export
7. Canon Candidate 的事实表、审核状态机、stale revision 检查和原子 apply 归你负责。不得把批准写 canon 的事务交给 AI-2。
8. 接口问题只写 docs/v2/interface-requests/core-domain-runtime.md；blocking 问题立即报告，不私自修改共享 contract。
9. 每个检查点报告 commit SHA、规则、migration、contract、测试退出码和计划偏差。

不要合并 AI-2 或 AI-3 分支，不要创建 integration 分支，不要执行 V1 全面重构。
```

## 设备 2 提示词：AI-2 Generation、Worker 与 Assets

```text
你负责 Living Network V2 的 AI-2：Generation、Worker、Assets，以及可延期的 Search/Social Temp。你在一台独立设备上工作，远程仓库是：
https://github.com/lark-x/GameStart.git

维护者必须先给你一个已验收的完整 V2_BOOTSTRAP_SHA。若没有准确 SHA，停止在阅读/审查阶段，不创建业务分支，不写实现，也不要从 main、codex/architecture-governance 或 codex/v2-bootstrap 的移动分支头猜测基线。

收到 SHA 后：

1. 在干净目录执行：
   git clone https://github.com/lark-x/GameStart.git
   cd GameStart
   git fetch origin --prune
   git cat-file -e <V2_BOOTSTRAP_SHA>^{commit}
   git switch -c codex/v2-generation-assets <V2_BOOTSTRAP_SHA>
2. 完整阅读：
   - docs/architecture.md
   - docs/DEVELOPMENT.md
   - docs/decisions/0006-v2-local-creator-game-platform.md
   - docs/v2/common-baseline.md
   - docs/v2/ai-parallel-master-plan.md，重点是第 1-6、8、10-13、15 章
3. 只修改第 8 章 AI-2 owner paths。共享文件、根依赖、lockfile、platform/composition root、顶层 barrel、AI-1/AI-3 命名空间只读。
4. 先完成 Slice B，并按检查点提交和推送：
   - Provider + Generation Context
   - Job + SQLite dispatch/outbox
   - Worker + CandidateSubmissionPort
5. 必须通过 CanonSnapshotReaderPort 读取指定 revision；只能通过 CandidateSubmissionPort 提交 pending canon candidate。不得读取 AI-1 repository，不得创建第二套 canon candidate 表，不得直接写 canon/release/save。
6. Job 事实、dispatch/outbox 同事务写 SQLite；BullMQ 只保存可重建任务。实现稳定 job ID、claim/lease、有限重试、取消、终态、重放和失败恢复。
7. Slice B 验收通过后再做 Slice C：ComfyUI、Media、Asset Candidate Review。资产批准只能写 approved asset/media facts。
8. Slice D 的 Qdrant 与 Social/Chat Temp 可延期。不得因为 Slice D 未完成阻塞 Slice B/C 交付；Qdrant 使用 HTTP adapter，未经批准不新增 SDK/依赖。
9. 默认测试只使用 Fake。真实 Redis、LLM、ComfyUI、Qdrant 验收必须由显式配置触发并单独报告。
10. 接口问题只写 docs/v2/interface-requests/generation-assets.md。若 CandidateSubmissionPort、CanonSnapshotReaderPort 或 ApprovedAssetReaderPort 不足，登记请求并使用 Gate 0 Fake 继续可隔离部分，不私自改变共享接口。
11. 每个检查点报告 commit SHA、job 状态机、幂等键、migration、contract、测试退出码、真实/Fake 证据和计划偏差。

不要合并 AI-1 或 AI-3 分支，不要创建 integration 分支，不要修改 Web 页面。
```

## 设备 3 提示词：AI-3 Web Product

```text
你负责 Living Network V2 的 AI-3 Web Product。你在一台独立设备上工作，远程仓库是：
https://github.com/lark-x/GameStart.git

维护者必须先给你一个已验收的完整 V2_BOOTSTRAP_SHA。若没有准确 SHA，停止在阅读/审查阶段，不创建业务分支，不写实现，也不要自行选择 main 或规划分支作为基线。

收到 SHA 后：

1. 在干净目录执行：
   git clone https://github.com/lark-x/GameStart.git
   cd GameStart
   git fetch origin --prune
   git cat-file -e <V2_BOOTSTRAP_SHA>^{commit}
   git switch -c codex/v2-web-product <V2_BOOTSTRAP_SHA>
2. 完整阅读：
   - docs/architecture.md
   - docs/DEVELOPMENT.md
   - docs/frontend-development-standard.md
   - docs/decisions/0006-v2-local-creator-game-platform.md
   - docs/v2/common-baseline.md
   - docs/v2/ai-parallel-master-plan.md，重点是第 1-6、9-13、15 章
3. 只修改第 9 章 AI-3 owner paths。packages/contracts 对你只读；Domain、Ports、Database、API、Worker、根 Router/App 挂载点、根依赖和 lockfile 都只读。
4. Gate 0 已提供 /v2 挂载点、wire contract v0 和 fixtures。所有 V2 layout、route records、stores、views、components、Mock Adapter 和 Http Adapter 放在 apps/web/src/v2/**。
5. 先基于 contract fixtures/Mock Adapter 开发，按检查点提交和推送：
   - V2 App Shell + typed adapters
   - Canon + Graph + Typed State
   - Generation Job + Candidate Review
   - Release + Player + Save/Restore + Export
   - Assets；Social Temp 只在 Slice D contract 存在后实现
6. Mock 只能模拟接口，不得发明领域规则。需要新字段时写 docs/v2/interface-requests/web-product.md，并将本地 proposal 明确标记；不得修改 packages/contracts。
7. 页面必须区分 workspace revision、candidate、release 和 save；覆盖 loading、empty、error、disabled、retry、stale revision、job terminal、键盘、aria、reduced motion、桌面和 360px。
8. 复用现有 UI primitives、六套主题和语义令牌；不得新增裸交互控件、硬编码品牌色、!important 或页面级双滚动。
9. Mock 模式 Playwright 必须覆盖创建世界 -> 编辑图 -> 查看/审核候选 -> release -> 游玩 -> 保存恢复 -> export。接入 Http Adapter 后补 contract/error 测试，但不要在本分支合并后端代码。
10. 每个检查点报告 commit SHA、页面/adapter/fixture 范围、测试退出码、可访问性与 360px 证据、接口请求和计划偏差。

不要合并 AI-1 或 AI-2 分支，不要创建 integration 分支，不要修改 V1 页面来伪装 V2 完成。
```

## 维护者填写模板

设备 1 Gate 0 完成后，向三台设备发送：

```text
V2 Gate 0 已验收。
V2_BOOTSTRAP_SHA=<完整 40 位 commit SHA>
远程 bootstrap 分支：origin/codex/v2-bootstrap

请先执行：
git fetch origin --prune
git cat-file -e <V2_BOOTSTRAP_SHA>^{commit}

只有校验成功后才能从该 SHA 创建自己的业务分支。禁止使用分支名替代 SHA 作为创建基线。
```
