# Living Network 前端开发规范

状态：当前强制规范。现有页面仍有裸交互元素、硬编码颜色、`!important` 和超大组件等历史债务；这些存量问题不代表规则失效。新变更不得扩大债务，触及相关区域时应在任务范围内优先收敛，无法收敛则在交付说明中记录例外和后续处理。

## 1. 技术基线

- 框架：Vue 3 Composition API、Vue Router、Pinia、TypeScript。
- 样式：Tailwind CSS 4 + 项目语义令牌，唯一样式入口是 `src/tailwind.css`，由 `src/main-vue.ts` 以 ESM `import` 方式加载。
- 组件：源码型 shadcn-vue 风格组件，交互原语使用 Reka UI。
- 图标：统一使用 Lucide Vue，禁止在页面中新增字符图标或手写 SVG path。
- 许可证：新增前端依赖必须使用 MIT、Apache-2.0、ISC 或同等宽松协议，并在评审中说明。

## 2. 目录职责

`src/components/ui` 只放无业务含义的基础组件；`src/components/layout` 放应用壳、导航、页面头部和面板布局；`src/components/domain` 放跨页面复用的业务组件；`src/views` 只负责页面编排、数据请求和页面级状态；`src/lib` 放无副作用的工具与主题管理。

页面不得重复实现 Button、Input、Select、Textarea、Card、Badge、EmptyState、PageHeader 或导航。业务组件通过 Props 接收数据，通过 Emits 抛出用户动作，不直接修改 Pinia 之外的外部状态。

## 3. 样式工程

- 唯一全局样式文件是 `src/tailwind.css`，结构分四层：设计令牌（`:root` 与 `[data-theme]`）、基础层（`@layer base`）、组件类（`.ui-*`）、布局类（`.app-*`、`.page-*`）。
- 禁止在 `index.html` 中新增 `<link rel="stylesheet">`；禁止新建并列的全局 CSS 文件；不再保留 styles.css / index.css / ui-overrides.css 这类中间层。
- 禁止用元素选择器给裸标签施加全局视觉样式（例如 `section button { ... }`）。裸标签只允许在 `@layer base` 中做排版继承级别的 reset，不允许出现颜色、边框、阴影。
- 页面 scoped 样式只写该页面独有的编排规则（网格结构、局部对齐），颜色、圆角、阴影、字号一律引用令牌变量。

## 4. 视觉令牌与皮肤系统

颜色、圆角、阴影、间距和动效必须引用 `src/tailwind.css` 的语义变量。页面中禁止直接写品牌色、阴影和非标准圆角；禁止用 `!important` 修正组件样式。

令牌分层：

- 主题无关令牌（`:root`）：字体、字号、间距、圆角、布局尺寸、动效时长。
- 皮肤令牌（`:root` / `[data-theme="dawn|dusk|blossom"]`）：背景、表面、文字、边框、主色、状态色、阴影、环境光斑、页面渐变。

皮肤系统规则：

- 当前皮肤：`dawn`（暖阳，默认）、`dusk`（夜幕，深色）、`blossom`（樱语）。新增皮肤只需要在 `src/tailwind.css` 增加一组 `[data-theme]` 变量，并在 `src/lib/theme.ts` 的 `THEMES` 中登记名称与色板。
- 主题由 `src/lib/theme.ts` 统一管理：写入 `<html data-theme>`、持久化到 `localStorage`（键 `living-network-theme`）、跟随系统深色偏好作为初始值。
- 组件与页面只允许消费语义令牌（如 `var(--primary)`），不得针对某个主题写补丁样式；确需主题差异时，调整令牌值而不是覆盖组件。
- 默认圆角分为小、中、大三级，重复列表项优先使用小圆角，页面卡片使用大圆角。品牌方向保持温暖、柔和、叙事化。

## 5. 组件规则

