# GameStart V2 前端布局与视觉层级稳定化完整整改方案

> 适用范围：`apps/web` 当前 V2 前端  
> 目标：在不更换技术栈、不推翻现有设计令牌和基础 UI 组件的前提下，系统性解决当前 V2 页面在排版、布局、滚动、响应式、信息层级和交互细节上的问题，并形成可长期维护的统一页面布局体系。
>
> 本文面向 Agent 执行。执行前必须以当前 `main` 为准重新检查对应文件与组件，不得假设本文中的具体类名、路径和实现细节完全未变化。

---

# 1. 改造目标

本次改造不是“重新设计一套 UI”，而是完成一次前端稳定化和布局收敛。

最终需要达到：

1. V2 页面不再存在 Shell Header 与页面 Header 重复的问题。
2. Chat 页面形成独立、稳定、无双滚动的全高布局。
3. Sidebar 信息架构更清晰，不再依赖压缩行高解决内容过多问题。
4. 页面宽度、内边距和布局方式由统一 Layout Primitive 管理。
5. Workspace 在中等宽度屏幕下不再被右侧 Status Rail 严重压缩。
6. Settings / Model 页面形成清晰的 Master / Detail 与 Section 层级。
7. Typography 形成明确的字号层级，减少 11px / 12px 文本滥用。
8. 卡片、边框和阴影使用收敛，不再“所有区域都卡片化”。
9. 移动端与 1024～1366 桌面窗口均保持合理可用。
10. 修复当前已知视觉 Token 和可访问性细节问题。
11. 不影响 Chat、Workspace、模型配置、主题配置和现有业务逻辑。
12. 后续新增 Memory Engine / Prompt Engine / Runtime 设置页面时，可以直接复用统一布局体系。

---

# 2. 当前主要问题概览

当前基础设计已经具备：

- Design Tokens
- Theme Tokens
- Button / Input / Select / Textarea
- Field / Badge / Modal / Drawer
- PageHeader
- V2 Shell
- Responsive Media Queries

因此本次不需要重写基础组件库。

主要问题集中在上层布局体系：

```text
基础组件基本统一
        ↓
页面级布局不统一
        ↓
各页面自己解决：
宽度 / Header / Grid / 滚动 / 响应式 / 卡片层级
        ↓
最终产生视觉漂移
```

重点问题：

```text
双 Header
Sidebar 过载
字号偏小
页面宽度不统一
Chat 高度依赖 calc(100dvh - xx)
Chat 双滚动风险
Chat Composer 过高
Chat Bubble 过宽
Chat 暴露过多开发者信息
Diagnostics 插入消息区造成 Layout Shift
Workspace Status Rail 断点过晚
Settings 信息架构割裂
Model Settings 嵌套 Grid 过多
Card 使用过度
响应式依赖 viewport 而非 content width
```

---

# 3. 改造原则

## 3.1 不更换技术栈

保持：

```text
Vue 3
Vue Router
当前 CSS / Tailwind 入口
现有 Design Token
现有 UI Components
Lucide Icons
```

不引入大型 UI Framework，也不做全量重写。

## 3.2 先修布局，再修视觉

优先级：

```text
Layout
↓
Hierarchy
↓
Responsive
↓
Interaction
↓
Visual Polish
```

不得先花大量时间调整颜色、渐变、阴影、主题动画或装饰粒子。

## 3.3 一个页面只有一个主 Header

禁止：

```text
Shell Title
+
PageHeader
+
Page Internal Header
```

同时出现。

允许：

```text
Shell
└── PageHeader
```

或者 Chat 特殊页：

```text
Shell
└── ChatHeader
```

## 3.4 Chat 属于特殊布局

Chat 不应该继承普通“页面内容 + 上下 padding”的模式。

Chat 应是：

```text
Full-height Feature Layout
```

## 3.5 页面宽度必须由 Layout Primitive 控制

统一提供：

```text
narrow
standard
wide
full
```

## 3.6 响应式优先按可用内容宽度思考

V2 有固定 Sidebar，因此复杂页面的断点不能继续只参考浏览器总宽。

