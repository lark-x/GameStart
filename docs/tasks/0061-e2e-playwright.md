# Task 0061：浏览器 E2E 验收（Playwright）

状态：In progress（本地验收完成，CI 门禁待接入）  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

为当前 Web MVP 建立 Playwright 端到端测试基线，覆盖核心用户路径，使回归验证可在 CI 中自动执行。

## 2. 允许范围

允许创建或修改：

- `e2e/**`
- `apps/web/**`
- `package.json`（仅新增 Playwright 依赖与脚本）
- `docs/tasks/0061-e2e-playwright.md`

## 3. 禁止范围

- 不修改 API 业务逻辑。
- 不改动数据库 schema 或迁移。
- 不引入生产部署流程。

## 4. 已知背景

当前浏览器冒烟依赖手动 checklist（见 `docs/RELEASE.md`），没有自动化 E2E。Web 使用原生浏览器模块，无构建步骤，启动方式为 `python3 -m http.server`。

## 5. 明确实现内容

- 安装 Playwright 并配置基础项目结构。
- 编写覆盖以下路径的 E2E 测试：
  - 世界加载与角色显示
  - 聊天页消息加载与发送
  - 动态 Feed 展示
  - 角色切换后上下文同步
- 提供本地运行命令与 CI 运行命令。

## 6. 完成标准

- `npx playwright test` 全部通过。
- 测试可在 API + Web 本地服务下重复运行。
- 文档新增 E2E 运行说明。

## 7. 验证方法

- `npx playwright test` 退出码 `0`
- 本地手动启动 API + Web 后执行测试可复现

## 8. 回滚方式

删除 `e2e/` 目录、移除 package.json 中新增的 Playwright 依赖。

当前证据：`e2e/core-paths.spec.ts` 已覆盖世界、角色、动态、聊天、关系和管理入口（含世界、关系和一次性事件创建以及关系/事件修改）；配置会自动启动开发 API 与静态 Web。`@playwright/test` 已写入根依赖和锁文件，Chromium 本地运行时已安装；`pnpm test:e2e` 退出码为 `0`，8 个测试全部通过。当前 CI workflow 尚未安装浏览器或执行 `pnpm test:e2e`，因此任务保持进行中。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键测试覆盖  
4. 执行的命令  
5. 验证结果  
6. 未解决问题  
7. 风险和建议
