# Task 0016：Memory PostgreSQL FTS 与 SQL 仓储

## 目标

把 MemoryItem 领域与可见性规则落到 PostgreSQL：保存来源/置信度/受众，使用 `tsvector` + GIN 做关键词召回，并让 SQL 仓储继续执行世界和角色可见性过滤。

## 本阶段范围

- `memory_items` migration 0003/up/down。
- confidence、source、visibility、audience 和 subject 外键约束。
- `search_vector` 生成列与 GIN 索引。
- 可见性触发器和 audience 世界归属检查。
- SqlRepositories 的 `listForCharacter`、FTS `search`、参数化 upsert。
- Fake SQL client 映射、评分和参数测试。

## 不在范围内

pgvector extension、embedding 生成、RRF 融合、记忆摘要 Worker、API 记忆路由、真实 PostgreSQL 连接和新增依赖。

## 验收标准

- PRIVATE/RELATION/GROUP/SYSTEM 规则在 SQL 触发器和 domain 中一致。
- FTS 查询值使用 `$1` 等参数，结果按 score/时间排序并限制数量。
- MemoryItem 行经过 shape、枚举、confidence 和时间校验。
- 删除世界时记忆随世界级联，不产生 NOT NULL/SET NULL 冲突。
- 全套测试和严格类型检查通过。

## 未验证项

当前没有可访问的 PostgreSQL 服务，尚未执行真实 tsvector 生成、GIN 索引或触发器；Fake client 和迁移结构测试已完成。

## 回滚

删除 `migrations/0003_memory*`、memory migration 测试、SQL adapter memory 扩展和本任务文档；恢复 database/domain 到 Task 0015 状态，不触碰聊天 migration、AI、SSE 或 config。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
