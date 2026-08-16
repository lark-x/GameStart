# AI 开发批次历史记录

`docs/tasks/*.json` 是模块化并行建设阶段留下的历史开发记录。功能闭环优先期不再要求新建、更新或随分支携带任务 JSON，CI 和本地检查也不再根据这些文件授权修改路径。

当前规则：

- 功能开发按用户可见结果组织，可跨 Web、API、Worker 和 Packages。
- 不要求逐文件 `allowedPaths`、Integration 精确路径、Interface Request 或模块拆分 PR。
- 普通功能不需要范围预审批；只有破坏性 migration、数据删除、认证秘密、不可逆公共接口和真实生产副作用需要先确认。
- 现有 JSON 保持原样，`.ai/task.schema.json` 仅用于解释历史记录格式。
- 首个真实业务闭环完成后再设计新的轻量治理，不自动恢复本目录描述过的旧流程。
