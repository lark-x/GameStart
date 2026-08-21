# 当前数据使用矩阵（Phase 1 事实审查）

> 审查日期：2026-08-21 · 分支：`codex/pr58-review-fixes`
> 本矩阵只记录当前代码的真实消费关系，不描述未来计划。
> UI 中的数据流程页以本矩阵为准。

## 消费方与代码路径

| 消费方 | 代码路径 |
| --- | --- |
| Chat | `apps/api/src/v2/chat/use-cases.ts`（prepareReply，约 L370–L724） |
| Story Analyze | `apps/worker/src/v2/maintenance-dispatch-pump.ts`（场景候选分析，约 L637–L690） |
| Scene Generation | `packages/domain/src/v2/generation/context.ts`（GenerationContext 类型） |
| ComfyUI | `apps/api/src/v2/generation/plugin.ts`（payload 校验 L143–L162） |
| Player | `packages/domain/src/v2/core/runtime.ts`（release graph + stateSchema） |
| Release | `packages/domain/src/v2/core/export.ts`（manifest → canon/graph/stateSchema/assets） |

## 使用矩阵

| 数据 | Chat | Story Analyze | Scene Gen | ComfyUI | Player | Release |
| --- | --- | --- | --- | --- | --- | --- |
| StoryWorld 名称 / Summary | Direct | Direct | Unused | Unused | Unused | Indirect（随 Canon 打包） |
| Character Name | Direct | Direct | Direct | Unused | Indirect（Scene 标题/正文内嵌） | Indirect（随 Canon 打包） |
| Character Summary | Direct | Partial | Unused | Unused | Unused | Indirect |
| Character Persona | Direct | Direct | Unused | Unused | Unused | Indirect |
| Character Home Location | Partial（随角色上下文携带） | Unused | Unused | Unused | Unused | Indirect |
| Location | Unused | Unused | Unused | Unused | Unused | Indirect |
| Fact | Direct | Partial | Direct | Unused | Unused | Indirect |
| Rule | Direct | Unused | Unused | Unused | Unused | Indirect |
| Timeline | Unused | Unused | Unused | Unused | Unused | Indirect |
| Arc | Unused | Unused | Unused | Unused | Indirect（组织 Scene） | Indirect |
| Scene Title | Unused | Partial | Direct | Unused | Indirect | Indirect |
| Scene Body | Unused | Partial | Unused | Unused | Direct | Indirect |
| Choice | Unused | Unused | Unused | Unused | Direct | Indirect |
| State | Unused | Unused | Unused | Unused | Direct | Indirect |
| Memory | Direct | Direct | Unused | Unused | Unused | Unused |
| Formal Asset | Unused | Unused | Unused | Unused | Unused | Direct |

## 关键结论

- Scene Generation Context 只包含：prompt、facts、characters(id+name)、scenes(id+title)。
- Persona、Summary、Location、Rule、Timeline、State、Scene Body、Choice 均未进入 Scene Generation Context。
- ComfyUI payload 只包含 prompt / negativePrompt / workflow / workflowVersion / seed，全部由用户在表单中手动填写；Canon 不自动注入。
- Player Runtime 只消费 Release manifest 中的 graph 与 stateSchema；Canon 不直接参与运行时。
- Release manifest 包含 canon、graph、stateSchema 和正式素材清单。

## Context Assembly（上下文组装）

- Chat：世界观、角色（名称/简介/人设）、事实、规则、记忆汇总为 Chat Context 后传给 Chat LLM；Location 仅随角色上下文部分携带；State 不进入。
- Scene Generation：仅 prompt、facts、characters(id+name)、scenes(id+title) 汇总为 Generation Context；Persona/Summary/Location/Rule/Timeline/State/Scene Body/Choice 均为 unused。
- ComfyUI：仅 prompt / negativePrompt / workflow / workflowVersion / seed 汇总为 ComfyUI Payload；Canon 不自动注入。

## Review 边界

- Scene Candidate → Scene Review → 正式场景图；Image Candidate → Asset Review → 正式素材。
- 候选不直接进入正式数据；AI/ComfyUI 产出必须先审核。

## Release → Player

- Release Manifest → Player Runtime（方向不可逆）。
- Player 只消费 Release manifest 中的 graph 与 stateSchema；Canon 不直接参与运行时。

## 运行时输入（非配置数据）

- 最近消息、当前用户消息、图片附件属于运行时输入，不写入 Canon，但会进入 Chat Context。
- 角色 Home Location 属于 Canon 配置，随角色上下文进入 Chat（Partial），不进入 Scene Generation / ComfyUI。
