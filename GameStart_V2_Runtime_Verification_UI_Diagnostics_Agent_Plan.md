# GameStart V2 Runtime Verification、UI 稳定化与 Memory Diagnostics 执行方案

> 适用项目：`lark-x/GameStart`
>
> 当前状态：PR #51 已合并，`main` 已具备 Memory Operational Dashboard、Job Runtime、Manual Retry、Job Cursor Pagination 与基础运行可观测能力。
>
> 本方案交由工作区 Agent 执行。
>
> 本阶段目标不是继续扩展新的业务概念，而是把现有 V2 的 Memory、Automation、Settings UI、Failure Recovery 和 Diagnostics 做到更准确、更易用、更可验证。

---

# 1. 本阶段总体目标

当前项目已经基本完成：

```text
V2 Architecture
Settings IA
Docker Deployment Stabilization
Cross-platform Deploy Tests
Model Settings
ComfyUI Runtime Config
Prompt Engine
Fact Ledger
Memory Engine
Memory Operational Dashboard
Job Runtime
Manual Retry
Memory Evaluation Harness
```

下一阶段定义为：

```text
V2 Runtime Verification & UX Stabilization
```

重点从：

```text
“有没有功能”
```

转为：

```text
“功能是否真正好用”
“状态是否真实准确”
“失败后是否可以恢复”
“测试是否能证明最终业务结果正确”
```

---

# 2. 本阶段明确不做

禁止直接实现：

```text
Scheduled Trigger
Event Trigger
Cron Builder
Workflow Builder
Durable Job Audit
Evaluation Score
Memory Quality Score
Entity Count
新的 Memory Domain Model
新的 Queue / Event Bus
```

这些能力如果未来需要，必须独立设计业务规则。

---

# 3. 本阶段开发主线

拆成五个独立 PR：

```text
PR A
Memory / Automation UI & UX Stabilization

PR B
Memory / Automation View Tests

PR C
Failure Recovery Closed-loop Tests

PR D
Memory Diagnostics

PR E
Docker Permission Hardening
```

推荐顺序：

```text
A
↓
B
↓
C
↓
D
↓
E
```

---

# 4. UI 改造总原则

当前页面已经能展示状态，但仍偏工程信息。

统一调整为：

```text
先看结论
↓
再看核心状态
↓
再看详细数据
↓
最后看技术信息
```

所有 Settings 子页面尽量使用统一结构：

```text
PageHeader
Summary
Operational Section
Error / Diagnostics
Advanced / Technical Info
```

禁止每页单独创造新的视觉体系。

---

# 5. PR A：Memory / Automation UI & UX Stabilization

建议标题：

```text
feat(ui): refine memory and automation runtime experience
```

范围只包括：

```text
Memory 页面信息结构
Automation 页面信息结构
Empty / Loading / Error 状态
运行状态层级
Job Overview
Retry UX
响应式
可访问性
```

禁止：

```text
重构整个 Settings
更换 UI Framework
引入 Chart Library
重写 Router
```

---

# 6. Memory 页面目标结构

最终建议：

```text
Memory

[当前状态]

[核心概览]
活跃记忆
关联角色
平均重要度
平均置信度

[记忆构成]
类型分布

[最近运行]
Extraction
Consolidation

[当前异常]
当前失败 / 最近一次失败

[Memory Engine]

[模型绑定]
```

---

# 7. Memory 顶部状态

增加一个轻量 Status Summary。

示例：

```text
Memory 正常
最近提取成功 · 5 分钟前
```

或者：

```text
Memory 暂无数据
完成对话并触发 Memory Extraction 后会显示统计
```

或者：

```text
Memory 存在运行异常
最近一次 Extraction 失败
```

不创建：

```text
Memory Health Score
```

状态只根据真实 Runtime 判断。

---

# 8. Memory 状态规则

```text
latest extraction / consolidation = failed
→ danger

存在 active memory
且最新 terminal run = completed
→ success

active memory = 0
→ neutral

API error
→ error
```

---

# 9. Memory Empty State 必须修复

当前 total=0 时 Empty State 与 0 值 Dashboard 可能同时展示。

要求改为：

```text
overview.facts.total === 0

→ 显示 Empty State
→ 隐藏 Overview 统计卡
→ 隐藏 Type Distribution
→ 仍显示 Memory Engine
→ 仍显示模型绑定
```

文案：

