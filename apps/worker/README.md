# `@living-network/worker`

V2 独立 Worker 负责 SQLite outbox 派发、BullMQ/Redis 消费、场景/资产生成、有限重试、租约恢复、候选提交和本地媒体落盘。

## 本地启动

```sh
pnpm --filter @living-network/worker start:v2
```

Worker 使用 `V2_SQLITE_PATH` 打开的 SQLite 文件，并先检查 API 已完成全部 V2 migrations；schema 不完整时直接失败，不自行迁移。只有场景或资产能力显式开启时才创建对应 Redis 队列和消费者。

任务必须保持稳定幂等键、有限 attempts、明确终态和租约恢复。LLM/ComfyUI 输出先经过解析和领域校验，再通过 Candidate port 提交，不能直接写入 Canon。

## 验证

```sh
pnpm --filter @living-network/worker typecheck
pnpm --filter @living-network/worker test
pnpm --filter @living-network/worker build
```

默认测试使用 Fake provider、Fake queue 或 SQLite 替身。真实 Redis 通过根目录 `RUN_V2_REAL_INTEGRATION=1 pnpm test:integration` 单独验收。