优先考虑 Container Query；若暂不采用，则提高 Workspace / Settings 的 viewport breakpoint。

---

# 4. 目标页面架构

V2 页面统一收敛为五种布局模式。

## 4.1 Standard Page

适用：

```text
Appearance
Runtime
Logs
普通设置页
```

结构：

```text
PageHeader
    │
    ▼
Standard Container
    │
    ▼
Sections
```

## 4.2 Master / Detail

适用：

```text
Model Settings
Memory Settings
Asset Library
未来 Prompt Profile
```

结构：

```text
PageHeader

┌───────────────┬─────────────────────────────┐
│ Master List   │ Detail                      │
└───────────────┴─────────────────────────────┘
```

## 4.3 Workspace

适用：

```text
World
Story
State
AI Review
Release
```

结构：

```text
Workspace Header / Toolbar

┌─────────────────────────────┬───────────────┐
│ Main Workspace              │ Context Rail  │
└─────────────────────────────┴───────────────┘
```

小尺寸下 Context Rail 折叠为下方区域或 Drawer。

## 4.4 Chat

结构：

```text
Chat Header
──────────────
Messages
──────────────
Composer
```

只有 Messages 滚动。

## 4.5 Landing

适用 `/v2/start`：

```text
Landing Header

┌────────────────────────┬──────────────────┐
│ Primary Action         │ Recent           │
└────────────────────────┴──────────────────┘
```

---

# 5. Phase 1 — Layout Foundation

## 5.1 重构 V2Shell

目标职责：

```text
V2Shell
├── Sidebar
├── Mobile Sidebar
├── Optional Utility Area
└── RouterView
```

Shell 不再默认承担页面主标题、页面副标题或所有页面统一刷新按钮。

## 5.2 删除默认大 Topbar

当前 Shell 顶部包含页面标题、Story Switcher 和刷新状态。调整后，页面标题交给实际页面的 `PageHeader`，Chat 使用自己的 `ChatHeader`。

全局 Story Switcher 推荐移至 Sidebar Footer 上方：

```text
─────────────────
故事空间

[ 当前故事 ▼ ]

运行时 ●
```

## 5.3 新增 Layout Primitive

建议新增：

```text
components/layout/
├── PageContainer.vue
├── PageSection.vue
├── MasterDetailLayout.vue
├── WorkspaceLayout.vue
└── FeatureShell.vue
```

## 5.4 PageContainer

建议接口：

```ts
size:
  | "narrow"
  | "standard"
  | "wide"
  | "full"

flush?: boolean
```

建议：

```text
narrow   ≈ 840–900px
standard ≈ 1120–1200px
wide     ≈ 1360–1480px
full     无 max-width
```

统一外围 padding：

```text
Large Desktop 28～32px
Desktop       24px
Tablet        20px
Mobile        16px
```

## 5.5 PageHeader 收敛

`PageHeader` 成为普通页面唯一主标题组件。

建议支持：

```ts
eyebrow?
title
description?
actions?
compact?
```

移动端 Actions 自动换到下一行。

## 5.6 PageSection

新增无强卡片感的 Section：

```text
Section Header
──────────────
Content
```

用于减少大量重复的 border + radius + shadow。

---

# 6. Phase 2 — Typography 与 Design Token 整理

## 6.1 字号建议

至少调整为：

```css
--text-xs:   12px;
--text-sm:   13px;
--text-base: 14px;
--text-md:   15px;
--text-lg:   17px;
--text-xl:   20px;
--text-2xl:  clamp(24px, 2vw, 34px);
```

如一次改动影响过大，第一轮至少完成：

```text
xs: 11 → 12
sm: 12 → 13
base: 13 → 14
```

## 6.2 文本使用规则

```text
12px  metadata / hint / technical id / timestamp
13px  secondary body / navigation / form label / badge
14-15px 正文 / 表单内容 / 主要状态
17-20px Section / Card / Feature Title
```

## 6.3 CSS Token 清理

扫描所有 `var(--xxx)`，确认全部有定义。

已知重点：

```text
--primary-foreground
--radius-xs
```

统一到现有 Design Token，或正式补充 Token。

