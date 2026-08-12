# Task 0032 — Web MVP Shell

## 目标

把已经完成的 API 能力暴露为一个可直接打开的浏览器界面，覆盖角色切换、动态瀑布流、图片展示和表情包浏览。

## 交付内容

- `apps/web/index.html`：角色上下文、动态/资产两个视图。
- `apps/web/src/api.js`：统一 API client，覆盖世界、角色、切换、Feed 和表情包端点。
- `apps/web/src/main.js`：浏览器状态、渲染、刷新和角色切换行为。
- `apps/web/src/styles.css`：响应式卡片瀑布流、角色上下文和资产网格。
- `python3 -m http.server 4173 --directory apps/web` 启动说明和静态契约测试。

## 明确未包含

- 当前环境没有安装 Vue/Vite 依赖，因此本阶段使用浏览器原生 ES modules；视图数据与 API client 已保持可迁移到 Vue 3 的边界。
- 登录认证、聊天 UI、评论/点赞交互、SSE 流式回复、上传和真实媒体 CDN。
- 当前沙箱禁止绑定本地监听端口，无法完成浏览器服务器 smoke test；文件静态检查已通过。

## 验证

- `node --test apps/web/web-shell.test.ts`
- `index.html`、`main.js` 和 `api.js` 的静态入口/端点断言。
- 后续依赖可用时补 Vite/Vue 构建和 Playwright E2E。
