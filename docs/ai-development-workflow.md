# AI 模块化开发工作流

## 用户只需要提供什么

描述希望看到的结果即可，不需要指定代码文件。AI 必须先根据 `.ai/modules.json` 判断模块和风险，再生成任务记录。低风险可以直接实现；中高风险必须先让用户确认目标、修改范围、公共接口、失败处理和验收方式。

## 可复用提示词

```text
拉取 lark-x/GameStart 最新 main，并完整阅读根 AGENTS.md、.ai/modules.json，以及与你改动相关的当前文档。

任务目标：<用户可见结果>
所属模块：<core | generation-assets | platform | web-shell | integration>

先检查工作区并创建 codex/<module>/<task> 分支和 docs/tasks/<date>-<module>-<task>.json。
只允许修改任务记录中的 allowedPaths。不得修改其他模块、V1、共享 Contract、migration、组合入口、依赖或锁文件；如确有需要，停止实现并提交 Interface Request。

低风险任务可直接实施。中高风险任务先报告用户结果、允许/禁止路径、接口变化、失败处理和验收命令，等待确认后再编码。

单元测试使用最小 Port Fake/Mock，不连接真实数据库、Redis、HTTP、文件系统、LLM 或 ComfyUI。Adapter、Integration 和 E2E 证据分开报告，不以 Mock 冒充真实服务验收。

完成后运行 pnpm check:scope、相关模块测试和风险等级要求的验证；记录真实退出码。提交、推送并创建 Draft PR，但不要合并 main。
```

## 分支与合并

- AI 负责创建分支、任务记录、实现、测试、提交、推送、Draft PR 和修复 CI。
- 用户负责确认中高风险范围并最终合并。
- 同模块小任务可共用一个分支/PR；跨模块或共享变更必须拆分。
- `scope-check`、`v2-verify`、`v2-real-services`、`v2-e2e` 全部通过后才能合并。

## 测试责任

- Unit：Domain/Use Case + 本地 Fake/Mock。
- Contract：共享 DTO、Parser、错误和事件 fixture。
- Adapter：临时 SQLite/目录、Fake Fetch 或 Fake Server。
- Integration：组合入口、migration、Redis/BullMQ 和关键模块接缝。
- E2E：少量关键用户闭环。

Fake 应实现最小 Port，并在可行时与真实 Adapter 运行同一组行为约定测试。不要复制一套上游业务逻辑来制造“看似真实”的 Mock。

可使用 `pnpm test:module:<module>` 独立运行 Core、Generation/Assets、Platform、Web Shell 或 Integration 当前拥有的测试；跨模块装配仍由全仓 Integration/E2E 验证。