## 6.4 Line Height

建议：

```text
Body       1.55～1.65
Compact UI 1.3～1.45
Heading    1.15～1.3
```

---

# 7. Phase 3 — Sidebar 信息架构整改

建议 Sidebar 重组：

```text
开始

故事
  项目首页
  故事切换
  世界设定
  状态与逻辑
  故事结构

创作
  AI 场景
  素材生成
  审核
  素材库

发布
  发布检查
  运行预览
  导出

────────────

系统
  模型
  ComfyUI
  Memory
  Prompt
  日志
  Runtime
  外观
```

支持 Group 折叠：

```text
故事      ▾
创作      ▸
发布      ▸
系统      ▸
```

当前 route 所属组自动展开。

不要再通过短视口把 40px 导航项压到 36px；允许 Sidebar 自身滚动，保持点击区域 ≥ 40px。

Sidebar Footer 中 Runtime 状态不能永远显示绿色，应绑定真实状态；若没有真实健康状态，使用中性状态。

---

# 8. Phase 4 — Chat 页面专项重构

Chat 是本次最高优先级页面。

## 8.1 删除 `calc(100dvh - xx)`

目标：

```text
Shell Content
└── Chat Feature Shell
    ├── Header
    ├── Messages
    └── Composer
```

Shell 对 Chat 提供 Full Height。

可通过 Route Meta：

```ts
layout: "feature"
```

或者：

```ts
fullHeight: true
```

普通页面：

```text
route padding + page scroll
```

Chat：

```text
no outer scroll + full height
```

## 8.2 唯一滚动区

必须实现：

```css
Chat
height: 100%;
display: flex;
flex-direction: column;

Header
flex: 0 0 auto;

Messages
flex: 1 1 auto;
min-height: 0;
overflow-y: auto;

Composer
flex: 0 0 auto;
```

## 8.3 Chat Header

Desktop：

```text
←  Story / Character Name                     Actions
```

不要默认显示 `conversationId`。

高级功能放入更多菜单：

```text
提炼剧情
Diagnostics
进入创作工作区
复制会话 ID
```

Streaming 时“停止”保持明显可见。

Mobile：

```text
←  花火                           ⋯
```

## 8.4 Message Metadata

正常消息不显示：

```text
completed
pending
角色
你
```

只在异常情况下显示：

```text
生成中
已中断
发送失败
重试
```

## 8.5 Bubble Width

建议：

```text
Assistant max-width: min(760px, 88%)
User      max-width: min(680px, 80%)

Mobile 92～94%
```

避免宽屏上出现超长阅读行。

## 8.6 Composer

新增：

```text
Textarea variant="composer"
```

建议：

```text
min-height: 44px
max-height: 160px
resize: none
```

支持自动增长，最多约 6 行后内部滚动。

Desktop：

```text
[ + ] [ textarea........................ ] [ Send ]
```

Mobile：

```text
[ + ] [ textarea.................... ]
                                [ ↑ ]
```

## 8.7 Streaming 自动滚动

增加：

```ts
isNearBottom
```

当用户距底部小于约 80px时自动跟随。

用户主动上滑后停止自动拉回，并显示：

```text
↓ 查看新消息
```

点击恢复到底部。

禁止每个 delta 强制 `smooth` scroll。

## 8.8 Diagnostics 改 Drawer

Desktop：

```text
Right Drawer
```

Mobile：

```text
Bottom Sheet
```

打开 Diagnostics 不改变 Chat Messages 高度。

## 8.9 Story Analyze 状态

任务成功建议走 Toast，不再插入消息区上方造成 Layout Shift。

## 8.10 历史加载

顶部加载更早消息失败时提供可见重试，不只 `console.error`。

## 8.11 图片消息

第一阶段至少：

- 限制尺寸
- 保持比例
- 点击预览
- 加载失败状态

---

# 9. Phase 5 — Start Page 整改

保留当前“两栏”总体结构：

```text
┌───────────────────────────────┬────────────────────┐
│ 创建故事                     │ 最近故事           │
└───────────────────────────────┴────────────────────┘
```

重点：

