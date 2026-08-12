# 0065：交互日志与私聊自动回复

## 目标

为本地单用户产品补齐可排障的交互链路，并让体验者发送私聊文本后自动触发 AI 回复。

## 已实现

- PostgreSQL 迁移 0017_interaction_logs，提供内存/SQL 查询、稳定游标、7 天清理和递归脱敏。
- HTTP request/correlation ID、LLM Provider、Worker、派发、事件输出和图片任务日志。
- GET /v1/interaction-logs 历史查询和 GET /v1/interaction-logs/stream SSE 实时日志。
- USER → AI 私聊文本自动回复；AI、群聊、图片和贴纸不自动触发。
- 按源消息确定性回复 ID 与 single-flight，失败保留用户消息并支持重试。
- POST /v1/llm-provider-profiles/:id/test 使用已保存密钥测试指定档案，不切换当前激活档案。
- 创作中心 /creator/logs 支持筛选、分页、暂停、自动滚动、断线恢复和详情查看。

## 安全边界

- 正文预览最多 500 字符。
- API Key、Authorization、Cookie、token、password、secret 和密文递归脱敏。
- 日志写入失败不改变聊天、队列、事件输出或图片任务结果。
- 自动化测试只使用 Fake Provider；真实模型仅由用户点击“测试连接”触发。

## 验收记录

- pnpm typecheck：通过。
- pnpm test:local：370 项，362 passed，8 external-service skipped。
- pnpm build：通过。
- pnpm test:e2e：11/11 通过。
- Compose 未删除数据卷完成 API、Worker、Web 重建；0017_interaction_logs 已应用。
- 真实 PostgreSQL 中已确认 API/Worker 日志落库，SSE 可返回带游标事件。
- 桌面 1440px 与移动 360px 日志页面已截图验证，无横向溢出。
- 真实 LLM 与 ComfyUI 未由自动验收调用。