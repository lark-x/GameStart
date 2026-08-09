import assert from "node:assert/strict";
import test from "node:test";

import { ProviderError, type ChatCompletionRequest, type ChatProvider } from "../../../packages/ai/src/index.ts";
import { CharacterRole, StoryMode, createCharacter, createStoryWorld } from "../../../packages/domain/src/index.ts";
import type { InteractionLogRepository } from "../../../packages/database/src/interaction-log.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({ id: "auto-world", name: "Auto", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
const user = createCharacter({ id: "auto-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: "UTC" });
const otherUser = createCharacter({ id: "auto-other", displayName: "Other", role: CharacterRole.USER, storyWorldId: world.id, timezone: "UTC" });
const ai = createCharacter({ id: "auto-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: "UTC" });

class RecordingProvider implements ChatProvider {
  public readonly calls: ChatCompletionRequest[] = [];
  public fail = false;
  public async complete(request: ChatCompletionRequest) {
    this.calls.push(request);
    if (this.fail) throw new ProviderError("HTTP_ERROR", "sentinel-provider-error", { retryable: true, status: 503 });
    return { id: `reply-${this.calls.length}`, model: "fake-model", content: `reply ${this.calls.length}` };
  }
  public async *stream() { yield { content: "unused" }; }
}

async function createConversation(app: ApiApplication, id: string, type = "PRIVATE"): Promise<void> {
  const members = type === "PRIVATE" ? [user.id, ai.id] : [user.id, otherUser.id, ai.id];
  const response = await app.handle(new Request("http://localhost/v1/conversations", { method: "POST", headers: { "content-type": "application/json", "x-actor-character-id": user.id }, body: JSON.stringify({ id, storyWorldId: world.id, type, createdAt: new Date().toISOString(), memberCharacterIds: members }) }));
  assert.equal(response.status, 200, await response.text());
}

function application(provider: ChatProvider, interactionLogs?: InteractionLogRepository): ApiApplication {
  return new ApiApplication(
    createApiStore({ worlds: [world], characters: [user, otherUser, ai] }),
    provider,
    {},
    {},
    { loggingCleanupEnabled: false, ...(interactionLogs === undefined ? {} : { interactionLogs }) },
  );
}

async function postMessage(app: ApiApplication, conversationId: string, input: Record<string, unknown>, correlationId = "corr-auto") {
  const response = await app.handle(new Request(`http://localhost/v1/conversations/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": correlationId, "x-request-id": "request-auto" }, body: JSON.stringify(input) }));
  return { response, body: await response.json() as any };
}

function textMessage(id: string, authorCharacterId = user.id) {
  return { id, authorCharacterId, kind: "TEXT", text: id, createdAt: new Date().toISOString(), idempotencyKey: `key-${id}` };
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (await predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("condition was not reached");
}

async function messages(app: ApiApplication, conversationId: string) {
  const response = await app.handle(new Request(`http://localhost/v1/conversations/${conversationId}/messages?characterId=${user.id}`));
  return (await response.json() as any).data as any[];
}

async function logs(app: ApiApplication, correlationId: string) {
  const response = await app.handle(new Request(`http://localhost/v1/interaction-logs?limit=200&correlationId=${correlationId}`));
  return (await response.json() as any).data.items as any[];
}

test("POST USER PRIVATE TEXT returns QUEUED, passes trace, logs lifecycle, and persists deterministic reply", async () => {
  const provider = new RecordingProvider(); const app = application(provider); await createConversation(app, "auto-private");
  const sent = await postMessage(app, "auto-private", textMessage("source-one"), "corr-one");
  assert.equal(sent.response.status, 200); assert.deepEqual(sent.body.data.autoReply, { status: "QUEUED", correlationId: "corr-one", sourceMessageId: "source-one" });
  await waitUntil(() => provider.calls.length === 1 && app.store.messages!.listByConversation("auto-private").then((items) => items.length === 2));
  assert.deepEqual(provider.calls[0]!.trace, { correlationId: "corr-one", requestId: "request-auto", actorId: user.id, conversationId: "auto-private" });
  const stored = await messages(app, "auto-private"); assert.equal(stored[1].id, "assistant:auto-private:source-one"); assert.equal(stored[1].text, "reply 1");
  const lifecycle = (await logs(app, "corr-one")).filter((item) => item.action.startsWith("auto_reply.")).map((item) => item.action).sort();
  assert.deepEqual(lifecycle, ["auto_reply.completed", "auto_reply.queued", "auto_reply.started"]);
  for (const item of (await logs(app, "corr-one")).filter((entry) => entry.action.startsWith("auto_reply."))) { assert.equal(item.correlationId, "corr-one"); assert.equal(item.requestId, "request-auto"); assert.equal(item.conversationId, "auto-private"); assert.equal(item.entityId, "source-one"); } app.stop();
});

test("AI, GROUP, IMAGE, and STICKER messages are NOT_APPLICABLE and never call provider", async () => {
  const provider = new RecordingProvider(); const app = application(provider); await createConversation(app, "auto-boundary"); await createConversation(app, "auto-group", "GROUP");
  const cases = [
    ["auto-boundary", textMessage("ai-text", ai.id)],
    ["auto-group", textMessage("group-text")],
    ["auto-boundary", { id: "image", authorCharacterId: user.id, kind: "IMAGE", mediaRef: "image-ref", createdAt: new Date().toISOString(), idempotencyKey: "key-image" }],
    ["auto-boundary", { id: "sticker", authorCharacterId: user.id, kind: "STICKER", stickerId: "sticker-ref", createdAt: new Date().toISOString(), idempotencyKey: "key-sticker" }],
  ] as const;
  for (const [conversationId, payload] of cases) { const sent = await postMessage(app, conversationId, payload); assert.equal(sent.body.data.autoReply.status, "NOT_APPLICABLE"); }
  await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(provider.calls.length, 0); app.stop();
});

test("duplicate source shares one flight and invokes provider once", async () => {
  const provider = new RecordingProvider(); const app = application(provider); await createConversation(app, "auto-duplicate"); const payload = textMessage("same-source");
  const [first, second] = await Promise.all([postMessage(app, "auto-duplicate", payload), postMessage(app, "auto-duplicate", { ...payload, id: "different-id" })]);
  assert.equal(first.body.data.autoReply.status, "QUEUED"); assert.equal(second.body.data.autoReply.status, "QUEUED");
  await waitUntil(() => provider.calls.length === 1); assert.equal(provider.calls.length, 1); app.stop();
});

test("consecutive USER sources do not share a flight; older source records conflict and latest completes", async () => {
  const provider = new RecordingProvider(); const app = application(provider); await createConversation(app, "auto-consecutive");
  const first = await postMessage(app, "auto-consecutive", textMessage("source-old"), "corr-old"); const second = await postMessage(app, "auto-consecutive", textMessage("source-new"), "corr-new");
  assert.equal(first.body.data.autoReply.sourceMessageId, "source-old"); assert.equal(second.body.data.autoReply.sourceMessageId, "source-new");
  await waitUntil(async () => (await logs(app, "corr-old")).some((item) => item.action === "auto_reply.failed") && provider.calls.length === 1);
  assert.equal(provider.calls.length, 1); assert.equal(provider.calls[0]!.trace?.correlationId, "corr-new");
  assert.ok((await messages(app, "auto-consecutive")).some((item) => item.id === "assistant:auto-consecutive:source-new")); app.stop();
});

test("provider failure preserves USER message and retry reports FAILED before a successful retry", async () => {
  const provider = new RecordingProvider(); provider.fail = true; const app = application(provider); await createConversation(app, "auto-retry");
  const sent = await postMessage(app, "auto-retry", textMessage("retry-source"), "corr-fail"); assert.equal(sent.body.data.autoReply.status, "QUEUED");
  await waitUntil(async () => (await logs(app, "corr-fail")).some((item) => item.action === "auto_reply.failed"));
  const failedLog = (await logs(app, "corr-fail")).find((item) => item.action === "auto_reply.failed");
  assert.match(failedLog.message, /sentinel-provider-error/); assert.equal(failedLog.correlationId, "corr-fail");
  assert.equal((await messages(app, "auto-retry")).length, 1);
  const failedRetry = await app.handle(new Request("http://localhost/v1/conversations/auto-retry/auto-reply/retry", { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": "corr-retry-failed", "x-actor-character-id": user.id }, body: JSON.stringify({ readerCharacterId: user.id, sourceMessageId: "retry-source" }) }));
  assert.equal((await failedRetry.json() as any).data.status, "FAILED");
  provider.fail = false;
  const retry = await app.handle(new Request("http://localhost/v1/conversations/auto-retry/auto-reply/retry", { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": "corr-retry", "x-actor-character-id": user.id }, body: JSON.stringify({ readerCharacterId: user.id, sourceMessageId: "retry-source" }) }));
  assert.equal(retry.status, 200); const result = (await retry.json() as any).data; assert.equal(result.status, "COMPLETED"); assert.equal(result.messageId, "assistant:auto-retry:retry-source"); assert.equal(provider.calls.length, 3); app.stop();
});
test("retry route enforces trusted actor", async () => {
  const provider = new RecordingProvider(); const app = new ApiApplication(createApiStore({ worlds: [world], characters: [user, otherUser, ai] }), provider, {}, { requireTrustedActor: true }, { loggingCleanupEnabled: false }); await createConversation(app, "auto-trusted");
  const missingActor = await app.handle(new Request("http://localhost/v1/conversations/auto-trusted/auto-reply/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ readerCharacterId: user.id }) })); assert.equal(missingActor.status, 401); app.stop();
});

test("retry returns ALREADY_EXISTS after deterministic reply without another provider call", async () => {
  const provider = new RecordingProvider(); const app = application(provider); await createConversation(app, "auto-existing");
  await postMessage(app, "auto-existing", textMessage("existing-source"), "corr-existing");
  await waitUntil(() => provider.calls.length === 1);
  const retry = await app.handle(new Request("http://localhost/v1/conversations/auto-existing/auto-reply/retry", { method: "POST", headers: { "content-type": "application/json", "x-correlation-id": "corr-existing-retry" }, body: JSON.stringify({ readerCharacterId: user.id, sourceMessageId: "existing-source" }) }));
  const result = (await retry.json() as any).data; assert.equal(result.status, "ALREADY_EXISTS"); assert.equal(result.sourceMessageId, "existing-source"); assert.equal(provider.calls.length, 1); app.stop();
});
test("interaction log repository failure does not change message or automatic reply outcome", async () => {
  const throwing: InteractionLogRepository = { append: async () => { throw new Error("log unavailable"); }, query: async () => ({ items: [] }), deleteOlderThan: async () => 0 };
  const provider = new RecordingProvider(); const app = application(provider, throwing); await createConversation(app, "auto-log-failure");
  const sent = await postMessage(app, "auto-log-failure", textMessage("log-source")); assert.equal(sent.response.status, 200); assert.equal(sent.body.data.autoReply.status, "QUEUED");
  await waitUntil(() => provider.calls.length === 1); assert.ok((await messages(app, "auto-log-failure")).some((item) => item.id === "assistant:auto-log-failure:log-source")); app.stop();
});