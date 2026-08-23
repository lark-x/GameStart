# 故事正典创作系统 (Narrative Authoring System V2) 架构指南

本文档全面阐述 Living Network V2 Narrative Authoring（故事正典创作系统）的核心领域模型、数据流、并发控制规范、AI 上下文体系及发布运行时快照机制。

---

## 1. 核心领域模型与四级大纲层级 (4-Level Hierarchy)

Narrative V2 确立了从宏观世界观到微观台词的确定性四级层级结构：

```
Story World (世界正典，具备全局单调递增 revision)
 ├── Arc (篇章 / 剧幕，例如：“第一幕：辞行久远之躯”)
 │    ├── Chapter (章节，例如：“第一章：浮世浮生千岩间”)
 │    │    ├── Quest (任务 / 阶段，例如：“主线任务：黄金屋对峙”)
 │    │    │    └── Scene (场景剧本，例如：“场景1：仙祖法蜕的隐秘”)
 │    │    │         ├── Scene Blocks (剧本分块：dialogue, narration, action, etc.)
 │    │    │         ├── References (多态引用：角色、发生地点、世界观设定、时间线)
 │    │    │         └── Choices (分支选项与状态门禁)
```

### 1.1 核心数据结构

| 实体 | 标识符 | 核心属性 | 说明 |
| :--- | :--- | :--- | :--- |
| **Arc** | `arcId` | `storyWorldId`, `title`, `summary` | 宏观叙事大幕 |
| **Chapter** | `chapterId` | `storyWorldId`, `arcId`, `title`, `ordinal`, `revision` | 章节单元，属于特定 Arc |
| **Quest** | `questId` | `storyWorldId`, `arcId`, `chapterId`, `title`, `kind`, `ordinal`, `revision` | 任务单元，支持 `main`/`story`/`character`/`side` 等类型 |
| **Scene** | `sceneId` | `storyWorldId`, `arcId`, `chapterId`, `questId`, `title`, `documentMode`, `isEntry`, `ordinal`, `revision` | 场景剧本节点，支持 `legacy_body` 与 `blocks` 双模式 |
| **SceneBlock** | `blockId` | `storyWorldId`, `sceneId`, `ordinal`, `kind`, `speakerCharacterId`, `text`, `payload`, `revision` | 细粒度剧本块，包含说话人、动作演出、旁白与指令 |
| **Reference** | `referenceId` | `storyWorldId`, `sourceType`, `sourceId`, `targetType`, `targetId`, `role` | 多态引用，关联 `character`, `location`, `lore`, `fact`, `timeline` |
| **LoreEntry** | `loreEntryId` | `storyWorldId`, `name`, `type`, `summary`, `body`, `tags`, `revision` | 世界观设定词条（如历史、神器、阵营、法则） |

---

## 2. 并发控制与一致性保障 (CAS & Concurrency Integrity)

### 2.1 乐观并发控制 (CAS)
- **World Revision 保护**：所有正典写操作（创建章节、任务、设定、引用更新、大纲模板应用）均支持传入 `expectedRevision`。若传入值与数据库当前版本不符，原子拒绝并抛出 `409 STALE_REVISION`。
- **Scene Revision 保护**：保存场景文档 `saveSceneDocument` 实施**双重 CAS 校验**（校验 `expectedRevision` 与 `expectedSceneRevision`），成功后在单事务内同时推进场景版本与世界全局版本。
- **SceneBlock Revision 稳定演进**：客户端提交已有 Block 时保持其原始 `blockId`，修改内容时版本递增（`revision + 1`），内容未改时版本与时间戳保持不变，新增 Block 赋予新 ID 并以 `revision = 1` 初始。

### 2.2 幂等性防重放 (`withIdempotency`)
- 所有写 API 在单数据库事务中执行，接收客户端传递的 `idempotencyKey`。
- 重复提交相同 `idempotencyKey` 且 payload 相同的请求，直接返回首创缓存响应，绝不产生重复记录（例如模板套用重试不会生成第二套大纲节点）。

### 2.3 删除安全防护 (`HAS_CHILDREN`)
- 尝试删除带有子 Quest 或子 Scene 的 Chapter，强制拦截并返回 `409 HAS_CHILDREN`，杜绝悬空场景产生。
- 尝试删除带有子 Scene 的 Quest，强制拦截并返回 `409 HAS_CHILDREN`。

---

## 3. 任务级 AI 上下文引擎 (Task-Scoped Context Engine)

`packages/domain/src/v2/narrative/context-selection.ts` 实现了纯领域无框架依赖的 AI 提示词与上下文构造器：

### 3.1 任务类型感知
支持细分任务模式：`create_scene`, `continue_scene`, `rewrite_scene`, `expand_dialogue`, `generate_choices`, `create_quest_outline`。

### 3.2 全维度结构化分块与 Token Budget 动态裁剪
- **分块优先级**：
  1. `世界设定` (World Setting)
  2. `大纲层级` (Arc & Chapter Path)
  3. `当前任务` (Target Quest)
  4. `发生地点` (Main Location)
  5. `登场角色正典档案` (Relevant Characters Persona & Taboos)
  6. `当前场景剧本` (Current Scene Blocks)
  7. `分支选项` (Outgoing Choices)
  8. `关联设定词条` (Lore Entries，超出预算时优先动态裁剪并记录 `omittedSources`)
  9. `正典规则与事实` (Canon Invariants & Facts)
  10. `创作任务与作者指令` (Author Prompt)
- **确定性指纹 (Context Fingerprint)**：计算入选依赖实体版本的 SHA-256 摘要，实现跨进程与前后端上下文同构。

---

## 4. 结构化候选审核与版本新鲜度 (Structured Candidate Review & Freshness)

1. **结构化 Candidate Payload**：AI 生成的候选场景原生支持 `document.blocks` 剧本分块与 `references` 正典引用。
2. **原子审核合并**：审核通过时，在单事务内同时完成场景图节点创建、分块保存入 `v2_scene_blocks`、多态引用批量替换与世界版本递增。
3. **精细化新鲜度检验**：基于候选上下文关联实体（而非仅全局版本号）判断是否发生核心冲突，避免无关 NPC 修改导致候选被意外废弃。

---

## 5. 发布快照与运行时离线支持 (Release Snapshot & Player Runtime)

1. **不可变 Release Manifest**：发布时快照化全量结构化剧本、章节任务层级、世界观词条与引用，生成确定性 Content Hash。
2. **Player Runtime 纯离线游玩**：玩家运行时直接读取快照化结构并响应分支选项与状态门禁，对未知指令采用容错降级策略。
3. **多格式全量导出**：
   - **Markdown 导出**：自动渲染层级标题（`# Arc` $\to$ `## Chapter` $\to$ `### Quest` $\to$ `#### Scene`）、分块台词、角色姓名加粗与选项勾选列表。
   - **JSON 导出**：导出完备的结构化正典数据字典。
