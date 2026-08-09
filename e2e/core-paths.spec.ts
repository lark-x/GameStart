import { expect, test } from "@playwright/test";

const candidate = {
  id: "candidate-e2e-1",
  category: "MANUAL",
  definition: { id: "event-e2e-1", name: "E2E 手动事件" },
  occurrence: { id: "occurrence-e2e-1", status: "PENDING" },
  scheduledFor: "2030-01-01T12:00:00.000Z",
  targetCharacterIds: ["character-e2e-target"],
  recipientCharacterIds: ["character-e2e-recipient"],
  outputSummary: ["发送消息", "发布动态"],
  risks: [],
  allowedActions: ["RUN_TRIAL"],
};

test("player feed loads from the dev seed", async ({ page }) => {
  await page.goto("/feed");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("chat page loads from the dev seed", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("main")).toBeVisible();
});

test("relationships page loads from the dev seed", async ({ page }) => {
  await page.goto("/relationships");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("creator mode exposes all five creator navigation entries", async ({ page }) => {
  await page.goto("/feed");
  await page.getByRole("button", { name: "创作中心" }).click();
  const navigation = page.getByRole("complementary", { name: "主导航" });
  await expect(page).toHaveURL(/\/creator\/dispatch$/);
  for (const label of ["事件调度台", "内容管理", "视觉工作台", "集成设置", "交互日志"]) {
    await expect(navigation.getByRole("link", { name: label })).toBeVisible();
  }
});

test("memory API dispatch console shows not-started and unsupported dispatch state", async ({ page }) => {
  const candidatesResponse = page.waitForResponse("**/v1/creator/worlds/*/event-candidates**");
  await page.goto("/creator/dispatch");
  const payload = await (await candidatesResponse).json();
  expect(["NOT_STARTED", "RUNNING"]).toContain(payload.data?.workerStatus ?? "NOT_STARTED");
  await expect(page.getByRole("heading", { name: "事件调度台" })).toBeVisible();
  if (payload.data?.dispatchAvailable === false) await expect(page.getByText("当前运行模式不支持派发", { exact: false })).toBeVisible();
});

test("creator dispatch previews and completes a mocked batch", async ({ page }) => {
  let batchReads = 0;
  await page.route("**/v1/creator/worlds/*/event-candidates**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { candidates: [candidate], dispatchAvailable: true, workerStatus: "RUNNING" } }) });
  });
  await page.route("**/v1/creator/worlds/*/event-dispatches/preview", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { canDispatch: true, items: [{ candidateId: candidate.id, effect: "将为角色创建一次试演事件" }], risks: [] } }) });
  });
  await page.route("**/v1/creator/worlds/*/event-dispatches", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "batch-e2e-1", status: "PENDING_DISPATCH", items: [{ candidateId: candidate.id, status: "PENDING_DISPATCH" }] } }) });
  });
  await page.route("**/v1/creator/event-dispatches/batch-e2e-1", async (route) => {
    batchReads += 1;
    const completed = batchReads > 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { id: "batch-e2e-1", status: completed ? "COMPLETED" : "PENDING_DISPATCH", items: [{ candidateId: candidate.id, status: completed ? "COMPLETED" : "RUNNING" }] } }) });
  });
  await page.goto("/creator/dispatch");
  await expect(page.getByText("E2E 手动事件")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "查看影响" }).click();
  await expect(page.getByRole("heading", { name: "影响预览" })).toBeVisible();
  await page.getByRole("button", { name: "确认派发" }).click();
  await expect(page.getByText("COMPLETED", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
});

test("creator content management page loads without mutating seed data", async ({ page }) => {
  await page.goto("/creator/content");
  await expect(page.getByRole("heading", { name: "故事世界" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "角色档案" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "关系设定" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "事件安排" })).toBeVisible();
});

