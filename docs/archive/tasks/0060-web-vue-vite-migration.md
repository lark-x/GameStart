# Task 0060：Web 前端 Vue/Vite 迁移启动

状态：In progress（依赖、类型检查和构建完成，默认入口待切换）  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

把当前原生浏览器 Web shell 推进到可维护的 Vue 3 + Vite 工程，保留现有 API 契约与页面能力，使后续功能迭代可在组件化前端上展开。

## 2. 允许范围

允许创建或修改：

- `apps/web/**`
- `docs/tasks/0060-web-vue-vite-migration.md`

## 3. 禁止范围

- 不改 API 业务行为。
- 不引入生产认证、部署或多用户体系。

## 4. 已知背景

当前 Web 使用原生浏览器模块和手动 DOM，已覆盖角色切换、聊天、动态、关系和日历等主要视图，但没有路由、状态管理和构建流程。

## 5. 明确实现内容

至少完成：

- Vue 3 + Vite 工程骨架。
- 现有关键视图迁移或兼容挂载。
- 基础路由与开发命令。

## 6. 完成标准

- 前端可独立启动并访问现有核心页面。
- 现有测试或新的前端测试可运行。
- 文档更新前端运行方式。

## 7. 验证方法

- 前端构建与启动命令通过。
- 关键页面手动或自动校验通过。

## 8. 回滚方式

恢复 `apps/web/**`。

当前证据：Vue Router、Pinia、7 个视图组件和 Vite 配置已建立；Feed/聊天/关系/日历/资产/设置视图会在世界或角色上下文加载后自动刷新，管理视图覆盖世界、角色、关系和一次性事件的创建/修改；Vue 依赖已写入 workspace 锁文件，`pnpm --filter @living-network/web exec vue-tsc -p tsconfig.json --noEmit` 和 `pnpm --filter @living-network/web build` 均退出码为 `0`。`dev:vite` 的根路径会通过 Vite middleware 挂载 `index-vue.html`，原生 `index.html` 仍供 Python 静态 MVP 使用；默认入口切换留待下一阶段，避免影响现有原生 Web E2E。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键代码变化  
4. 执行的命令  
5. 验证结果  
6. 未解决问题  
7. 风险和建议
