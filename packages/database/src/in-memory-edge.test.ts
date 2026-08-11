import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  MomentInteractionKind,
  MomentVisibility,
  PlanInterruptibility,
  StoryMode,
  TriggerSource,
  createBehaviorAction,
  createCharacter,
  createCharacterPlan,
  createCharacterVisualIdentity,
  createConversation,
  createEventExecution,
  createImageJob,
  createImageWorkflowTemplate,
  createMemoryItem,
  createMessage,
  createMoment,
  createMomentDraft,
  createMomentInteraction,
  createProactiveMessageBudget,
  createRelationshipEdge,
  createScheduledOccurrence,
  createSticker,
  createStickerPack,
  createStoryWorld,
  createWorldEventDefinition,
  transitionMomentDraft,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const createdAt = "2026-08-05T00:00:00.000Z";
const world = createStoryWorld({
  id: "world-in-memory-edge",
  name: "In-memory edge",
  timezone: "UTC",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "in-memory-edge-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "in-memory-edge-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const edge = createRelationshipEdge({
  id: "in-memory-edge-edge",
  source: user,
  target: ai,
  storyWorld: world,
  relationshipType: "friend",
  initialState: { affinity: 10, trust: 20, conflict: 0, dependency: 0 },
  isPublic: true,
  isBidirectional: true,
});
const conversation = createConversation({
  id: "in-memory-edge-conversation",
  storyWorld: world,
  type: "PRIVATE",
  createdAt,
  members: [user, ai],
});
const message = createMessage({
  id: "in-memory-edge-message",
  conversation,
  author: user,
  kind: "TEXT",
  text: "Hello",
  createdAt,
  idempotencyKey: "in-memory-edge-message",
});
const memory = createMemoryItem({
  id: "in-memory-edge-memory",
  storyWorld: world,
  kind: MemoryKind.EVENT_FACT,
  visibility: MemoryVisibility.PUBLIC,
  source: MemorySource.SYSTEM_EVENT,
  content: "A shared memory",
  confidence: 0.5,
  createdAt,
});
const definition = createWorldEventDefinition({
  id: "in-memory-edge-definition",
  storyWorld: world,
  eventKey: "edge:event",
  name: "Edge event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T00:00:00.000Z" },
  targetCharacters: [ai],
  createdAt,
});
const occurrence = createScheduledOccurrence({
  id: "in-memory-edge-occurrence",
  definition,
  scheduledFor: "2026-08-06T00:00:00.000Z",
  occurrenceKey: "edge:2026-08-06",
  createdAt,
});
const plan = createCharacterPlan({
  id: "in-memory-edge-plan",
  storyWorld: world,
  character: ai,
  startsAt: "2026-08-05T23:00:00.000Z",
  endsAt: "2026-08-06T01:00:00.000Z",
  activity: "Wait",
  interruptibility: PlanInterruptibility.FLEXIBLE,
  createdAt,
});
const budget = createProactiveMessageBudget({
  id: "in-memory-edge-budget",
  storyWorld: world,
  character: ai,
  windowStartsAt: "2026-08-05T00:00:00.000Z",
  windowEndsAt: "2026-08-07T00:00:00.000Z",
  limit: 3,
  consumed: 1,
  updatedAt: createdAt,
});
const execution = createEventExecution({
  id: "in-memory-edge-execution",
  occurrence,
  definition,
  ruleVersion: "v1",
  inputSnapshot: {},
  startedAt: "2026-08-06T00:00:01.000Z",
});
const action = createBehaviorAction({
  id: "in-memory-edge-action",
  execution,
  actorCharacterId: ai.id,
  kind: ActionKind.CREATE_MOMENT,
  payload: { body: "A moment" },
  createdAt,
});
const draft = createMomentDraft({
  id: "in-memory-edge-draft",
  action,
  visibility: MomentVisibility.PUBLIC,
  createdAt,
});
const readyDraft = transitionMomentDraft(draft, "READY", createdAt);
const imageJob = createImageJob({
  id: "in-memory-edge-image-job",
  action: createBehaviorAction({
    id: "in-memory-edge-image-action",
    execution,
    actorCharacterId: ai.id,
    kind: ActionKind.REQUEST_IMAGE,
    payload: { prompt: "A moment", workflowVersion: "template@v1" },
    createdAt,
  }),
  createdAt,
});
const moment = createMoment({
  id: "in-memory-edge-moment",
  draft: readyDraft,
  publishedAt: "2026-08-06T00:01:00.000Z",
});
const interaction = createMomentInteraction({
  id: "in-memory-edge-interaction",
  moment,
  actor: user,
  kind: MomentInteractionKind.LIKE,
  createdAt,
  idempotencyKey: "in-memory-edge-interaction",
});
const identity = createCharacterVisualIdentity({
  id: "in-memory-edge-identity",
  characterId: ai.id,
  storyWorldId: world.id,
  positivePrompt: "portrait",
  updatedAt: createdAt,
});
const template = createImageWorkflowTemplate({
  id: "template",
  version: "v1",
  workflow: { node: { inputs: { text: "placeholder" } } },
  positivePromptPath: ["node", "inputs", "text"],
});
const pack = createStickerPack({ id: "in-memory-edge-pack", storyWorld: world, name: "Pack", createdAt });
const sticker = createSticker({ id: "in-memory-edge-sticker", pack, label: "wave", mediaRef: "media://wave", createdAt });

function repositories() {
  return createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    relationshipEdges: [edge],
    conversations: [conversation],
    messages: [message],
    memories: [memory],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    characterPlans: [plan],
    proactiveMessageBudgets: [budget],
    eventExecutions: [execution],
    behaviorActions: [action, imageJob.actionId === action.id ? action : { ...action, id: "in-memory-edge-image-action", kind: ActionKind.REQUEST_IMAGE, payload: { prompt: "A moment", workflowVersion: "template@v1" } }],
    momentDrafts: [draft],
    imageJobs: [imageJob],
    characterVisualIdentities: [identity],
    imageWorkflowTemplates: [template],
    stickerPacks: [pack],
    stickers: [sticker],
    moments: [moment],
    momentInteractions: [interaction],
  });
}

