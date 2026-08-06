# Playwright E2E

端到端测试使用开发 API Seed 和原生静态 Web，避免依赖 PostgreSQL、Redis、LLM 或 ComfyUI。

依赖已在根锁文件中声明。首次运行先安装项目依赖和 Chromium：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright 会自动启动：

- API：`pnpm --filter @living-network/api dev`（`3001`）
- Web：`pnpm --filter @living-network/web dev`（`4173`）

CI 中不复用已存在服务；本地开发可以先手动启动服务，再使用 `reuseExistingServer` 加快回归。
