import assert from "node:assert/strict";
import test from "node:test";

import type { ChatProvider } from "../../../packages/ai/src/index.ts";
import {
  CharacterRole,
  EventExecutionStatus,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createCharacter,
  createConversation,
  createEventExecution,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { ProactiveMessageCoordinator } from "./proactive.ts";

test("proactive coordinator persists idempotent replies and exposes image intent", async () => {
  const world = createStoryWorld({ id: "proactive-world", name: "Proactive", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "proactive-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "proactive-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "proactive-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const definition = createWorldEventDefinition({ id: "proactive-definition", storyWorld: world, eventKey: "proactive:event", name: "Event", triggerSource: TriggerSource.MANUAL, recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-05T01:00:00.000Z" }, targetCharacters: [ai], createdAt: "2026-08-05T00:00:00.000Z" });
  const occurrence = createScheduledOccurrence({ id: "proactive-occurrence", definition, scheduledFor: "2026-08-05T01:00:00.000Z", occurrenceKey: "proactive:once", createdAt: "2026-08-05T00:00:00.000Z" });
  const execution = createEventExecution({ id: "proactive-execution", occurrence, definition, ruleVersion: "v1", inputSnapshot: { trigger: "manual" }, startedAt: "2026-08-05T01:00:00.000Z" });
  assert.equal(execution.status, EventExecutionStatus.RUNNING);
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution] });
  const provider: ChatProvider = { async complete() { return { id: "proactive-completion", model: "test", content: JSON.stringify({ text: "现在出发吧。", imagePrompt: "rainy street", workflowVersion: "moment@v1" }) }; }, async *stream() {} };
  const coordinator = new ProactiveMessageCoordinator(repositories, provider);
  const result = await coordinator.generate({ executionId: execution.id, conversationId: conversation.conversation.id, actorCharacterId: ai.id, createdAt: "2026-08-05T01:00:01.000Z" });
  assert.equal(result.inserted, true);
  assert.equal(result.imagePrompt, "rainy street");
  assert.equal((await coordinator.generate({ executionId: execution.id, conversationId: conversation.conversation.id, actorCharacterId: ai.id, createdAt: "2026-08-05T02:00:00.000Z" })).inserted, false);
});
