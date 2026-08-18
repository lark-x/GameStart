# GameStart V2 前端导航重构与稳定化修复完整方案

> 适用范围：当前 `main` 分支的 `apps/web`
>
> 目标：在现有 V2 前端第一轮布局稳定化基础上，继续解决左侧导航过载、响应式边界、真实交互 Bug、状态反馈不一致和复杂页面信息架构问题，并形成可长期扩展的统一前端信息架构。
>
> 本文面向 Agent 执行。执行前必须以最新 `main` 为准重新核对文件与路由，不得假设本文中的具体类名和路径完全未变化。

---

# 1. 本轮改造目标

本轮完成两件事：

1. **重构全局导航信息架构**
   - 将“折叠式功能树 Sidebar”改成“一级模块 Sidebar + 页面内 Tabs”。
   - 左侧永久入口压缩到约 6 个。
   - 后续 Memory / Prompt / Automation 等能力不再继续膨胀 Sidebar。

2. **修复当前仍存在的前端问题**
   - Workspace Container Query 实现问题。
   - Chat 错误跳转。
   - 移动端 Shell / Chat Header 冲突。
   - Model Test 反馈被 refresh 清空。
   - ComfyUI 失败状态颜色错误。
   - Diagnostics 可访问性与错误反馈不足。
   - 中等宽度响应式不稳定。
   - Status Rail 状态语义问题。
   - Generation 页面 Textarea 字体问题。
   - Layout Primitive 仍有两套宽度来源。
   - 其他零散 UI / CSS / 交互细节。

---

# 2. 当前前端状态

第一轮整改已经解决了：

```text
双 Header
Chat 全高
Chat 单滚动
Composer 高度
Bubble 宽度
Diagnostics Drawer
Typography
基础 Layout Primitive
Settings 分组
部分 Workspace Responsive
```

因此当前不再需要“大重构”。

本轮重点：

```text
信息架构
+
响应式边界
+
真实交互 Bug
+
视觉一致性
```

---

# 3. 核心导航改造

当前 Sidebar 同时承担：

```text
一级导航
二级导航
故事切换
创作入口
素材入口
系统配置
运行状态
日志
触发器
```

尤其“创作”区域存在两套：

```text
创建请求
任务状态
审核
```

用户很难区分 AI Scene 与 ComfyUI。

最终 Sidebar 改成：

```text
┌──────────────────────┐
│ Living Network       │
│ 当前故事 ▼           │
│                      │
│ 💬 对话               │
│ 📖 故事               │
│ ✦ 创作               │
│ ▣ 素材               │
│ ✓ 发布               │
│                      │
│ ───────────────────  │
│ ⚙ 设置               │
└──────────────────────┘
```

左侧只保留：

```text
对话
故事
创作
素材
发布
设置
```

---

# 4. 一级模块职责

## 4.1 对话

包含：

```text
开始故事
最近故事
聊天
```

路由：

```text
/v2/start
/v2/chat/:conversationId
```

Sidebar 只显示“对话”。

---

## 4.2 故事

包含：

```text
总览
世界设定
状态与逻辑
故事结构
```

页面内 Tabs：

```text
[ 总览 ] [ 世界设定 ] [ 状态与逻辑 ] [ 故事结构 ]
```

映射：

```text
/v2/workspace/project
/v2/workspace/world
/v2/workspace/state
/v2/workspace/story
```

---

## 4.3 创作

包含：

```text
创建场景
任务
审核
```

页面内 Tabs：

```text
[ 创建 ] [ 任务 ] [ 审核 ]
```

映射：

```text
/v2/workspace/ai-scene-request
/v2/workspace/ai-scene-jobs
/v2/workspace/ai-scene-review
```

---

## 4.4 素材

包含：

```text
正式素材库
图片生成
生成任务
候选审核
```

页面内 Tabs：

```text
[ 素材库 ] [ 图片生成 ] [ 任务 ] [ 审核 ]
```

映射：

```text
/v2/workspace/formal-assets
/v2/workspace/comfy-request
/v2/workspace/comfy-jobs
/v2/workspace/comfy-review
```

---

## 4.5 发布

包含：

```text
发布检查
运行预览
导出
```

页面内 Tabs：

```text
[ 发布检查 ] [ 运行预览 ] [ 导出 ]
```

如果 Export 当前仍在 Release 内，可第一阶段保持为同页 Section。

---

## 4.6 设置

Sidebar 只保留：

```text
设置
```

进入 `/v2/settings` 后：

```text
AI
├── 模型
├── Memory
└── Prompt

生成
├── ComfyUI

系统
├── Runtime
├── Logs
└── Automation

界面
└── Appearance
```

不再在 Sidebar 永久显示模型、ComfyUI、日志、运行状态、外观、触发器、Memory、Prompt。

---

# 5. Story Switcher 改造

改成轻量入口：

```text
当前故事

◉ 雾港回声        ⌄
```

点击弹出 Popover：

```text
切换故事

✓ 雾港回声
  星空旅馆
  深海列车

────────────
+ 新建故事
管理故事
```

