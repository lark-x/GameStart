# Task 0001：工程基础与领域骨架

执行角色：`luna_implementer`（配置目标：GPT-5.6 Luna Max）  
审查角色：主线程 Sol Medium  
状态：Ready，等待运行时允许 `gpt-5.6-luna` 子代理

## 1. 任务目标

创建最小 pnpm monorepo 工程骨架，并实现无框架的 `StoryMode` 与关系动态开关领域模型，使后续 API、Worker 和 Web 可以共享领域规则。

本次只建立工程入口和领域规则，不接数据库、Redis、LLM、ComfyUI 或 UI 页面。

## 2. 允许范围

允许创建或修改：

- `/Volumes/Lark/Study/work/package.json`
- `/Volumes/Lark/Study/work/pnpm-lock.yaml`
- `/Volumes/Lark/Study/work/pnpm-workspace.yaml`
- `/Volumes/Lark/Study/work/tsconfig.base.json`
- `/Volumes/Lark/Study/work/.gitignore`
- `/Volumes/Lark/Study/work/apps/api/**`
- `/Volumes/Lark/Study/work/apps/worker/**`
- `/Volumes/Lark/Study/work/apps/web/**`
- `/Volumes/Lark/Study/work/packages/domain/**`
- `/Volumes/Lark/Study/work/packages/contracts/**`
- `/Volumes/Lark/Study/work/packages/config/**`

允许读取 `docs/DEVELOPMENT.md`、根目录 `AGENTS.md` 和项目 Sol–Luna 配置。

## 3. 禁止范围

- 不修改 `.codex/**`、`.agents/**`、`AGENTS.md` 或 `docs/**`。
- 不创建数据库 Schema、Docker Compose、队列、LLM、ComfyUI 或业务 UI。
- 只允许通过 npm registry 安装根开发依赖 `typescript` 和 `@types/node`，并生成 `pnpm-lock.yaml`。
- 不引入任何生产依赖，也不安装本契约未明确允许的开发依赖。
- 不初始化 Git，不提交，不修改全局配置。
- 不自行调整架构、目录或命名。

## 4. 已知背景

- 当前仓库尚无业务代码。
- 技术方向与领域边界由 `docs/DEVELOPMENT.md` 确定。
- `StoryMode.STATIC` 必须禁止运行时关系变化。
- `StoryMode.DYNAMIC` 可以接受经过领域校验的关系增量。
- 领域包必须是纯 TypeScript，不依赖框架、数据库或供应商 SDK。

## 5. 明确实现内容

### 根目录

- 建立 private pnpm workspace。
- 提供 `typecheck`、`test`、`build` 脚本，使用递归 workspace 命令。
- `tsconfig.base.json` 开启严格类型检查。
- 根开发依赖只包含 `typescript` 和 `@types/node`，具体版本由 lockfile 固定。

### apps

- `apps/api`、`apps/worker`、`apps/web` 只创建 package manifest 和简短 README，占位说明职责。
- 不添加运行时代码或框架依赖。

### packages/contracts

- 创建 package manifest、tsconfig 和入口文件。
- 只导出基础 ID 类型：`CharacterId`、`StoryWorldId`、`RelationshipId`。

### packages/config

- 创建 package manifest、tsconfig 和入口文件。
- 只定义 `AppEnvironment = "development" | "test" | "production"`。

### packages/domain

实现：

- `StoryMode`：`STATIC`、`DYNAMIC`。
- `RelationshipMetric`：至少包含 `affinity`、`trust`、`conflict`、`dependency`。
- `RelationshipState`。
- `RelationshipDelta`。
- `applyRelationshipDelta(mode, current, delta)`。

规则：

- `STATIC` 返回与输入数值一致的新对象，不允许修改任何指标。
- `DYNAMIC` 应用增量。
- 所有指标限制在 `-100` 到 `100`。
- 函数不得修改输入对象。
- 非有限数值必须抛出明确错误。

使用 Node 内置测试运行器编写测试，避免本任务安装第三方测试依赖。

## 6. 完成标准

- 所有允许的 package manifest 可被 pnpm workspace 识别。
- TypeScript 严格模式开启。
- 领域规则完整实现且输入不可变。
- 测试至少覆盖：STATIC、DYNAMIC、上下界、输入不变、NaN/Infinity。
- 无允许范围外的文件变化。

## 7. 验证方法

安装明确允许的开发依赖后执行：

```text
node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'
pnpm -r exec node -e 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8"))'
pnpm --filter @living-network/domain test
pnpm --filter @living-network/domain typecheck
find apps packages -type f -print | sort
```

## 8. 回滚方式

任务失败时，只删除本契约允许范围中新创建的根文件以及 `apps/`、`packages/`。不得删除 `docs/`、`.codex/`、`.agents/` 或 `AGENTS.md`。

## 9. 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
