# Web

当前提供一个无构建依赖的浏览器 MVP shell，直接消费 API：

- 当前角色选择与 ActorSession 切换；
- 朋友圈/小红书式动态瀑布流；
- 私聊/群聊会话列表、消息读取和文本发送；
- SSE 流式角色回复；
- 文本、图片引用和表情包消息发送；
- 图片动态展示；
- 动态点赞、评论与互动统计；
- SVG 人物关系网、方向、关系类型和指标；
- 世界事件定义、生日/节日排期与月份日历；
- 角色视觉档案、Workflow JSON 预览与节点路径校验；
- 表情包包和条目浏览。
- 内容管理页中的世界、角色和关系创建/修改。

## 本地运行

先启动 API，再运行：

```sh
python3 -m http.server 4173 --directory apps/web
```

浏览器打开 `http://127.0.0.1:4173/?storyWorldId=<world>&readerCharacterId=<character>&actorSessionId=<session>`。
也可以修改 `index.html` 的 `data-api-base`。原生模块入口仍不需要 npm 依赖；Vue/Vite 组件入口已并行提供，当前仍保留原生入口作为默认本地 MVP。

API 默认允许 `http://127.0.0.1:4173` 和 `http://localhost:4173` 作为开发来源。生产环境应通过 `API_CORS_ORIGINS` 配置明确的来源列表，不要使用通配符。

当前 Web 是静态发布物，不需要单独的构建步骤；发布验收使用静态资源检查和浏览器冒烟流程。

## Vue/Vite 迁移骨架

`index-vue.html`、`src/App.vue`、`src/router/`、`src/stores/` 和 `src/views/` 已提供组件化迁移骨架。它与原生 API client 共用同一组 API 契约；依赖已写入 workspace，使用 `pnpm --filter @living-network/web dev:vite` 启动验证。Vite dev 根路径会自动挂载 Vue 入口，静态 Python 入口仍保留原生 shell，便于离线回归。

Vue 入口默认通过当前页面来源访问 API（Vite 开发服务器会代理 `/v1`）；跨来源部署时设置 `VITE_API_BASE`。

验证命令：

```sh
pnpm install --frozen-lockfile
pnpm --filter @living-network/web typecheck
pnpm --filter @living-network/web build
```
