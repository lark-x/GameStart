# Task 0003：共享契约与 JSON Schema

## 目标

为后续 API、Worker 和 Web 建立单一的共享数据契约来源，覆盖角色、故事世界、关系状态、关系边和用户角色会话；契约层不依赖 Fastify、数据库或供应商 SDK。

## 本阶段范围

- `packages/contracts` 导出角色、故事模式、关系指标和领域 DTO 类型。
- 导出可被 Fastify/其他 HTTP 层消费的 JSON Schema 元数据。
- 为关系指标声明 `-100` 到 `100` 的边界，为资源对象关闭未知字段。
- 为角色切换请求声明基于 ID 的请求契约。
- 使用 Node 内置测试验证枚举、必填字段、范围和 Schema 注册表。

## 不在范围内

API 路由、Fastify 实例、数据库 Schema、认证、Worker、UI、LLM、ComfyUI、运行时 JSON Schema 校验器和新增生产依赖。

## 验收标准

- API/Worker/Web 可从 `@living-network/contracts` 获取同一套 DTO 类型和枚举。
- Character、StoryWorld、RelationshipState、RelationshipEdge、ActorSession 均有稳定 `$id` 的 JSON Schema。
- Schema 对资源对象关闭 `additionalProperties`，关系指标声明 `minimum=-100`、`maximum=100`。
- ActorSession 切换请求只传会话 ID 与目标角色 ID，不把完整角色对象放入请求。
- `node --test packages/contracts/src/*.test.ts` 和严格 TypeScript 类型检查通过。

## 回滚

删除本任务新增的契约测试和文档，恢复 `packages/contracts/src/index.ts` 与 `packages/contracts/package.json` 的 Task 0001 内容；不得触碰 domain、应用占位包、根配置或锁文件。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
