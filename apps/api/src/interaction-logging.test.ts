import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryInteractionLogRepository } from "../../../packages/database/src/interaction-log.ts";
import { createChatObservationLogHook, InteractionLogging } from "./interaction-logging.ts";

const entry = (action: string, createdAt = "2026-08-09T00:00:00.000Z") => ({ level: "INFO" as const, source: "API" as const, category: "HTTP" as const, action, outcome: "SUCCESS", createdAt });

test("interaction logging publishes appended records and unsubscribes", async () => {
  const service = new InteractionLogging({ repository: new InMemoryInteractionLogRepository(), cleanupEnabled: false });
  const received: string[] = []; const stop = service.subscribe((log) => received.push(log.action));
  await service.append(entry("one")); assert.deepEqual(received, ["one"]); stop(); await service.append(entry("two")); assert.deepEqual(received, ["one"]); service.stop();
});

test("interaction logging cleanup removes records older than seven days", async () => {
  const repo = new InMemoryInteractionLogRepository();
  const service = new InteractionLogging({ repository: repo, cleanupEnabled: false, clock: () => new Date("2026-08-09T00:00:00.000Z") });
  await service.append(entry("old", "2026-08-01T00:00:00.000Z")); await service.append(entry("new", "2026-08-08T00:00:00.000Z"));
  assert.equal(await service.cleanup(), 1); assert.equal((await service.query()).items.length, 1); service.stop();
});

test("logging failure is best effort and does not reject", async () => {
  const service = new InteractionLogging({ repository: { append: async () => { throw new Error("disk"); }, query: async () => ({ items: [] }), deleteOlderThan: async () => 0 }, cleanupEnabled: false });
  assert.equal(await service.append(entry("ignored")), undefined); service.stop();
});

test("cleanup timer can be stopped without keeping tests alive", () => {
  const service = new InteractionLogging({ repository: new InMemoryInteractionLogRepository(), cleanupIntervalMs: 10 }); service.stop();
});
test("provider observations are correlated, useful, and redacted", async () => {
  const repo = new InMemoryInteractionLogRepository();
  const service = new InteractionLogging({ repository: repo, cleanupEnabled: false });
  const hook = createChatObservationLogHook(service);
  await hook({
    name: "error",
    trace: { correlationId: "corr-1", requestId: "req-1", actorId: "actor-1", conversationId: "conv-1" },
    profileId: "profile-1",
    profileName: "Mimo",
    protocol: "OPENAI_COMPATIBLE",
    model: "mimo-v2.5",
    requestMessages: [{ role: "user", content: "Bearer request-secret" }],
    error: { code: "AUTHENTICATION", message: "Bearer secret-value", retryable: false },
  });
  const log = (await repo.query()).items[0]!;
  assert.equal(log.action, "provider.error");
  assert.equal(log.outcome, "FAILURE");
  assert.equal(log.correlationId, "corr-1");
  assert.equal(log.conversationId, "conv-1");
  assert.equal(log.entityId, "profile-1");
  assert.equal(log.message, "Bearer [REDACTED]");
  assert.equal((log.details?.error as { message?: string }).message, "Bearer [REDACTED]");
  assert.deepEqual(log.details?.requestMessages, [{ role: "user", content: "Bearer [REDACTED]" }]);
  service.stop();
});

test("provider hook stores one useful completed dialogue and drops lifecycle noise", async () => {
  const repo = new InMemoryInteractionLogRepository();
  const service = new InteractionLogging({ repository: repo, cleanupEnabled: false });
  const hook = createChatObservationLogHook(service);
  const requestMessages = [
    { role: "system" as const, content: "You are Lin." },
    { role: "user" as const, content: "今天怎么样？" },
  ];
  await hook({ name: "resolution", outcome: "resolved", model: "m" });
  await hook({ name: "request_started", requestMessages, model: "m" });
  await hook({ name: "first_token", requestMessages, model: "m", preview: "还" });
  await hook({ name: "completed", requestMessages, model: "m", preview: "还不错，刚散完步。", outcome: "success" });
  const logs = (await repo.query()).items;
  assert.equal(logs.length, 1);
  assert.equal(logs[0]?.action, "provider.completed");
  assert.equal(logs[0]?.message, "还不错，刚散完步。");
  assert.deepEqual(logs[0]?.details?.requestMessages, requestMessages);
  assert.equal(logs[0]?.details?.response, "还不错，刚散完步。");
  service.stop();
});

test("provider observation logging failures never affect model calls", async () => {
  const service = new InteractionLogging({ repository: { append: async () => { throw new Error("offline"); }, query: async () => ({ items: [] }), deleteOlderThan: async () => 0 }, cleanupEnabled: false });
  await createChatObservationLogHook(service)({ name: "request_started", trace: { correlationId: "corr" } });
  service.stop();
});
