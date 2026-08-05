# Task 0030 — MVP 跨包验收闭环

## 目标

用一条可重复测试的跨包链路验证 MVP：角色切换、事件执行快照、结构化动态行动、Fake ComfyUI 图片任务、动态发布、Feed 查询和幂等重放。

## 验证内容

- 用户 ActorSession 从一个 USER 角色切换到另一个 USER 角色。
- Worker 根据 EventExecution 创建 CREATE_MOMENT 行动、MomentDraft 和 ImageJob。
- Fake ComfyUI 将图片任务推进到 `SUCCEEDED`，草稿进入 `READY`。
- 发布协调器创建带图片的公开 Moment，草稿进入 `PUBLISHED`。
- API Feed 和 ImageJob 状态端点读取结果。
- 重放相同 action id / moment id 不产生重复记录。
- STATIC 世界的关系边状态保持不变。

## 未包含

- 真实 PostgreSQL、Redis、MinIO 或 ComfyUI 服务；本测试使用内存仓储和 Fake ComfyUI。
- Web 浏览器 E2E、真实认证和文件对象存储。

## 验证命令

```sh
node --test integration/mvp-flow.test.ts
```

阶段回归还需运行仓库全量 Node 测试和全部严格 TypeScript 检查。
