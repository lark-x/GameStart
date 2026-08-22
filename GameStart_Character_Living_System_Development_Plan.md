# GameStart Character Living System 开发方案

## 1. 项目目标

当前 GameStart 的 Character 更偏向“故事数据实体”。

目标升级为：

> 一个拥有身份、人格、关系、视觉资产、记忆、状态，并可以被 Chat、Story AI、Image AI 共同消费的核心角色资产。

保持 GameStart 原有原则：

- Canon 是事实源
- AI 输出必须经过 Review
- Player 消费 Release
- 不允许 AI 直接污染正式数据


---

# 2. 核心架构

目标：

```
Character

├ Identity
├ Persona
├ Relationship
├ Visual Profile
├ Memory
├ Runtime State

        ↓

Context Builder

        ↓

Chat / Scene AI / Image AI

        ↓

Candidate

        ↓

Review

        ↓

Formal Data

        ↓

Release

        ↓

Player
```


---

# 3. Phase 1：Character Profile 重构（最高优先级）

## 目标

把当前：

```
name
summary
personaText
```

升级为完整角色档案。


## 新结构

```
Character

├ 基础资料
├ 人格设定
├ 背景故事
├ 标签
├ 使用情况
└ 扩展配置
```


## 基础资料

包含：

- 名称
- 别名
- 简介
- 身份
- 所属世界
- 常驻地点


## 人格设定

拆分：

- 性格特点
- 行为模式
- 说话方式
- 价值观
- 禁忌
- 背景经历
- 高级 Persona Prompt


不要继续依赖一个巨大 Prompt。


---

# 4. Phase 2：Character Relationship 系统

## 新增模型

```
CharacterRelationship

id

fromCharacterId

toCharacterId

type

description

strength

visibility
```


## 支持关系

例如：

```
朋友
家人
恋人
敌人
师徒
同事
竞争者
未知
```


## 用途

### Chat

让角色知道：

```
自己和其他角色的关系
```


### Story Analyze

用于：

```
判断剧情是否符合角色关系
```


### Scene Generation

用于：

```
生成角色互动场景
```


---

# 5. Phase 3：Character Visual Profile

## 目标

让角色和 ComfyUI 建立正确关系。


不要：

```
Character
   |
ComfyUI
```


应该：

```
Character

↓

Visual Profile

↓

Image Context Builder

↓

ComfyUI Adapter

↓

ComfyUI
```


## Visual Profile 内容

### 外观

- 发型
- 发色
- 眼睛
- 身材
- 服装
- 特征


### 图片生成配置

- 默认画风
- LoRA
- Trigger Words
- Negative Prompt
- Workflow Preset


### Reference Image

支持：

- 官方立绘
- 用户上传
- AI 生成
- 审核通过素材


---

# 6. Phase 4：Character Context Builder

## 目标

统一 AI 使用角色数据的方法。


## Stable Context

稳定信息：

```
世界设定

角色身份

人格

关系

规则
```


## Dynamic Context

动态信息：

```
Memory

当前状态

最近事件

当前剧情
```


## Runtime Context

本次请求：

```
用户消息

图片附件

当前任务
```


---

# 7. Chat Context

结构：

```
Character

+

World

+

Persona

+

Relationship

+

Memory

+

Conversation

↓

Chat Context

↓

Chat Model
```


---

# 8. Scene Generation Context

结构：

```
Character

+

Relationship

+

Fact

+

Location

+

Scene

+

State

↓

Scene Context

↓

Scene Model
```


---

# 9. Image Context

结构：

```
Character

+

Visual Profile

+

Scene

+

Location

+

Emotion

↓

Image Context

↓

ComfyUI
```


---

# 10. Phase 5：Character Memory

目标：

让角色具有长期连续性。


## Memory 分类

### Short Memory

最近消息。


### Summary Memory

长期摘要。


### Long Memory

稳定事实：

例如：

```
用户喜欢咖啡

曾一起旅行

重要事件
```


## Memory 类型

```
Fact

Preference

Event

Relationship

Emotion
```


---

# 11. Phase 6：Character Runtime State

注意：

不要和 Story State 混淆。


Story State：

```
剧情变量
```


Character State：

```
角色当前状态
```


示例：

```
mood

trust

energy

location

activity
```


---

# 12. Phase 7：Character Event

新增：

```
CharacterEvent
```


内容：

```
事件名称

参与角色

当前状态

结果
```


用途：

进入：

- Chat
- Story
- Memory
- Scene Generation


---

# 13. Phase 8：聊天系统升级

目标：

角色成为独立聊天对象。


## Conversation

包含：

```
Character

User

Messages

Summary

Memory
```


## UI

设计：

```
头像

角色名称


聊天区域


输入框


功能：

图片

记忆

角色信息
```


---

# 14. Phase 9：图片生成联动

完整流程：

```
Character

+

Visual Profile

+

Scene

+

Prompt

↓

Image Context

↓

ComfyUI

↓

Image Candidate

↓

Review

↓

Formal Asset
```


禁止：

```
ComfyUI生成
直接成为正式素材
```


---

# 15. Character Center UI

新增角色中心页面。


结构：

```
角色主页


头像

名称

简介


[聊天]

[生成图片]

[编辑]


----------------

资料

人格

关系

视觉

记忆

状态

使用情况

----------------
```


---

# 16. Data Flow 集成

新增流程：

```
Character

↓

Character Context

↓

Chat

Scene Generation

Image Generation
```


用户可以查看：

- 哪些数据被使用
- 哪些能力读取
- 哪些字段未使用


---

# 17. 开发顺序

## 第一阶段

完成：

- Character Profile
- Persona 重构
- Character Detail UI
- Relationship


目标：

角色成为完整资产。


---

## 第二阶段

完成：

- Context Builder
- Chat Context
- Scene Context
- Image Context


目标：

角色真正进入 AI 链路。


---

## 第三阶段

完成：

- Memory
- Summary
- Runtime State


目标：

角色具有长期连续性。


---

## 第四阶段

完成：

- Visual Profile
- Reference Image
- LoRA
- ComfyUI Adapter


目标：

角色视觉一致。


---

## 第五阶段

完成：

- Event
- Emotion
- Relationship Evolution
- Proactive Behavior


目标：

动态角色。


---

# 18. 不建议实现

不要：

## 一个巨大 Persona Prompt

原因：

难维护。


## 所有数据全部发送 LLM

原因：

Context 污染。


## Character 直接绑定 ComfyUI

原因：

领域耦合。


## AI 直接修改 Canon

原因：

破坏创作流程。


---

# 19. 最终目标

Character 最终应该成为：

> 一个拥有身份、关系、视觉、记忆和状态，并贯穿 Chat、Story、Image 三套 AI 能力链路的核心资产。

最终架构：

```
StoryWorld

↓

Character

├ Identity
├ Persona
├ Relationship
├ Visual Profile
├ Memory
└ Runtime State


↓

Context Builder


↓

Chat AI

Scene AI

Image AI


↓

Candidate


↓

Review


↓

Formal Content


↓

Release


↓

Player
```
