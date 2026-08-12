# Task 0006：PostgreSQL 初始 Schema 与迁移

## 目标

把 Task 0005 的领域仓储边界落实为可执行的 PostgreSQL 初始迁移，为后续 Drizzle Schema、事务仓储和 Outbox 打基础。

## 本阶段范围

- `story_worlds`、`characters`、`relationship_edges`、`actor_sessions` 四张核心表。
- 外键、复合世界归属约束、自环约束、关系指标范围约束和会话时间约束。
- StoryMode 与关系动态开关一致性约束。
- ActorSession 的 USER 角色触发器。
- 查询索引和对应的 down migration。
- 不依赖 PostgreSQL 客户端的静态迁移结构测试。

## 不在范围内

Drizzle ORM Schema、迁移运行器、真实数据库连接、Docker Compose、事务仓储、Outbox、关系事件、聊天/动态/记忆表、认证和新增依赖。

## 验收标准

- up migration 使用显式事务并创建四张核心表。
- 关系边不能跨世界、自环或写入越界指标。
- ActorSession 只能引用同世界的 USER 角色，结束时间不能早于开始时间。
- down migration 按依赖顺序删除触发器、函数、表。
- Node 结构测试、既有 domain/contracts/database/API 测试和严格类型检查通过。

## 未验证项

当前环境的 `psql` 不可用，Docker daemon socket 也被沙箱拒绝；本任务只证明迁移文本结构，尚未在真实 PostgreSQL 实例执行。

## 回滚

删除本任务新增的 migration、迁移测试和文档，恢复 database README；不得触碰 API、domain、contracts、内存适配器或根配置。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
