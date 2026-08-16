# Playwright E2E

端到端测试覆盖 V2 `/v2` 分组工作区、旧入口重定向、真实 API/SQLite 人工创作闭环、平台配置与诊断页面。

首次运行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright 会自动启动：

- V2 API：`V2_API_PORT=4412`、临时 SQLite
- V2 Web：`http://127.0.0.1:4473`，通过 HTTP adapter 读写同一测试 API；平台配置页面通过同一测试 API 读写临时 SQLite

测试不会复用既有服务，也不依赖 PostgreSQL、LLM 或 ComfyUI。
