# Task 0021 — 动态流、点赞评论与 Feed API

## 目标

把 READY 的 `MomentDraft` 发布为可查询 `Moment`，提供按故事世界和当前角色过滤的动态 Feed，并统一处理点赞/评论互动及幂等重放。

## 交付内容

- `Moment`：正文、作者、可见性、受众、可选图片媒体引用和发布时间。
- `MomentInteraction`：LIKE/COMMENT、作者、正文、创建时间和 idempotency key。
- 领域规则：READY 草稿才能发布；私有/关系/群组动态校验受众；评论必须有正文，点赞不能带正文。
- contracts DTO/Schema。
- PostgreSQL migration `0007_social_feed.sql`：Feed 索引、受众/世界约束、点赞唯一索引、互动幂等唯一键。
- 内存/SQL 仓储：可见 Feed 查询、互动列表和幂等写入。
- API：
  - `GET /v1/moments?storyWorldId=&readerCharacterId=&limit=`
  - `GET /v1/moments/:id/interactions?readerCharacterId=`
  - `POST /v1/moments/:id/interactions`

## 明确未包含

- 动态发布审核、评论通知、点赞取消、分页 cursor、关系图权限计算。
- 真实对象存储、缩略图、ComfyUI 输出文件校验。
- 真实 PostgreSQL 端到端连接验证；当前环境没有可用数据库服务。

## 验证

- Domain 测试覆盖 READY 发布、可见性和 LIKE/COMMENT payload。
- Database 测试覆盖 migration、Feed 查询、互动幂等和重复点赞。
- API 测试覆盖公开 Feed、私有动态权限、点赞重放和互动读取。
- 全量 Node 测试与严格 TypeScript 检查必须通过。

## 回滚

删除 `social.ts`、对应 contracts/repository/API 文件、migration `0007` 及测试，恢复 Task 0020 的动态草稿和 Worker 边界即可。
