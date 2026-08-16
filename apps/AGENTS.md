# Apps 局部执行规则

- 修改 `apps/**` 前读取根 `AGENTS.md` 和与当前用户路径直接相关的代码；不要求创建或读取任务 JSON。
- `.ai/modules.json` 用于理解模块与依赖方向，不限制一个纵向功能可修改的路径。API、Worker、Web、路由和运行时装配可以在同一功能批次中同步修改。
- 功能模块不能直接导入其他功能模块的内部文件；跨模块数据只使用 Contracts 和 Ports，组合只发生在 Integration 入口。
- 测试优先覆盖当前用户路径。简单规则使用最小 Fake/Mock；数据链路功能可以直接使用临时 SQLite 或受控 HTTP 集成测试，不要求为每层重复建立 Mock。
- 修改 `apps/web/**` 还必须读取 `docs/frontend-development-standard.md`。
