# Playwright E2E

端到端测试覆盖 V2 `/v2` 工作区、旧入口重定向、Mock 创作闭环、空 SQLite HTTP 闭环和 360px 窄屏布局。

首次运行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright 会自动启动：

- V2 API：`V2_API_PORT=4412`、临时 SQLite
- V2 Web：`http://127.0.0.1:4473`，Mock 和 HTTP 场景分别由测试控制

测试不会复用既有服务，也不依赖 PostgreSQL、LLM 或 ComfyUI。