test("rejects invalid seed references across every aggregate", () => {
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], relationshipEdges: [{ ...edge, targetCharacterId: edge.sourceCharacterId }] }), /invalid character references/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [{ ...conversation, conversation: { ...conversation.conversation, storyWorldId: "missing-world" } }] }), /unknown story world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [{ ...conversation, members: [{ ...conversation.members[0]!, conversationId: "wrong-conversation" }, conversation.members[1]!] }] }), /invalid members/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [{ ...conversation, members: [{ ...conversation.members[0]!, characterId: "missing-character" }, conversation.members[1]!] }] }), /invalid member/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], memories: [{ ...memory, storyWorldId: "missing-world" }] }), /unknown story world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], memories: [{ ...memory, audienceCharacterIds: ["missing-character"] }] }), /invalid character/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [{ ...definition, storyWorldId: "missing-world" }] }), /unknown story world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [{ ...definition, targetCharacterIds: ["missing-character"] }] }), /invalid target character/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], characterPlans: [{ ...plan, characterId: "missing-character" }] }), /invalid character or world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], proactiveMessageBudgets: [{ ...budget, characterId: "missing-character" }] }), /invalid character or world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [{ ...execution, definitionId: "missing-definition" }] }), /invalid event state/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [{ ...execution, targetCharacterIds: ["missing-character"] }] }), /invalid target character/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution], behaviorActions: [{ ...action, executionId: "missing-execution" }] }), /invalid execution or actor/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution], behaviorActions: [action], momentDrafts: [{ ...draft, actionId: "missing-action" }] }), /invalid action or author/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution], behaviorActions: [action], imageJobs: [{ ...imageJob, actionId: "missing-action" }] }), /invalid action or owner/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution], behaviorActions: [action, { ...action, id: imageJob.actionId, kind: ActionKind.REQUEST_IMAGE, payload: { prompt: "A moment", workflowVersion: "template@v1" } }], momentDrafts: [draft], imageJobs: [{ ...imageJob, momentDraftId: "missing-draft" }] }), /invalid moment draft/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], moments: [{ ...moment, authorCharacterId: "missing-character" }] }), /invalid author or world/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], moments: [moment], momentInteractions: [{ ...interaction, actorCharacterId: "missing-character" }] }), /invalid moment or actor/);
});