```text
当前还没有长期记忆

对话完成 Memory Extraction 后，
记忆统计会显示在这里。
```

---

# 10. Memory Summary Cards

保留：

```text
活跃记忆
关联角色
平均重要度
平均置信度
```

但增加清晰说明。

例如：

```text
活跃记忆
128

当前处于 active 状态、可被 Memory Engine 使用的记忆。
```

---

# 11. 关联角色说明

必须明确：

```text
基于 Fact Ledger 中：
subject_entity_type = character

按 subject_entity_id 去重统计
```

不要让用户误解为：

```text
Conversation Primary Character 数量
```

---

# 12. 重要度 / 置信度说明

文案：

```text
平均重要度
active Memory 的 importance 平均值

平均置信度
active Memory 的 confidence 平均值
```

禁止解释成：

```text
Memory Quality
```

---

# 13. Memory 类型分布

使用真实：

```text
kind
```

第一版保持简单列表：

```text
角色印象    42
用户偏好    30
角色关系    18
事件记忆    25
世界事实    13
```

可增加简单比例条，但不要引入第三方图表库。

比例计算：

```text
kind count / active memory total
```

属于 Derived Metric，需单测。

---

# 14. Memory Runtime Card

Extraction 与 Consolidation 分为两个独立卡片。

建议：

```text
Memory Extraction

状态        成功
最近运行    20:31
最近开始    20:30
最近失败    昨天 13:20
```

以及：

```text
Memory Consolidation
...
```

---

# 15. 当前失败与历史失败

必须视觉区分：

```text
latest.status === failed
→ Danger
→ “最近运行失败”

latest.status === completed
且 latestFailure 存在
→ Neutral
→ “最近一次失败”
```

历史失败不要大面积使用红色。

---

# 16. 错误信息展示

错误默认显示摘要。

过长时：

```text
错误摘要...
[查看完整错误]
```

禁止把完整长 Stack 默认展开。

---

# 17. Memory Engine UI

不要只展示技术 ID。

建议：

```text
Structured
主引擎
builtin_structured

Hybrid
影子引擎
builtin_hybrid
```

技术 ID 作为 Secondary Text。

---

# 18. Memory 模型绑定

建议：

```text
记忆模型

模型：<profileName>
状态：已配置
```

未配置：

```text
未配置记忆模型
[前往模型设置]
```

如果已有 Router 能力，直接跳到 Model Settings。

---

# 19. Automation 页面目标结构

最终建议：

```text
任务运行中心

[运行概览]
等待中
已认领
运行中
当前失败
累计完成

[筛选]
状态
任务类型

[最近任务 | 任务详情]

[操作]
重新执行
```

---

# 20. Job Overview 本阶段实现

之前 Job Overview 被延期，这一阶段建议补上。

新增：

```text
GET /api/v2/jobs/overview
```

Response：

```json
{
  "pending": 3,
  "claimed": 1,
  "running": 2,
  "completed": 128,
  "failed": 4
}
```

---

# 21. Job Overview SQL

使用：

```sql
SELECT status, COUNT(*) AS count
FROM v2_chat_maintenance_jobs
GROUP BY status
```

禁止前端使用当前第一页 50 条 Job 自行统计全局状态。

---

# 22. Automation Summary Cards

顶部建议：

```text
等待中    3
已认领    1
运行中    2
当前失败  4
```

累计完成可以作为 Secondary Metric：

```text
累计完成 128
```

---

# 23. Job List 简化

每一行只展示：

```text
状态
任务类型
创建时间
Attempt
```

不要把 Payload、错误详情等塞进列表。

---

# 24. Job Detail

右侧 Detail 展示：

```text
Job ID
类型
状态
创建时间
开始时间
最后更新
Attempt / MaxAttempts
Payload Summary
Error
Retry
```

---

# 25. Safe Payload

继续保持：

```text
conversationId
characterId
sourceMessageCount
```

禁止直接返回：

```text
raw payload
API Key
Authorization
Secret
```

---

# 26. Retry UX 改造

当前 Retry 后会重新 load，并可能清掉选中上下文。

改成：

```text
Retry success
↓
reload list
↓
重新 getJob(jobId)
↓
若 Job 仍存在，保持 Detail 选中
```

用户应能看到：

```text
failed
→ pending
→ attempts / maxAttempts 更新
```

---

# 27. Retry 成功反馈