test("mobile creator navigation opens and closes without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/creator/dispatch");
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.getByRole("complementary", { name: "主导航" })).toHaveClass(/app-nav-open/);
  await page.getByRole("button", { name: "关闭导航" }).click();
  await expect(page.getByRole("complementary", { name: "主导航" })).not.toHaveClass(/app-nav-open/);
});
test("private USER text queues one automatic reply without a second stream call", async ({ page }) => {
  let sent: Record<string, unknown> | undefined;
  let messageReads = 0;

  await page.route("**/v1/conversations/dev-conversation/messages**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      sent = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-correlation-id": "chat-e2e-correlation" },
        body: JSON.stringify({
          data: {
            message: sent,
            inserted: true,
            autoReply: {
              status: "QUEUED",
              correlationId: "chat-e2e-correlation",
              sourceMessageId: sent.id,
            },
          },
        }),
      });
      return;
    }

    messageReads += 1;
    const messages: Record<string, unknown>[] = [{
      id: "dev-message-welcome",
      conversationId: "dev-conversation",
      authorCharacterId: "dev-character",
      kind: "TEXT",
      text: "今天想从哪里开始？我在这里。",
      createdAt: "2026-08-05T00:00:00.000Z",
      idempotencyKey: "dev-message-welcome",
    }];
    if (sent) {
      messages.push(sent);
      if (messageReads >= 3) {
        messages.push({
          id: "assistant:dev-conversation:" + String(sent.id),
          conversationId: "dev-conversation",
          authorCharacterId: "dev-character",
          kind: "TEXT",
          text: "这是一条自动回复。",
          createdAt: "2026-08-09T00:00:01.000Z",
          idempotencyKey: "assistant:dev-conversation:" + String(sent.id),
        });
      }
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: messages }),
    });
  });

  await page.goto("/chat");
  await page.getByPlaceholder("输入消息…").fill("自动回复测试");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByRole("paragraph").filter({ hasText: "这是一条自动回复。" })).toBeVisible({ timeout: 8_000 });
  expect(sent?.kind).toBe("TEXT");
});
test("creator interaction logs support filters, details, and 360px layout", async ({ page }) => {
  const log = {
    id: "log-e2e-1",
    createdAt: "2026-08-09T08:00:00.000Z",
    level: "ERROR",
    source: "AI",
    category: "LLM",
    action: "provider.complete",
    outcome: "FAILURE",
    durationMs: 42,
    correlationId: "corr-e2e-1",
    message: "Fake provider failure",
    details: { code: "HTTP_ERROR" },
  };

  await page.route("**/v1/interaction-logs**", async (route) => {
    if (route.request().url().includes("/stream")) {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [log] } }),
    });
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/creator/logs?correlationId=corr-e2e-1");
  await expect(page.getByRole("heading", { name: "交互日志" })).toBeVisible();
  await expect(page.locator('input[placeholder="Correlation ID"]')).toHaveValue("corr-e2e-1");
  await page.getByText("provider.complete", { exact: false }).click();
  await expect(page.getByText("HTTP_ERROR", { exact: false })).toBeVisible();
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
test("model profile connection test uses a Fake Provider result", async ({ page }) => {
  await page.route("**/v1/llm-provider-profiles", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{
          id: "profile-e2e",
          name: "Fake Provider",
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: "https://fake.invalid/v1",
          model: "fake-model",
          timeoutMs: 1000,
          maxTokens: 8,
          temperature: 0,
          isActive: true,
          hasApiKey: true,
        }],
      }),
    });
  });
  await page.route("**/v1/llm-provider-profiles/profile-e2e/test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          success: true,
          ok: true,
          profileId: "profile-e2e",
          model: "fake-model",
          latencyMs: 42,
          preview: "OK",
          correlationId: "profile-test-e2e",
        },
      }),
    });
  });

  await page.goto("/creator/integrations");
  await page.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByText("连接成功")).toBeVisible();
  await expect(page.getByText("42 ms")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看日志" })).toBeVisible();
});