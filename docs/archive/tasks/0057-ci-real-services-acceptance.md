# Task 0057：CI 真实服务验收升级

状态：Done  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

将 CI 从“单元与静态检查”升级为具备分层验收能力，确保真实 PostgreSQL/Redis 服务场景在 PR 流程中可被验证或明确隔离。

## 2. 允许范围

允许创建或修改：

- `.github/workflows/ci.yml`
- `.github/workflows/*.test.ts`
- `docs/PROGRESS.md`
- `docs/RELEASE.md`
- `docs/tasks/0057-ci-real-services-acceptance.md`

## 3. 禁止范围

- 不修改业务实现代码。
- 不引入生产部署、镜像构建或远程环境依赖。

## 4. 已知背景

当前 CI 已覆盖 `pnpm test:all` 与 `pnpm typecheck`，但默认不启动 PostgreSQL/Redis，真实服务验证仍依赖手动流程。

## 5. 明确实现内容

至少完成以下方案之一并明确记录：

1. 在 CI 中引入 PostgreSQL/Redis 服务容器，并运行真实服务验收脚本。
2. 若暂时不引入服务容器，则建立显式分层策略：PR 默认跑快速门禁，`main` 或手动 workflow 跑真实服务验收。

## 6. 完成标准

- CI 策略文档化。
- 真实服务验收路径可重复执行。
- workflow 测试和进度文档同步更新。

## 7. 验证方法

- `node --test .github/workflows/ci.test.ts`
- 复查 workflow YAML 与文档
- 本地可重复对应 CI 命令

## 8. 回滚方式

恢复 workflow 与文档版本。

实现证据：`real-services` job 在 `main` push 上启动 PostgreSQL 17 和 Redis 7，并以 `RUN_REAL_INTEGRATION=1` 执行 `pnpm test:integration`；PR 仍执行快速门禁。Workflow 断言测试已通过。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键配置变化  
4. 执行的命令  
5. 验证结果  
6. 未解决问题  
7. 风险和建议
