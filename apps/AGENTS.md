# Apps 局部执行规则

- 修改 `apps/**` 前先读取根 `AGENTS.md`、当前 `docs/tasks/*.json` 和 `.ai/modules.json`。
- API、Worker、Web 文件的所有者由模块注册表决定，目录位置不自动授权修改。混合工作区、路由和运行时装配属于 Integration。
- 功能模块不能直接导入其他功能模块的内部文件；跨模块数据只使用 Contracts 和 Ports，组合只发生在 Integration 入口。
- 单元测试注入最小 Fake/Mock，不启动数据库、Redis、HTTP 或外部模型。真实 Adapter 和组合验证放在对应测试层。
- 修改 `apps/web/**` 还必须读取 `docs/frontend-development-standard.md`。
