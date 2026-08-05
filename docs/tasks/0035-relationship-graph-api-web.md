# Task 0035 — 关系网 API 与 Web 视图

## 目标

把已有 RelationshipEdge 领域数据暴露给客户端，并在 Web 中展示角色节点、关系方向、类型和指标。

## 交付内容

- `GET /v1/relationships?storyWorldId=`：验证故事世界并返回共享 `RelationshipEdgeDto`。
- Web 关系网标签页：
  - SVG 环形角色节点；
  - 单向/双向边、公开/非公开线型；
  - 关系类型标签；
  - affinity、trust、conflict、dependency 指标卡。
- 当前切换角色在图中高亮。
- API 与 Web 静态测试覆盖路由、错误边界和渲染入口。

## 明确未包含

- 关系编辑写入 API、布局拖拽、关系事件历史和动态图算法。
- 当前没有远程认证/RBAC，因此 API 仅用于本地作者环境，不在此阶段开放关系修改。

## 验证

- `node --test apps/api/src/relationships.test.ts apps/web/web-shell.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
