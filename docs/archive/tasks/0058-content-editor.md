# Task 0058：内容管理与角色/世界/关系/事件编辑器

状态：Done  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

补齐运行时内容管理能力，使故事世界、角色、关系和基础事件可通过运行界面创建或修改，摆脱对开发 Seed 的单一依赖。

## 2. 允许范围

允许创建或修改：

- `apps/api/src/**`
- `apps/web/src/**`
- `apps/web/index.html`
- `packages/contracts/src/**`
- `docs/tasks/0058-content-editor.md`

## 3. 禁止范围

- 不改动数据库迁移或生产部署流程。
- 不引入新框架和重前端改造。

## 4. 已知背景

当前 API 具备世界、角色、关系、对话和动态等读取能力，Web 也有 MVP 界面，但运行时内容编辑仍依赖 Seed 或外部调用，缺少统一管理入口。

## 5. 明确实现内容

已完成：

- 角色基础信息创建与修改。
- 关系绑定与更新。
- 世界基础数据编辑。
- 基础一次性世界事件创建与修改。
- Web 管理入口可完成上述创建与修改操作。

## 6. 完成标准

- 新增 API 与前端入口可重复使用。
- 相关契约与测试补齐。
- 文档同步更新。

实现证据：`POST/PUT /v1/worlds`、`POST/PUT /v1/characters`、`POST/PUT /v1/relationships`、`GET/POST/PUT /v1/world-events`；`apps/web/index.html` 的管理表单；API、Contract 和 Web shell 测试。

## 7. 验证方法

- 包测试与类型检查通过。
- 通过 API 调用与页面操作可验证新建/修改结果。

## 8. 回滚方式

恢复 API、Web 与契约文件。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键代码变化  
4. 执行的命令  
5. 测试结果  
6. 未解决问题  
7. 风险和建议
