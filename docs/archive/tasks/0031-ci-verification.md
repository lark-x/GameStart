# Task 0031 — CI 全量验证入口

## 目标

把包级测试、跨包 MVP 集成测试、Compose 静态检查和严格 TypeScript 检查纳入可重复的 CI。

## 交付内容

- 根脚本：
  - `pnpm test`：workspace 包测试；
  - `pnpm test:integration`：MVP 集成测试和 Compose 检查；
  - `pnpm test:all`：两者串行执行。
- `.github/workflows/ci.yml`：Node 24、pnpm 11.1.2、frozen lockfile、全量测试和 typecheck。
- CI workflow 静态验证，确保权限只读且不跳过锁文件/类型检查。

## 明确未包含

- CI 中启动 Docker Compose、真实 PostgreSQL/Redis/MinIO、ComfyUI 或外部 LLM。
- 部署到生产环境、镜像构建和密钥配置。

## 验证

- `node --test .github/workflows/ci.test.ts`
- `pnpm test:all` 在网络/依赖可用的 CI 环境执行。
- 本地继续运行完整 Node 测试与严格 `tsc`。
