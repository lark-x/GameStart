# V2 Interface Requests 使用说明

状态：公共模板，仅作说明；并行分支不得共同追加本文件。

每个 AI 在自己的 owner path 创建独立请求文件：

- `docs/v2/interface-requests/core-domain-runtime.md`
- `docs/v2/interface-requests/generation-assets.md`
- `docs/v2/interface-requests/web-product.md`

请求必须在发现时登记。`blocking` 立即交给维护者裁决；`integration` 在对应 Slice 合入前处理；`enhancement` 可排入后续范围。不能等三个分支全部结束后才暴露阻塞接口。

请求格式：

```md
## REQ-<branch>-<number>: <short title>

- Status: proposed | accepted | rejected | implemented
- Severity: blocking | integration | enhancement
- Needed by:
- Owner of affected contract/module:
- Current contract or behavior:
- Proposed contract or behavior:
- Producers affected:
- Consumers affected:
- Failure/error semantics:
- Fixture/test changes:
- Reason:
- Compatibility and migration impact:
- Decision and integration commit:
```

公共 contract 的接受流程、owner 和分阶段集成规则以 [V2 三 AI 并行开发主文档](./ai-parallel-master-plan.md) 为准。