1. 角色描述仍然是主输入。
2. Recent Story 不直接展示 Conversation ID。
3. 显示标题 / 角色名、最后消息摘要、更新时间。
4. Recent Item 使用 `RouterLink`，不要 `article role="button"` 模拟按钮。
5. `loadingRecent` 必须有真实 Loading UI。
6. 空列表使用统一 `EmptyState`。

推荐最近故事展示：

```text
花火
“那就这么说定了。”
今天 18:42

继续
```

---

# 10. Phase 6 — Workspace 布局整改

当前 Status Rail 直到 viewport <= 960px 才折叠，考虑 244px Sidebar 后过晚。

优先使用 Container Query。

建议当 Workspace 内容容器小于约：

```text
980～1050px
```

就折叠 Rail。

若仍使用 viewport，建议在约：

```text
1280～1360px
```

提前进入单列或可折叠模式。

默认 Rail 只保留：

```text
当前场景
任务状态
发布状态
服务状态
```

次要信息：

```text
版本修订
结构诊断
状态预览
素材库数量
```

放入“运行详情”。

宽屏 Rail 可使用 Sticky。

---

# 11. Phase 7 — Model Settings 重构

目标：

```text
Page Header

Current Bindings Summary

┌──────────────┬────────────────────────────┐
│ Model List   │ Model Detail               │
└──────────────┴────────────────────────────┘
```

## 11.1 当前绑定摘要

顶部优先展示：

```text
Chat              GPT
Memory            Gemini
Story Analyzer    Claude
Scene Generation  Gemini
```

能力绑定比当前更容易发现。

## 11.2 Model Detail 分区

不要所有 Field 一个大 2-column Grid。

改为：

```text
基础信息
- 档案名称
- 模型名称
- 协议

连接
- API 地址
- API Key
- Timeout

模型能力
- Context Window
- Max Tokens
- Input Modalities
- Temperature
```

短字段双列：

```text
Timeout        Temperature
Context Window Max Tokens
```

长字段单列：

```text
API URL
Model ID
API Key
Input Modalities
```

## 11.3 Model Discovery

独立成为 Model Picker Panel：

```text
搜索
模型数量
可滚动列表
当前选中
```

不要临时插入 Form Grid。

## 11.4 Model List

左侧使用稳定宽度：

```text
260～320px
```

而不是纯比例 Grid。

小尺寸改为单列。

---

# 12. Phase 8 — Settings 信息架构统一

建议统一为：

```text
系统设置

AI
├── 模型
├── Memory
└── Prompt

生成
├── ComfyUI
└── 图片服务

系统
├── Runtime
├── 日志
└── 自动化

界面
└── 外观
```

Sidebar 与 Settings Home 名称保持一致。

内部 route 暂时可继续保留 `services`，但 UI 文案应统一。

为后续 Memory Engine、Prompt Engine、Memory Benchmark 预留明确入口。

---

# 13. Phase 9 — Card / Surface 层级整理

统一四级 Surface：

```text
Page
Section
Card
Interactive Card
```

## Page

背景，无卡片。

## Section

无阴影，可 Divider。

## Card

Surface + Border + Radius + 极轻 Shadow。

## Interactive Card

Hover / Selected / Focus。

普通设置 Section、Binding Row、Status List 不需要全部套 Card。

Card 重点保留给：

```text
Recent Story
Theme Choice
Model Profile
Empty State
Important Summary
Interactive Entity
```

---

# 14. Phase 10 — Responsive 体系

至少覆盖：

```text
320
375
430
768
1024
1280
1366
1440
1920
2560
```

尤其重点：

```text
1024～1366
```

因为存在 Sidebar + Rail + Content Padding 的组合。

大屏页面不要无限拉伸；通过 PageContainer 控制。

只有 Chat、Workspace、大数据表允许 Full / Wide。

---

# 15. Phase 11 — 状态与反馈统一

成功类：

```text
保存成功
提炼任务已发起
模型绑定更新
主题保存
```

统一 Toast。

表单错误使用 Field Error。

页面级错误使用 Inline Alert。

所有已有 Loading State 必须对应 UI：