- 页面与业务组件中禁止直接使用裸 `<button>`、`<input>`、`<select>`、`<textarea>` 承担交互，一律使用 `components/ui` 中的 Button、Input、Select、Textarea。唯一例外是表单语义需要的原生元素包裹（如 label 内 checkbox 改由统一样式类承担）。
- Button 必须明确 `variant` 和 `size`；异步操作必须提供 loading 和 disabled 状态。
- 图标按钮使用 `variant="ghost" size="icon"` 并必须有 `aria-label`，不使用文字替代熟悉图标。
- 表单控件必须有可关联的 label、错误信息和 disabled 状态。
- 状态统一使用 Badge 的 `neutral`、`info`、`success`、`warning`、`danger`。
- 数据为空时使用 EmptyState；加载时使用明确的加载状态；失败时保留可重试操作。
- Dialog、Sheet、Tooltip 等浮层必须支持 Esc 关闭、焦点管理和移动端操作。
- 业务页面只组合组件，不覆盖组件内部 DOM 结构。

## 6. 布局、滚动与响应式

- 页面级滚动容器只有一个：`.app-main`。页面根元素不得再声明 `height: 100%` 叠加 `overflow: auto`，避免嵌套双滚动条。
- 功能性滚动区（聊天消息流、长列表面板）允许独立滚动，但必须使用统一细滚动条样式，并在视觉上属于一个面板内部。
- 布局自适应使用流式手段：`clamp()` 流体间距、`repeat(auto-fill, minmax(...))` 自适应网格、`min()`/`max()` 约束宽度。禁止只写死三列再补一两个断点的跳变式布局。
- 页面最低支持 360px 宽度；不得使用固定的 960px 最小宽度。
- 768px 以下导航进入移动抽屉，复杂双栏布局改为单列。
- 触控操作区域不小于 40px；键盘焦点必须清晰可见。
- 颜色不能作为唯一状态表达；图片必须提供替代文本；表单字段必须有 label 或等价的 aria-label。
- 动效需要尊重 `prefers-reduced-motion`。
- 聊天 composer 的展开型功能（如表情包、请求对方发图、后续扩展的附件库或快捷素材）必须使用锚定在工具栏上方的浮层，不得在 composer 内部向下或向内撑开输入区；浮层必须内部滚动、Esc/外部点击关闭，并在 360px 宽度下无横向溢出。
- 聊天 composer 的单步功能（如打开系统文件选择器）不创建空面板；原生文件 input 必须视觉隐藏，不得暴露浏览器默认“选择文件”文本。

## 7. 页面组织

每个页面使用统一的 PageHeader 与 `.page` 容器，内容放入稳定的内容容器，操作放在标题区右侧。页面需要分别定义加载、空数据、错误和成功后的状态，不用静默失败替代反馈。

聊天页面可以拥有会话面板，但面板标题、边框、选中态和滚动行为必须复用统一面板令牌。管理页面的表单保持紧凑网格，但字段间距、按钮和校验反馈必须来自基础组件。

## 8. 质量门槛

提交前必须通过：

1. `pnpm --filter @living-network/web typecheck`
2. `pnpm --filter @living-network/web build`
3. `pnpm --filter @living-network/web test`（前端单元/接口测试）和 Playwright 核心路径测试。
4. 桌面端与 360px 移动端页面检查，确认无横向溢出、文字截断和遮挡。
5. 三套皮肤逐一检查，确认对比度可读、无令牌遗漏导致的突兀色块。

新增共享组件必须至少覆盖默认、hover、focus、disabled、loading 或 error 中适用的状态。页面改版需要同步更新视觉截图基线，业务逻辑变更需要同步更新行为测试。

在项目自定义规则尚未全部自动化前，评审必须额外搜索本次新增行中的裸交互元素、十六进制颜色、`!important`、并列全局样式和页面级滚动容器。禁止通过降低 lint 级别、增加忽略项或复制旧违规来通过验收。

## 9. 评审清单

- 是否复用了现有基础组件，而不是新增裸元素或相似 CSS？
- 是否使用语义令牌，而不是硬编码颜色和尺寸？
- 是否在三套皮肤下都验证过，而不是只看默认皮肤？
- 是否保持了 `.app-main` 单滚动容器，没有新增页面级 `overflow`？
- 是否覆盖空数据、加载、失败、禁用和窄屏状态？
- 是否为图标按钮提供可访问名称？
- 是否保持现有路由、API 和 Pinia 数据契约？
- 是否检查了第三方依赖的许可证和包体积？
