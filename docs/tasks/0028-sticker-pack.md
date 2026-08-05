# Task 0028 — 表情包导入元数据与查询

## 目标

为消息中的 `STICKER` 引用提供故事世界范围的表情包/表情条目元数据，支持导入记录和客户端查询。

## 交付内容

- `StickerPack`：包名称、来源引用、故事世界和创建时间。
- `Sticker`：包归属、标签、展示文本、媒体引用和创建时间。
- domain/contracts 校验标签、媒体引用、包/世界一致性和防御性拷贝。
- PostgreSQL migration `0009_stickers.sql/down.sql` 及内存/SQL 仓储。
- 只读 API：
  - `GET /v1/sticker-packs?storyWorldId=`
  - `GET /v1/sticker-packs/:packId/stickers`
- JSON 元数据导入 API：`POST /v1/sticker-packs`；导入前完整校验 pack、条目、标签和媒体引用。

## 明确未包含

- ZIP/图片上传、解包、病毒扫描、缩略图、对象存储和 CDN。
- 权限审核、消息发送时的 stickerId 存在性校验；当前导入是元数据写入，生产环境还需事务/审计。

## 验证

- domain、contracts、migration、内存/SQL 仓储和 API 测试。
- 阶段结束运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 `sticker.ts`、contracts、仓储、`0009` migration、API 路由、测试和本任务文档；已有 Message STICKER 类型保持不变。