```text
Button Loading
Section Skeleton
Page Skeleton
Inline Spinner
```

所有列表空状态优先复用 `EmptyState`。

---

# 16. Phase 12 — Accessibility 与交互细节

1. Clickable Card 优先使用 `button` / `RouterLink` / `a`。
2. Keyboard 可操作。
3. 保持明显 Focus Visible。
4. Mobile Touch Target ≥ 44px。
5. Desktop Sidebar Target ≥ 40px。
6. 支持 `prefers-reduced-motion`。
7. Reduced Motion 下减少 Theme Decorations、Card Lift、Sidebar 动画和 Smooth Scroll。
8. 检查所有主题的 Button / Bubble / Badge / Muted Text 对比度。

---

# 17. Theme Decorations

保留当前主题装饰系统，但要求：

- 不覆盖功能层。
- 不降低文字可读性。
- 不影响 Chat 性能。
- Reduced Motion 下减弱或关闭。
- Mobile 可减少装饰数量。
- Dark Theme 不产生明显干扰。

---

# 18. 推荐新增组件

建议逐步新增：

```text
PageContainer.vue
PageSection.vue
MasterDetailLayout.vue
WorkspaceLayout.vue
FeatureShell.vue
ChatHeader.vue
ChatComposer.vue
ChatMessage.vue
ContextDrawer.vue
OverflowMenu.vue
```

不要为了组件化把页面拆成大量无稳定职责的小组件。

---

# 19. Chat 组件拆分建议

推荐：

```text
V2ChatView
├── ChatHeader
├── ChatMessageList
│   └── ChatMessage
├── ChatComposer
└── ChatDiagnosticsDrawer
```

业务状态和 API Client 暂时仍可保留在 `V2ChatView` 或现有 composable 中。

本阶段重点是 UI / Layout，不重做 Chat Domain State。

---

# 20. CSS 架构

Global CSS 只保留：

```text
Tokens
Theme
Base
Shared Layout Primitives
Shared UI Classes
```

Scoped CSS 只处理页面专属结构。

避免页面重复定义：

```text
card
field
button
page width
page padding
section heading
alert
```

Agent 应扫描大量重复：

```text
border: 1px solid var(--border)
border-radius: var(--radius-lg)
background: var(--surface)
box-shadow: var(--shadow-sm)
```

适度抽取为稳定 Primitive，不建立过度复杂 Utility 系统。

---

# 21. Route Meta

建议扩展 V2 Route Meta：

```ts
interface V2RouteMeta {
  title?: string;
  layout?: "standard" | "wide" | "full" | "feature";
  pageSize?: "narrow" | "standard" | "wide" | "full";
}
```

示例：

```text
Start      standard
Chat       feature
Workspace  wide
Models     standard
Logs       wide
```

Shell 根据 Meta 提供正确布局。

---

# 22. 推荐 PR 顺序

## PR 1 — Layout Foundation

- 重构 V2Shell。
- 去掉双 Header。
- Story Switcher 移位。
- 新增 PageContainer / PageSection。
- Route Meta 支持 Layout。
- 统一外围 Padding。

验收：

```text
所有页面只剩一个主 Header
Desktop / Mobile Shell 正常
```

## PR 2 — Typography & Tokens

- 调整字号层级。
- 修复未定义 CSS Variables。
- 统一 Line Height。
- 检查主题对比度。
- Reduced Motion 基础处理。

## PR 3 — Sidebar IA

- 重组导航。
- Group Collapse。
- Active Group 自动展开。
- Story Switcher 移入 Sidebar。
- Footer 整理。
- 移除 36px 强压缩方案。

## PR 4 — Chat Layout

- Feature Layout。
- Header / Messages / Composer 三段式。
- 删除 `calc(100dvh - xx)`。
- Only Messages Scroll。
- Composer Variant。
- Bubble Width。
- 隐藏 Raw ID / Normal Status。

## PR 5 — Chat Interaction Polish

- Near-bottom Auto Follow。
- New Message Indicator。
- Diagnostics Drawer。
- Story Analyze Toast。
- Mobile Overflow Menu。
- 图片 Preview。
- History Load Failure UI。

