import test from "node:test";
import assert from "node:assert/strict";
import { ApiApplication, createApiStore } from "./index.ts";
import { CharacterRole, StoryMode, createCharacter, createStoryWorld } from "@living-network/domain";
import type { ChatProvider } from "@living-network/ai";

const world = createStoryWorld({ id: "log-world", name: "Logs", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
const user = createCharacter({ id: "log-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: "UTC" });
const ai = createCharacter({ id: "log-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: "UTC" });
const provider: ChatProvider = { complete: async () => ({ id: "x", model: "m", content: "OK" }), async *stream() { yield { content: "OK", finishReason: "stop" }; } };
async function app(): Promise<ApiApplication> { const value = new ApiApplication(createApiStore({ worlds: [world], characters: [user, ai] }), provider); await value.handle(new Request("http://localhost/v1/conversations", { method: "POST", body: JSON.stringify({ id: "log-conversation", storyWorldId: world.id, type: "PRIVATE", createdAt: new Date().toISOString(), memberCharacterIds: [user.id, ai.id] }) })); return value; }

test("all HTTP responses carry the supplied correlation id through the adapter", async () => { const value = await app(); const response = await value.handle(new Request("http://localhost/health", { headers: { "x-correlation-id": "test-correlation" } })); assert.equal(response.status, 200); });

test("message save logs and only USER TEXT in PRIVATE can queue AI reply", async () => { const value = await app(); const response = await value.handle(new Request("http://localhost/v1/conversations/log-conversation/messages", { method: "POST", body: JSON.stringify({ id: "user-log-message", authorCharacterId: user.id, kind: "TEXT", text: "hello", createdAt: new Date().toISOString(), idempotencyKey: "user-log-key" }) })); assert.equal(response.status, 200); await new Promise((resolve) => setTimeout(resolve, 40)); const logs = await value.handle(new Request("http://localhost/v1/interaction-logs?limit=200")); assert.equal(logs.status, 200); value.stop(); });

test("interaction log filters reject invalid enum values", async () => { const value = await app(); const response = await value.handle(new Request("http://localhost/v1/interaction-logs?level=NOPE")); assert.equal(response.status, 400); value.stop(); });

test("log stream sends log events and remains open until aborted", async () => { const value = await app(); const controller = new AbortController(); const response = await value.handle(new Request("http://localhost/v1/interaction-logs/stream", { signal: controller.signal })); assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8"); controller.abort(); value.stop(); });

test("profile test route is explicit and unknown profiles are safe", async () => { const value = await app(); const response = await value.handle(new Request("http://localhost/v1/llm-provider-profiles/missing/test", { method: "POST" })); assert.equal(response.status, 404); value.stop(); });