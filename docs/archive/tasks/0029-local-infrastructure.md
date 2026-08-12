# Task 0029 — 本地 PostgreSQL/Redis/MinIO 基础设施

## 目标

提供可重复启动的本地基础设施，为真实数据库、队列和媒体存储适配器预留运行环境。

## 交付内容

- `infra/compose/docker-compose.yml`：锁定 PostgreSQL 16.4、Redis 7.2 和 MinIO release 镜像。
- PostgreSQL/Redis 健康检查、持久化 volume、可覆盖端口和开发凭据环境变量。
- 根目录 `.env.example`，覆盖 API、数据库、Redis、ComfyUI、媒体目录和可选 LLM 配置。
- `infra/compose/README.md`：启动/停止命令、迁移顺序和数据删除警告。
- 静态 Compose 检查测试。

## 明确未包含

- 当前环境的 Docker 实际启动、PostgreSQL 连接、迁移执行和 MinIO bucket 初始化；Docker socket 权限/外部镜像可用性需由运行环境验证。
- 生产密钥、TLS、备份策略、Prometheus/Grafana 和云托管配置。

## 验证

- `node --test infra/compose/compose.test.ts`
- 仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 `infra/compose`、`.env.example` 和本任务文档；不影响应用层内存/SQL 适配器。