## PR 6 — Workspace Responsive

- 提前折叠 Status Rail。
- Container Query 优先。
- Rail Sticky。
- 默认状态收敛。

## PR 7 — Model Settings

- Current Bindings Summary。
- Master / Detail。
- Form Sections。
- 长字段单列、短字段双列。
- Model Discovery 独立区域。

## PR 8 — Settings IA & Surface Cleanup

- Settings Home 分组。
- Sidebar Settings 同步。
- Runtime / Logs / Appearance 统一命名。
- Memory / Prompt 预留。
- Section / Card 层级整理。

## PR 9 — Final Frontend Polish

- Empty State。
- Loading Skeleton。
- Keyboard。
- Focus。
- Touch Target。
- Reduced Motion。
- Cross-theme / Responsive Regression。

---

# 23. 测试矩阵

至少检查：

| 宽度 | 高度 | 重点 |
|---:|---:|---|
| 320 | 700 | 最小移动 |
| 375 | 812 | 常见手机 |
| 430 | 932 | 大屏手机 |
| 768 | 1024 | Tablet |
| 1024 | 768 | 小桌面 |
| 1280 | 720 | 小笔记本 |
| 1366 | 768 | 常见笔记本 |
| 1440 | 900 | 桌面 |
| 1920 | 1080 | Full HD |
| 2560 | 1440 | 大屏 |

---

# 24. 页面测试清单

至少覆盖：

```text
/v2/start
/v2/chat/:conversationId
/v2/workspace/project
/v2/workspace/world
/v2/workspace/state
/v2/workspace/story
/v2/workspace/ai-scene-request
/v2/workspace/ai-scene-review
/v2/services/models
/v2/services/comfyui
/v2/services/logs
/v2/services/runtime
/v2/settings
/v2/settings/appearance
```

---

# 25. Chat 必测场景

```text
0 messages
1 message
50 messages
500 messages
long assistant reply
long user reply
image only
text + image
streaming
stop generation
stream failure
load older messages
diagnostics open
mobile keyboard
user scrolls upward while streaming
very long conversation title
```

---

# 26. Model Settings 必测场景

```text
0 profiles
1 profile
10+ profiles
long profile name
long model id
long base URL
model discovery 0 result
model discovery 100+ result
API key exists
connection success
connection failure
all capability bindings
mobile form
```

---

# 27. Theme 必测

所有页面至少检查：

```text
dawn
dusk
blossom
forest
ocean
midnight
```

重点：

```text
Text Contrast
User Chat Bubble
Button
Badge
Input
Selected State
Error
Success
Disabled
Scrollbar
Drawer
Backdrop
```

---

# 28. 自动化建议

如果已有 E2E 基础，建议关键页面增加 Playwright 测试。

关键 viewport：

```text
375x812
1024x768
1366x768
1920x1080
```

关键页面：

```text
Start
Chat
Workspace
Model Settings
Appearance
```

若 Visual Regression 基础成本过高，本阶段可先做 DOM / Interaction E2E。

---

# 29. 性能要求

本次 UI 重构不得明显增加：

```text
initial JS
large dependency
runtime animation
DOM count
re-render frequency
```

尤其 Chat Streaming 不得因为 UI 重构导致每个 Token 触发昂贵测量。

---

# 30. 非目标

Agent 执行期间禁止借机：

- 重写 Vue Store。
- 重写 API Client。
- 重构 Worker。
- 修改 Memory 逻辑。
- 修改 Prompt Engine 业务。
- 更换路由框架。
- 引入大型 UI Library。
- 重做所有 Theme。
- 修改业务字段。
- 同时做 V2.3 Memory 改造。
- 清理大量无关代码。

本次严格聚焦：

```text
Frontend Layout
Visual Hierarchy
Responsive
Interaction Polish
```

---

# 31. Definition of Done

满足以下条件后：

```text
V2 Frontend Layout Stabilization = DONE
```

## Shell

- 无双 Header。
- Sidebar 与页面职责清晰。
- Story Switcher 位置合理。
- Mobile Sidebar 正常。
- Shell 不产生多余页面滚动。

## Layout

