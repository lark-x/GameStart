# Task 0063：前端 UI 体验升级与 Galgame 风格适配

状态：In progress  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

废除现有原生的“管理后台”式前端外观，以 Vue/Vite 工程为基础，全面引入 `icecranberry/galgame-with-comfyUI` 风格的沉浸式 UI/UX。使系统在视觉上成为真正的“角色社交模拟器”。

## 2. 允许范围

- `apps/web/**`
- 仅为 Tailwind CSS 添加依赖，不破坏根项目 package.json
- `pnpm-workspace.yaml` / vite 配置等前端构建相关文件。

## 3. 禁止范围

- 不修改 API 业务逻辑。
- 不改动持久化数据库模型。

## 4. 已知背景

当前原生 Shell UI 极其简陋，严重影响沉浸感。Vue/Vite 骨架（Task 0060）已落位并构建通过，但界面代码仍是直接复刻原生 Shell，且未设为默认入口。

## 5. 明确实现内容

1.  **切换默认入口**：将开发启动命令彻底切至 Vue/Vite。
2.  **引入 Tailwind CSS**：配置好 Tailwind 工具链以快速构建现代化 UI。
3.  **主布局结构**：实现全屏自适应背景，顶栏控制淡化，侧边栏/底部抽屉形式收纳非核心（如管理、设置）功能。
4.  **Galgame 聊天界面**：摒弃传统气泡列表，改为立绘/背景层 + 底部半透明 AVG 风格对话框的展示模式。
5.  **社交瀑布流**：优化朋友圈样式为照片驱动的小红书式瀑布流卡片。

## 6. 完成标准

- 前端可通过 `dev` 脚本启动 Vite。
- 聊天视图具备明显的 Galgame AVG 对话框特征。
- TypeScript 类型检查和 Vite 生产构建全部通过。

## 7. 验证方法

- `pnpm --filter @living-network/web build` 成功。
- 本地启动后视觉效果发生重大改变。

## 8. 回滚方式

`git checkout` 放弃前端的 Tailwind 和样式改动。
