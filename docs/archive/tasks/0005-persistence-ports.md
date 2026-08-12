# Task 0005：持久化端口与内存适配器

## 目标

把 API 从直接持有 `Map` 改为依赖异步仓储端口，为后续 PostgreSQL/Drizzle 实现建立可替换边界，同时保留无外部依赖的可重复测试适配器。

## 本阶段范围

- 新增 `packages/database`，定义 StoryWorld、Character、RelationshipEdge、ActorSession 仓储接口。
- 实现 `InMemoryRepositories`，支持查询、保存、复制和种子引用校验。
- API application 改为异步调用仓储，不再读写具体 Map。
- 保持现有 API 路由和 domain 规则不变。
- 使用 Node 内置测试验证异步行为、复制隔离、引用完整性、重复 ID 和 API 回归。

## 不在范围内

PostgreSQL、Drizzle、迁移、事务、Outbox、Docker、Fastify、认证、Worker、LLM、ComfyUI、前端和新增依赖。

## 验收标准

- 仓储端口的读写方法返回 Promise，API 可在未来替换为数据库实现。
- 读取结果和保存结果不会暴露内部可变对象。
- Store 拒绝重复 ID、未知世界、AI ActorSession 和非法关系边引用。
- API 的健康、列表、角色切换和错误行为回归测试继续通过。
- `node --test` 覆盖 database、api、contracts、domain；严格类型检查覆盖所有现有 tsconfig。

## 回滚

删除 `packages/database/**` 和本任务文档，恢复 `apps/api/src/app.ts`、`apps/api/src/app.test.ts`、`apps/api/package.json` 与 API README/配置到 Task 0004 状态；不得触碰 domain、contracts、根配置或锁文件。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
