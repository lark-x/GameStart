# Task 0009：API Runtime 组装与生命周期

## 目标

把 AppConfig、DomainRepositories、ApiApplication 和 Node HTTP server 组成一个明确的 API runtime，避免启动流程隐式创建内存存储或散落解析环境变量。

## 本阶段范围

- `createApiRuntime(config, repositories)` 组装 API 运行时。
- `createApiRuntimeFromEnvironment(env, repositories)` 统一使用 config 包解析环境。
- `getApiListenOptions` 暴露已校验的 host/port。
- `listenApiRuntime` 和 `closeApiRuntime` 管理 HTTP server 生命周期。
- 测试验证配置、仓储和应用对象的引用关系及默认不监听行为。

## 不在范围内

真实端口监听验证、Fastify、生产 main 进程、PostgreSQL 连接池、认证、Worker、LLM、ComfyUI 和新增依赖。

## 验收标准

- API runtime 必须显式接收 `DomainRepositories`，不能隐式创建内存仓储。
- 环境入口必须经过 `loadAppConfig`，监听参数来自 `config.api`。
- close 未启动的 runtime 必须安全返回。
- runtime 测试、既有全套测试和严格类型检查通过。

## 未验证项

当前沙箱禁止本地 socket 监听；`listenApiRuntime` 的真实 listening/error 事件需在允许端口的环境中补测。

## 回滚

删除 `apps/api/src/runtime.ts`、`runtime.test.ts` 和本任务文档，恢复 API index、README 到 Task 0008 状态；不得触碰 config、database、domain、contracts 或根配置。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