建议：

```text
任务已重新加入队列
```

使用现有 Toast / Inline Feedback。

---

# 28. Retry Conflict

如果后端返回 409：

```text
任务状态已变化，当前不能重新执行。
```

不要只显示：

```text
CONFLICT
```

技术错误码可放详情。

---

# 29. Loading State

Memory 与 Automation 统一：

```text
loading
ready
error
empty
```

如果现有 UI 没有 Skeleton：

```text
显示简单“正在加载…”
```

不要为此引入新 UI 库。

---

# 30. Automation Empty State

保留：

```text
暂时没有后台任务

当对话触发记忆提取、摘要或剧情分析时，
任务会显示在这里。
```

---

# 31. Filter 行为

保留：

```text
Select
+
应用筛选
```

点击应用：

```text
reset jobs
reset cursor
reset selected
load first page
```

---

# 32. Load More

现有 Cursor Pagination 保留。

补充：

```text
loading more
load more error
no more data
```

无 nextCursor 时隐藏按钮即可。

---

# 33. Mobile Layout

Memory：

```text
Summary Cards
Desktop：4 列/自适应
Mobile：1～2 列
```

Automation：

```text
Desktop
List | Detail

Mobile
List
↓
Detail
```

优先使用现有布局能力，不新引入 Drawer，除非项目已有成熟 Drawer。

---

# 34. Accessibility

至少保证：

```text
Job Row 可键盘进入
Enter 可打开 Detail
Retry 有 disabled
Error role=alert
Status 有文字，不只靠颜色
```

---

# 35. PR A Definition of Done

```text
[ ] Memory Empty State 修复
[ ] Memory Status Summary
[ ] Memory Runtime Cards
[ ] Engine 显示优化
[ ] Model Binding 跳转
[ ] Job Overview
[ ] Automation List / Detail 优化
[ ] Retry 后保留上下文
[ ] 用户可读错误
[ ] Desktop / Mobile 可用
```

---

# 36. PR B：Memory / Automation View Tests

建议标题：

```text
test(web): cover memory and automation runtime views
```

目的：

```text
不再只依赖 Adapter / API Tests
直接验证 View 行为
```

---

# 37. Memory View Tests

至少：

```text
Loading
API Error
Empty
Overview
Related Character
Importance
Confidence
Type Distribution
Extraction Success
Extraction Failed
Historical Failure
Consolidation Success
Engine
Model Binding
```

---

# 38. Memory Empty Test

重点验证：

```text
total = 0
```

结果：

```text
显示 Empty State
不显示 0 值统计卡
仍显示 Engine
仍显示 Model Binding
```

---

# 39. Automation View Tests

至少：

```text
Loading
Empty
Job Overview
Job List
Status Filter
Type Filter
Open Detail
Safe Payload
Failed Retry
Retry Loading
Retry Success
Retry 409
Load More
Pagination Reset
API Error
```

---

# 40. Retry View Test

验证：

```text
failed job selected
↓
click retry
↓
button disabled
↓
API success
↓
list reload
↓
detail refreshed
↓
selected context retained
```

---

# 41. Test Stack

继续使用项目现有 Web Test Stack。

禁止仅为这两个 View 引入新的 Testing Library。

---

# 42. PR B Definition of Done

```text
[ ] Memory View 关键状态全覆盖
[ ] Automation View 关键状态全覆盖
[ ] Retry UX 有直接测试
[ ] Load More 有直接测试
[ ] Filter Reset 有直接测试
```

---

# 43. PR C：Failure Recovery Closed-loop Tests

建议标题：

```text
test(runtime): add failure recovery closed-loop coverage
```

这是本阶段 Runtime 正确性的重点。

---

# 44. Manual Retry 完整闭环

当前已经验证：

```text
failed
↓
retry
↓
pending
↓
claimNext
```

下一步必须补：

```text
failed
↓
POST retry
↓
pending
↓
worker claim
↓
worker execute
↓
completed / failed
↓
数据库最终结果
```

---

# 45. Memory Extraction 闭环

构造：

```text
用户消息
↓
memory_extract
↓
Fact Batch
↓
Fact Assertions
↓
memory_engine_consume
↓
v2_memories
```

验证：

```text
Job completed
Fact 不重复
Memory 不重复
数据关联正确
```

---

# 46. Consolidation 闭环

构造：