test("covers in-memory idempotency, ordering, and parameter validation boundaries", async () => {
  const repo = repositories();
  assert.ok(repo.conversations && repo.messages && repo.memories && repo.worldEventDefinitions && repo.scheduledOccurrences);
  assert.ok(repo.characterVisualIdentities && repo.imageWorkflowTemplates && repo.moments && repo.momentInteractions);
  await assert.rejects(repo.conversations.save(conversation), /Duplicate conversation id/);
  await assert.rejects(repo.messages.save({ ...message, id: "different-message-id", text: "different content" }), /idempotency key conflict/);
  await assert.rejects(repo.messages.save({ ...message, idempotencyKey: "different-message-key" }), /Duplicate message id/);
  await assert.rejects(repo.memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: "memory", limit: 0 }), /memory search limit/);
  await assert.rejects(repo.memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: " " }), /queryText/);
  const tieA = { ...memory, id: "tie-a", content: "same token", createdAt };
  const tieB = { ...memory, id: "tie-b", content: "same token", createdAt };
  const tied = createInMemoryRepositories({ worlds: [world], characters: [user, ai], memories: [tieB, tieA] });
  assert.ok(tied.memories);
  assert.deepEqual((await tied.memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: "same" })).map((item) => item.memory.id), ["tie-a", "tie-b"]);
  await assert.rejects(repo.worldEventDefinitions.save({ ...definition, eventKey: "changed:event" }), /cannot change eventKey/);
  await assert.rejects(repo.scheduledOccurrences.listPending(world.id, createdAt, 0), /scheduled occurrence limit/);
  await assert.rejects(repo.scheduledOccurrences.listPending(world.id, "not-a-date", 1), /scheduledBefore/);
  await assert.rejects(repo.scheduledOccurrences.listByWindow(world.id, createdAt, "2026-08-06T00:00:00.000Z", 0), /scheduled occurrence limit/);
  await assert.rejects(repo.scheduledOccurrences.listByWindow(world.id, "not-a-date", "2026-08-06T00:00:00.000Z", 1), /scheduled occurrence window/);
  const secondOccurrence = { ...occurrence, id: "in-memory-edge-occurrence-2", occurrenceKey: "edge:2026-08-06-2", scheduledFor: occurrence.scheduledFor };
  const ordered = createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence, secondOccurrence] });
  assert.ok(ordered.scheduledOccurrences);
  assert.deepEqual((await ordered.scheduledOccurrences.listPending(world.id, "2026-08-07T00:00:00.000Z", 10)).map((item) => item.id), [occurrence.id, secondOccurrence.id]);
  assert.deepEqual((await ordered.scheduledOccurrences.listByWindow(world.id, "2026-08-05T00:00:00.000Z", "2026-08-07T00:00:00.000Z", 10)).map((item) => item.id), [occurrence.id, secondOccurrence.id]);
  await assert.rejects(repo.scheduledOccurrences.save({ ...occurrence, occurrenceKey: "changed:key" }), /id conflict/);
  await assert.rejects(repo.scheduledOccurrences.update({ ...occurrence, definitionId: "missing-definition" }), /invalid event definition/);
  await assert.rejects(repo.scheduledOccurrences.update({ ...occurrence, occurrenceKey: "changed:key" }), /identity cannot change/);
  assert.equal((await repo.characterVisualIdentities.getById(identity.id))?.id, identity.id);
  await repo.imageWorkflowTemplates.save(template);
  await assert.rejects(repo.moments.listFeed(world.id, user.id, 0), /moment feed limit/);
  await assert.rejects(repo.momentInteractions.save({ ...interaction, id: interaction.id, kind: MomentInteractionKind.COMMENT, text: "comment", idempotencyKey: "different-key" }), /Duplicate momentInteraction id/);
});

test("rejects duplicate seed identities and occurrence attempts", () => {
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation, conversation] }), /Duplicate conversation id/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution, { ...execution, id: "second-execution" }] }), /Duplicate event execution attempt/);
  assert.throws(() => createInMemoryRepositories({ worlds: [world], characters: [user, ai], moments: [moment], momentInteractions: [interaction, { ...interaction, id: "second-interaction" }] }), /Duplicate moment interaction idempotency key/);
});
