# Task 0004：API 应用边界与角色上下文

## 目标

在不引入数据库、认证或第三方运行依赖的前提下，建立可测试的 API application 边界，为后续 Fastify 适配、数据库仓储和 Web 客户端提供稳定路由行为。

## 本阶段范围

- `apps/api` 增加 TypeScript 包配置和入口导出。
- 内存 `ApiStore`：保存 StoryWorld、Character 和 ActorSession 的测试数据，并校验引用完整性。
- `ApiApplication`：实现 `/health`、`/v1/worlds`、`/v1/characters` 和 `/v1/actor-sessions/switch`。
- 使用 domain 的 `switchActorCharacter` 作为角色切换唯一业务规则。
- Node `http` adapter，将真实 HTTP 请求转换为 WHATWG `Request/Response`。
- 错误统一为 JSON `{ error: { code, message } }`，不泄露内部异常。

## 不在范围内

Fastify、数据库、迁移、认证、权限系统、SSE、Worker、LLM、ComfyUI、前端页面、生产部署和新增依赖。

## 验收标准

- 健康、世界列表、按世界过滤角色列表和角色切换路由可通过 `Request` 调用。
- 角色切换请求必须使用契约层的会话 ID与目标角色 ID，并持久化到内存 Store。
- AI 角色、跨世界角色、未知会话/角色和非法 JSON 不得成功切换。
- 已知路径使用错误 HTTP 方法返回 405，未知路径返回 404。
- Store 不接受重复 ID、未知世界角色或非法会话角色引用。
- API 测试和现有 domain/contracts 测试通过；严格类型检查通过。

## 回滚

删除 `apps/api/src/**`、`apps/api/tsconfig.json` 和本任务文档，恢复 `apps/api/package.json` 与 README 的 Task 0001 占位内容；不得触碰 domain、contracts、根配置或锁文件。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