```text
新 Fact
↓
memory_consolidate
↓
keep / merge / supersede
↓
最终 active / superseded 状态
```

---

# 47. Worker Restart / Lease

基于现有 CAS 测试继续扩展：

```text
Worker A claim
↓
lease expires
↓
Worker B reclaim
↓
Worker A stale update 被拒绝
↓
Worker B 完成
```

要求覆盖真实 Handler，而不只是 Repository。

---

# 48. Retry Side Effect

测试：

```text
第一次执行失败
↓
没有产生错误的持久化结果

Manual Retry
↓
第二次成功
↓
最终只产生一次有效 Fact / Memory
```

---

# 49. LLM Error Recovery

模拟：

```text
timeout
provider error
invalid output
```

验证：

```text
Job Status
lastError
attempts
maxAttempts
Manual Retry
最终恢复
```

---

# 50. DB Error Recovery

模拟：

```text
Fact 写入失败
Memory 写入失败
markCompleted 失败
```

重点验证：

```text
不会形成半成功数据
```

---

# 51. PR C Definition of Done

```text
[ ] Retry → Worker → Final State
[ ] Extraction Recovery
[ ] Consolidation Recovery
[ ] Duplicate Protection
[ ] Stale Worker Protection
[ ] LLM Error Recovery
[ ] DB Error Recovery
[ ] Job 状态与最终业务结果一致
```

---

# 52. PR D：Memory Diagnostics

建议标题：

```text
feat(memory): add runtime diagnostics metrics
```

只使用真实存在的数据。

---

# 53. 第一批 Diagnostics 指标

建议：

```text
最近 24h Extraction Completed
最近 24h Extraction Failed
Extraction Success Rate
最近 24h Consolidation Completed
最近 24h Consolidation Failed
当前失败 Job
Fact Batch Count
Fact Assertion Count
Memory Engine Consume Completed
Memory Engine Consume Failed
```

---

# 54. Derived 指标定义

Extraction Success Rate：

```text
completed memory_extract
/
(completed memory_extract + failed memory_extract)
```

时间窗口：

```text
last 24h
```

分母为 0 时：

```text
null / N/A
```

不要显示 0%。

---

# 55. Diagnostics API

新增：

```text
GET /api/v2/memory/diagnostics
```

不要把所有诊断查询塞进：

```text
/memory/overview
```

原因：

```text
Overview
→ 轻量常用

Diagnostics
→ 查询更重，按需使用
```

---

# 56. Diagnostics 示例

```json
{
  "window": "24h",
  "extraction": {
    "completed": 42,
    "failed": 3,
    "successRate": 0.933
  },
  "consolidation": {
    "completed": 8,
    "failed": 1
  },
  "facts": {
    "batchCount": 52,
    "assertionCount": 286
  },
  "engineConsume": {
    "completed": 48,
    "failed": 2
  }
}
```

字段以实际 Schema 为准。

---

# 57. Diagnostics UI

不要继续增加左侧导航。

第一版放在 Memory 页面：

```text
[高级诊断]
```

可折叠。

展开后最多四组：

```text
24h 运行
Fact Ledger
Engine Consume
当前失败
```

---

# 58. Diagnostics 不做 Health Score

禁止：

```text
Memory Health Score
System Health Score
Memory Quality Score
```

所有指标保持独立。

---

# 59. PR D Tests

至少：

```text
24h window boundary
completed count
failed count
success rate
zero denominator
fact batch count
fact assertion count
engine consume count
API error
Diagnostics UI loading
Diagnostics UI ready
```

---

# 60. PR D Definition of Done

```text
[ ] Diagnostics API
[ ] Extraction Metrics
[ ] Consolidation Metrics
[ ] Fact Ledger Metrics
[ ] Engine Consume Metrics
[ ] Derived Formula Tests
[ ] Advanced Diagnostics UI
```

---

# 61. Evaluation Harness

当前已有：

```text
Recall@5
Recall@10
MRR
Scope Leakage
Retrieval Latency
```

本阶段不把这些指标塞进普通 Settings 首页。

---

# 62. Evaluation 后续阶段

PR D 完成后再规划：

```text
Structured vs Hybrid Benchmark
```

真实 Case：

```text
用户偏好
人物关系
时间变化
事实纠正
世界事实
跨角色隔离
跨世界隔离
长对话 Recall
```

---

# 63. PR E：Docker Permission Hardening

