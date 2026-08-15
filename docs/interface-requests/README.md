# Interface Requests

功能模块需要修改共享 Contract、Port、migration、组合入口、依赖或锁文件时，在这里提交 `<task-id>.md`，至少说明调用方、输入输出、兼容性、失败行为和验收场景。

Interface Request 只提出需求，不授权功能分支修改共享实现。后续必须由独立 Integration 任务实现并先合并，功能分支再同步最新 `main`。