要求：

- 不长期显示 Refresh Button。
- 切换后自动刷新 Context。
- Loading 使用轻量 Spinner。
- 失败使用 Toast / Inline Error。

---

# 6. Sidebar 宽度

一级入口减少后：

```text
Desktop：220～228px
```

后续可支持：

```text
Collapsed：68～72px
```

折叠后只显示图标并提供 Tooltip。

本阶段折叠功能可列为 P2，不阻塞主改造。

---

# 7. 页面内 Tabs 统一组件

新增：

```text
ModuleTabs.vue
```

建议 Contract：

```ts
interface ModuleTab {
  label: string;
  to: string;
  exact?: boolean;
  badge?: string | number;
}
```

视觉：

```text
轻量背景
底部 Indicator
不使用独立 Card
```

禁止每个页面自行实现一套 Tabs。

---

# 8. 路由容错

当前未知 Workspace area 静默 fallback 到 overview 会掩盖坏链接。

改成：

```text
unknown area
→ 明确 Unsupported / 404
```

或显式 redirect。

不要继续：

```text
unknown
→ overview
```

---

# 9. P0 — Workspace Container Query 修复

当前错误模式：

```css
.v2-workspace-area {
  container-type: inline-size;
}

@container (...) {
  .v2-workspace-area {
    ...
  }
}
```

Container Query 应作用于后代，而不是 Container 自身。

正确：

```text
WorkspaceContainer
└── WorkspaceGrid
```

```css
.workspace-container {
  container-type: inline-size;
}

@container (max-width: 1000px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
```

验收尺寸：

```text
1024
1100
1200
1280
1366
```

主编辑区不能被 Status Rail 严重压缩。

---

# 10. P0 — Chat 创作工作区错误链接

修正：

```text
/v2/workspace/ai
```

到真实入口：

```text
/v2/workspace/ai-scene-request
```

或者正式新增 AI 聚合页。

本阶段优先直接修坏链接。

增加 E2E：

```text
Chat
→ 更多
→ 创作工作区
→ AI Scene Request
```

---

# 11. P0 — 移动端 Shell / Chat Header 冲突

普通页面：

```text
Shell 提供 ☰
```

Feature Layout / Chat：

```text
不要额外显示左上悬浮 Shell Trigger
```

Chat Header 自己集成必要导航。

例如：

```text
[☰] [←] Story Title              [...]
```

或小屏：

```text
[☰] Story Title                  [...]
```

确保 375 / 430 / 768 宽度不重叠。

---

# 12. P1 — Model Test 结果被 refresh 清空

当前大致链路：

```text
test()
↓
testMessage = success
↓
refresh()
↓
selectProfile()
↓
testMessage = null
```

修复方式：

- Refresh 支持 preserve transient state。
- 只有用户主动切换 Profile 时清 testMessage。
- 更推荐测试结果统一 Toast。

推荐：

```text
测试结果 → Toast
当前连接状态 → Profile 状态区域
```

---

# 13. P1 — ComfyUI 错误显示为成功色

连接测试失败不能使用 success 样式。

改为：

```ts
type NotificationTone =
  | "success"
  | "warning"
  | "error";
```

连接失败必须 error / warning。

---

# 14. P1 — 复杂页面统一 Content Responsive

逐步从：

```text
viewport breakpoint
```

转成：

```text
content container breakpoint
```

优先：

```text
Workspace
Model Settings
Model Logs
Project Overview
Settings Grid
```

---

# 15. P1 — Layout Width Source 收敛

当前 Shell 与 PageContainer 都维护宽度规则。

必须统一。

推荐：

```text
PageContainer
= 唯一 width source
```

Shell 只读取：

```text
route.meta.pageSize
```

不再重复维护 narrow / standard / wide 的具体像素。

---

# 16. P1 — CSS Token 与 Icon 检查

扫描：

```text
所有 Lucide Import
所有模板图标
所有 var(--token)
```

重点确认：

```text
RefreshCw
--shadow-lg
```

如果需要 Shadow Large，则正式加入 Token；否则统一使用 `--shadow-md`。

---

# 17. P1 — Composer Auto Grow Reset

发送后 Textarea 应恢复为约 44px。

watcher 应在 DOM 更新后 resize。

推荐：

```ts
watch(
  () => props.modelValue,
  async () => {
    if (!props.autoGrow) return;
    await nextTick();
    resize();
  },
  { flush: "post" },
);
```

---

# 18. P1 — Diagnostics Drawer

增加完整状态：

```text
Loading
Error
Empty
Retry
```

请求失败不能只 console.error。

补齐：

```text
Esc 关闭
aria-modal
打开后焦点进入
关闭后焦点返回触发按钮
```

如果已有通用 Drawer，优先复用。

---

# 19. P1 — Status Rail 状态语义

不要仅凭：

```text
mode === http
```

显示“已连接”。

建议：

```text
loading  → 检测中
error    → 异常
mock     → 演示数据
health ok → 已连接
otherwise → 未知
```

并使用正确 Badge tone。