建议标题：

```text
fix(docker): tighten application data permissions
```

当前：

```text
chmod -R 777 /app/data
```

目标：

```text
770
```

但必须独立验证。

---

# 64. Docker Fresh Volume

测试：

```text
docker compose down -v
↓
pnpm deploy
↓
API Ready
↓
SQLite 可写
↓
Media 可写
```

---

# 65. Docker Existing Volume

准备历史 Volume：

```text
旧 Image 正常运行
↓
升级新 Image
↓
API / Worker 启动
↓
SQLite 可写
↓
Media 可写
```

---

# 66. Docker PR 禁止顺手修改

不得同时改：

```text
Compose Network
端口
Container User
Volume Path
deploy.mjs
```

只处理权限。

---

# 67. PR E Definition of Done

```text
[ ] chmod 770
[ ] Fresh Volume
[ ] Existing Volume
[ ] SQLite Write
[ ] Media Write
[ ] API Ready
[ ] Worker Running
```

---

# 68. CI 调整

当前建议：

```text
verify
deploy-unit Ubuntu
deploy-unit Windows
deploy-unit macOS
```

作为稳定 Required Checks 的候选。

---

# 69. Runtime PR CI

PR C / PR D 必须至少额外跑：

```text
integration
```

如果现有 PR 默认 skip，可以按路径增加 Runtime Integration Job。

不要直接让所有 PR 跑全量重型 E2E。

---

# 70. E2E 范围

只保留关键路径：

```text
Memory 页面加载
Automation 页面加载
失败 Job Retry
Retry 后状态变化
```

其余主要用 Unit / Integration 覆盖。

---

# 71. Settings UI 一致性检查

Agent 完成 PR A 后顺手审查：

```text
Runtime
Model
Image
Memory
Automation
```

确保：

```text
Page Header 风格一致
Error 风格一致
Loading 风格一致
Section 间距一致
Card Radius / Border 一致
Mobile 行为一致
```

但禁止重新设计整个 Settings。

---

# 72. UI 文案规则

用户可见文案优先中文业务语义。

技术名词可保留：

```text
Memory
Job
Extraction
Consolidation
Fact Ledger
```

但要有中文上下文。

不要使用：

```text
Entity Count
Evaluation Score
Trigger Status
```

等当前不存在或容易误导的概念。

---

# 73. Existing / Derived / New Domain

Agent 每增加一个指标必须分类：

```text
Existing
真实字段 / Runtime 状态

Derived
有明确公式

New Domain
需要业务定义
```

只有前两类可在本阶段实现。

---

# 74. Agent 开发前检查

每个 PR：

```text
git fetch
git checkout main
git pull
```

确认：

```text
工作区干净
```

然后先阅读真实 Schema / Runtime，再编码。

---

# 75. 禁止 Agent 自行做产品决策

如果开发过程中发现计划要求的数据不存在：

```text
降低 UI
记录缺口
```

不要擅自：

```text
新建字段
新建表
创造新 Score
创造新 Trigger
```

---

# 76. 最终推荐 PR 路线

```text
PR A
UI / UX Stabilization

↓

PR B
View Tests

↓

PR C
Failure Recovery Closed-loop

↓

PR D
Memory Diagnostics

↓

PR E
Docker Permission Hardening

↓

后续
Evaluation Regression
```

---

# 77. 本阶段最终验收

完成后：

```text
Memory
✓ 信息层级清晰
✓ Empty / Error / Loading 正确
✓ 当前异常与历史失败区分
✓ Diagnostics 可查

Automation
✓ Overview
✓ 最近任务
✓ Detail
✓ Retry
✓ Retry 后上下文保持
✓ Pagination

Tests
✓ View 行为有直接覆盖
✓ Retry 有完整业务闭环
✓ Failure Recovery 有 Integration Coverage

Docker
✓ 权限收紧且升级兼容
```

---

# 78. 最终目标

当前 GameStart 已经基本结束“大规模架构整改”阶段。

本阶段目标是把系统从：

```text
功能已经存在
```

推进到：

```text
用户看得懂
状态看得准
失败找得到
任务能恢复
界面足够稳定
测试能证明最终结果正确
```

完成本方案后，再进入：

```text
Memory Evaluation Regression
Long Conversation Benchmark
Trigger Domain Design
```

而不是现在继续扩充尚未定义清楚的新业务能力。
