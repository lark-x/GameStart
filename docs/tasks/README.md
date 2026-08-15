# AI 开发批次记录

每个开发分支必须新增且持续更新一份 `<YYYYMMDD>-<module>-<slug>.json`。字段定义见 `.ai/task.schema.json`，完整工作流和提示词见 `docs/ai-development-workflow.md`。

规则：

- `allowedPaths` 是本批次可修改范围，不是建议范围；CI 按真实 Git diff 强制检查。
- Integration 任务必须逐个写出精确文件，禁止通配符。
- 中高风险任务在用户确认前保持 `planned`，确认后记录 `approval.reference`。
- 同模块相关小任务可追加到同一记录；跨模块变化必须拆分任务和 PR。
- 验证完成后记录真实命令、退出码和跳过原因。合并后保留文件作为审计证据。
