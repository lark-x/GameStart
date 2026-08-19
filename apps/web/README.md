# `@living-network/web`

V2 Vue 3 + Vite 创作者工作区。`/v2` 是默认入口，旧 Web 路由统一重定向到 `/v2`。

工作区覆盖 Canon/Graph、Typed State、Generation、Candidate Review、Assets、Release、Player、Save/Restore 和 Export 的核心路径。默认使用 HTTP adapter 访问 `/api/v2`；Mock adapter 只在显式设置 `VITE_V2_ENABLE_MOCK=true` 时可用。

## 本地运行

```sh
pnpm --filter @living-network/web dev
```

默认地址为 <http://127.0.0.1:4173/v2>。Vite 将 `/api/v2` 代理到 `V2_API_PROXY_TARGET`，默认是 `http://127.0.0.1:3003`。

## 验证

```sh
pnpm --filter @living-network/web typecheck
pnpm --filter @living-network/web test
pnpm --filter @living-network/web lint
pnpm --filter @living-network/web build
```

修改 Web 时必须遵守 [前端开发规范](../../docs/frontend-development-standard.md)，覆盖加载、空、失败、禁用、窄屏和无障碍状态，并复用现有语义令牌与基础组件。