- PageContainer 统一。
- Standard / Wide / Full / Feature 有明确规则。
- 页面不再各自控制外围宽度。
- 1024～2560 均合理。

## Typography

- 正文主要字号 ≥ 14px。
- 11px 文本显著减少。
- Heading / Body / Metadata 层级明显。
- 无未定义 Token。

## Chat

- 无 `calc(100dvh - xx)`。
- Messages 是唯一主滚动区。
- Composer 高度合理。
- Streaming 不强制拉回底部。
- Bubble 阅读宽度合理。
- Raw ID / completed status 默认隐藏。
- Diagnostics 使用 Drawer / Sheet。
- Mobile Header 不拥挤。

## Workspace

- 1024～1366 下主区域不被 Rail 严重挤压。
- Status Rail 可折叠。
- Rail 默认信息收敛。
- 宽屏可 Sticky。

## Settings

- Model Settings 信息层级清晰。
- Ability Binding 易发现。
- Settings IA 与 Sidebar 一致。
- 后续 Memory / Prompt 可以自然扩展。

## Responsive

以下尺寸无明显 overflow / overlap：

```text
320
375
430
768
1024
1280
1366
1440
1920
2560
```

## Accessibility

- Clickable Item 使用正确语义元素。
- Keyboard 可操作。
- Focus Visible 正常。
- Mobile Touch Target 合理。
- Reduced Motion 可用。

## Regression

以下业务不得回归：

```text
创建即时故事
进入最近故事
发送消息
Streaming Reply
Stop Generation
上传图片
Story Analyze
Workspace
Story Switch
Model Profile CRUD
Model Binding
Model Discovery
ComfyUI Settings
Appearance Save
Runtime
Logs
```

---

# 32. Agent 执行规则

1. 开始前先检查当前 `main`。
2. 不假设本文中的类名与结构仍完全一致。
3. 每个 PR 只解决一个清晰问题域。
4. 优先保留现有基础 UI Components。
5. 不为追求抽象大规模搬目录。
6. 不修改业务 API Contract，除非布局实现确实无法完成且有明确理由。
7. 每次改动必须验证：
   - typecheck
   - lint
   - unit tests
   - build
8. 如果已有 Web Test，更新对应测试。
9. Chat 重构额外验证：
   - long conversation
   - streaming
   - mobile
10. CSS Token 变更必须检查所有 Theme。
11. 不使用大量 Magic Number 修正布局。
12. 优先使用：
   - flex
   - grid
   - min-height: 0
   - container query
   - max-width primitive
13. 避免：
   - `calc(100dvh - 87px)`
   - 页面级硬编码高度
   - 单一 viewport 特例
14. 不允许 Decorative Layer 遮盖交互区域。
15. 新 Layout Primitive 必须有稳定使用场景，避免过度组件化。

---

# 33. 推荐最终结构

```text
App
│
└── V2Shell
    │
    ├── Sidebar
    │   ├── Brand
    │   ├── Navigation
    │   ├── Story Switcher
    │   └── Runtime / Settings
    │
    └── Route Host
        │
        ├── Standard Page
        │   ├── PageHeader
        │   └── PageContainer
        │
        ├── Master Detail
        │   ├── PageHeader
        │   └── MasterDetailLayout
        │
        ├── Workspace
        │   ├── Compact Header
        │   └── WorkspaceLayout
        │       ├── Main
        │       └── Context Rail
        │
        ├── Chat
        │   └── FeatureShell
        │       ├── ChatHeader
        │       ├── MessageList
        │       └── ChatComposer
        │
        └── Landing
            ├── PageHeader
            └── Landing Layout
```

---

# 34. 最终视觉目标

不是追求复杂视觉效果，而是：

```text
更少的层级
更大的有效内容区
更清楚的标题关系
更稳定的滚动
更一致的间距
更合理的字号
更少的无意义卡片
更好的中尺寸适配
更自然的 Chat
```

最终应让用户感觉：

```text
“功能很多，但页面不乱。”
```

而不是：

```text
“每个功能都做了一个区域，因此页面里到处都是区域。”
```

这也是本次整改最核心的验收标准。
