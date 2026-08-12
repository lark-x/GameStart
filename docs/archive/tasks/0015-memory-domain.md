# Task 0015：MemoryItem 与可见性检索

## 目标

建立可审计的记忆领域模型：每条记忆必须标记来源、置信度和可见性，检索只能返回当前角色可见的事实，避免把 LLM 猜测直接当成公开事实。

## 本阶段范围

- `MemoryKind`：事件事实、会话摘要、角色印象、用户偏好。
- `MemoryVisibility`：本人、关系、群组、公开、系统私有。
- `MemorySource`：用户编写、LLM 派生、系统事件、导入。
- MemoryItem 创建、世界/角色归属、audience、confidence 和时间校验。
- `isMemoryVisibleTo` 与确定性 token overlap + confidence 评分。
- `MemoryRepository` 和 InMemory 实现。
- contracts MemoryItem DTO/JSON Schema。

## 不在范围内

PostgreSQL memory migration、FTS、pgvector、embedding provider、记忆摘要 Worker、API 记忆路由和新增依赖。

## 验收标准

- PRIVATE 必须有 subject；RELATION/GROUP 必须有 audience；SYSTEM 对角色不可见。
- confidence 必须在 0 到 1，source 必须明确。
- 检索按世界和可见性过滤，再按匹配度/置信度/时间稳定排序。
- 返回对象和 audience 不暴露内部可变引用。
- 全套测试和严格类型检查通过。

## 未验证项

当前只实现内存关键词检索，尚未在 PostgreSQL FTS/pgvector 上验证召回或 RRF 融合。

## 回滚

删除 domain memory 文件/测试、database MemoryRepository/测试、contracts memory DTO/Schema 和本任务文档；恢复各包到 Task 0014 状态，不触碰聊天迁移、SSE、Provider 或 config。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