---

# 20. P1 — Status Rail Sticky

宽屏允许：

```css
position: sticky;
top: var(--space-5);
```

小屏禁用。

确保不引入嵌套滚动。

---

# 21. P2 — Workspace 内部名称清理

不要直接暴露：

```text
overview
canon
graph
state
assets
release
player
```

改成：

```text
总览
世界设定
故事结构
状态
素材
发布
运行预览
```

没有必要的内部 Badge 可以删除。

---

# 22. P2 — Generation Textarea 字体

不要：

```css
.module-body :deep(textarea) {
  font-family: monospace;
}
```

自然语言 Prompt 使用 UI Font。

仅：

```text
JSON Payload
Model Messages Preview
```

使用 monospace。

建议预览改为：

```text
pre + Copy Button
```

而不是 disabled Textarea。

---

# 23. P2 — Inline Feedback 收敛

普通成功状态：

```text
保存成功
任务提交成功
连接测试成功
绑定完成
```

统一 Toast。

页面内只保留：

```text
Persistent Error
Validation Error
Important Warning
```

---

# 24. P2 — Automation 入口

Automation 尚未成熟时：

```text
Settings Home
→ 实验 / 即将推出
```

不要让占位功能拥有与成熟功能相同的全局导航权重。

---

# 25. P2 — Logs 布局

宽屏：

```text
Filter Toolbar
──────────────
List | Detail
```

中尺寸：

```text
Filter Wrap
──────────────
List
Detail Drawer / Below
```

优先用 Container Query。

---

# 26. P2 — Model Settings Master / Detail

左侧 Profile List 使用稳定宽度：

```css
grid-template-columns:
  minmax(260px, 300px)
  minmax(0, 1fr);
```

中尺寸改为：

```text
List
↓
Editor
```

---

# 27. P2 — Settings Card Density

当前 Settings Home 卡片可以进一步轻量化。

建议：

```text
高度 140～160px
```

或者使用：

```text
Icon | Title | Description | Arrow
```

减少“后台管理卡片墙”的感觉。

---

# 28. 推荐 PR 顺序

## PR 1 — Sidebar IA

- 一级 Sidebar。
- 对话 / 故事 / 创作 / 素材 / 发布 / 设置。
- 删除全局二级菜单。
- 新增 ModuleTabs。

## PR 2 — Module Tabs

- Story Tabs。
- Creation Tabs。
- Asset Tabs。
- Release Tabs。
- 修正 Active Route。
- Unknown Area 不再 fallback。

## PR 3 — Responsive Follow-up

- Workspace Container Query。
- Model Content Query。
- Logs Content Query。
- Project Overview Content Query。
- Shell / Chat Mobile Collision。

## PR 4 — Interaction Bugfix

- Chat bad route。
- Model Test state。
- ComfyUI tone。
- Composer resize。
- Diagnostics error/accessibility。
- Missing icon / token。
- Status Rail state。

## PR 5 — UI Consistency

- Toast。
- Internal labels。
- Generation monospace。
- Settings density。
- Status Rail sticky。

---

# 29. E2E 新增

必须测试：

```text
Sidebar only shows 6 primary entries
Story Tabs navigation
Creation Tabs navigation
Asset Tabs navigation
Settings reached through one entry
```

响应式：

```text
375x812
430x932
768x1024
1024x768
1280x720
1440x900
1920x1080
```

重点：

```text
1024x768
1280x720
```

---

# 30. Definition of Done

## Navigation

- Sidebar 一级入口 ≤ 6。
- 不再常驻展示二级业务操作。
- 故事 / 创作 / 素材 / 发布使用统一 Tabs。
- Settings 只有一个全局入口。
- Story Switcher 轻量化。

## Responsive

- Workspace Container Query 有效。
- 1024 / 1280 不严重挤压。
- Mobile Chat Header 与 Shell Menu 无重叠。
- Model / Logs 使用 Content Responsive。

## Bugs

- Chat 创作工作区跳转正确。
- Model Test 结果不消失。
- ComfyUI 失败不显示 success。
- Composer 发送后高度恢复。
- Diagnostics 错误可见。
- Status Rail 状态正确。
- 无缺失 Icon / CSS Token。

## UI

- Internal Area 名称不直接暴露。
- Generation Prompt 使用普通字体。
- JSON Preview 使用 Monospace。
- 成功反馈统一 Toast。
- Settings Home 更轻量。

---

# 31. 最终目标结构

```text
Global Sidebar
│
├── 对话
├── 故事
├── 创作
├── 素材
├── 发布
└── 设置
        │
        ▼
Module Page
│
├── Module Tabs
│
└── Page Content
```

故事：

```text
总览
世界设定
状态
故事结构
```

创作：

```text
创建
任务
审核
```

素材：

```text
素材库
图片生成
任务
审核
```

设置：

```text
模型
Memory
Prompt
ComfyUI
Runtime
Logs
Appearance
Automation
```

这套结构最大的价值是：

> **以后新增功能，不再意味着 Sidebar 继续增长。**
