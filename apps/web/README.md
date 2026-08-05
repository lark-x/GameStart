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

## 本地运行

先启动 API，再运行：

```sh
python3 -m http.server 4173 --directory apps/web
```

浏览器打开 `http://127.0.0.1:4173/?storyWorldId=<world>&readerCharacterId=<character>&actorSessionId=<session>`。
也可以修改 `index.html` 的 `data-api-base`。当前页面使用浏览器原生模块，不需要额外 npm 依赖；后续可以在不改变 API client 和视图数据形状的情况下迁移到 Vue 3/Vite。

API 默认允许 `http://127.0.0.1:4173` 和 `http://localhost:4173` 作为开发来源。生产环境应通过 `API_CORS_ORIGINS` 配置明确的来源列表，不要使用通配符。

当前 Web 是静态发布物，不需要单独的构建步骤；发布验收使用静态资源检查和浏览器冒烟流程。
