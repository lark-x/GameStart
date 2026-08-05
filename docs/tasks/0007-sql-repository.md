# Task 0007：参数化 SQL 仓储适配器

## 目标

在不绑定具体 PostgreSQL 驱动的情况下，实现一个可注入 `SqlClient` 的仓储适配器，让现有 API/Worker 可以通过参数化 SQL 使用真实数据库，并继续复用 domain 构造函数进行行校验。

## 本阶段范围

- `SqlClient` 与查询结果抽象。
- StoryWorld、Character、RelationshipEdge、ActorSession 的 SQL 查询和行映射。
- RelationshipEdge、ActorSession 的参数化 upsert。
- 数据库行进入 domain 构造函数前的类型、时间、关系范围和角色校验。
- Fake SQL client 测试查询参数、JOIN 映射、upsert 和异常边界。

## 不在范围内

具体 `pg` 驱动、连接池、事务管理、Drizzle ORM、迁移运行器、重试、Outbox、认证、Worker、LLM、ComfyUI 和新增依赖。

## 验收标准

- `SqlRepositories` 实现 `DomainRepositories`，读写方法均为异步。
- 查询值全部通过 `$1` 等参数传入，不拼接用户 ID。
- 关系边和 ActorSession 的 JOIN 行能被还原为 domain 对象。
- 异常数据库行不能绕过 domain 校验。
- Fake client 测试和既有全部测试、严格类型检查通过。

## 未验证项

当前环境没有可访问的 PostgreSQL 服务，尚未使用真实驱动执行 SQL；SQL 语法和约束由 Task 0006 迁移文本提供，运行时数据库验证需在服务可用后补做。

## 回滚

删除 `packages/database/src/sql.ts`、`sql.test.ts` 和本任务文档，恢复 `packages/database/src/index.ts`；不得触碰迁移、内存适配器、API、domain、contracts 或根配置。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
