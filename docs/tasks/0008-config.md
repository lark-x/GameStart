# Task 0008：运行配置与 Feature Flags

## 目标

为 API、Worker、数据库和外部服务建立统一、不可变且可安全摘要的环境配置解析层，避免连接地址、模型参数和功能开关散落在各应用中。

## 本阶段范围

- `AppConfig`：环境、API 监听、PostgreSQL、Redis、ComfyUI、LLM、媒体目录。
- 统一解析端口、URL、环境枚举和布尔 Feature Flags。
- 默认关闭自主事件、主动消息、动态流和图片生成，默认开启发布前人工审核。
- `getSafeConfigSummary` 不输出 LLM API Key。
- Node 内置测试覆盖默认值、显式值、错误字段和敏感信息处理。

## 不在范围内

配置文件加载、密钥管理服务、自动 .env 加载、数据库连接池、Fastify、Worker、LLM/ComfyUI 客户端和新增依赖。

## 验收标准

- 缺少 `DATABASE_URL`、非法 URL/端口/布尔值会抛出带字段名的 `ConfigError`。
- 配置返回对象及其嵌套对象不可变。
- Feature Flags 与开发文档中的名称一致，并使用保守默认值。
- 安全摘要包含是否配置 Key 的信息，但不包含 Key 内容。
- config 测试、既有全套测试和严格类型检查通过。

## 回滚

删除 `packages/config/src/config.test.ts` 和本任务文档，恢复 `packages/config/src/index.ts`、`packages/config/package.json` 到 Task 0001 状态；不得触碰其他包、迁移或根配置。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
