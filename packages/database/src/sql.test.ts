import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventExecutionStatus,
  EventRecurrenceKind,
  ImageJobStatus,
  LlmProviderProtocol,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  MomentInteractionKind,
  MomentDraftStatus,
  MomentVisibility,
  PlanInterruptibility,
  StoryMode,
  ScheduledOccurrenceStatus,
  TriggerSource,
  annualOccurrenceKey,
  createActorSession,
  createCharacter,
  createCharacterVisualIdentity,
  createCharacterPlan,
  createBehaviorAction,
  createEventExecution,
  createImageJob,
  createImageWorkflowTemplate,
  createLlmProviderProfile,
  createComfyUiSettings,
  createMemoryItem,
  createMoment,
  createMomentInteraction,
  createMomentDraft,
  createProactiveMessageBudget,
  createScheduledOccurrence,
  createRelationshipEdge,
  createStoryWorld,
  createWorldEventDefinition,
  createWorldLoreEntry,
  transitionMomentDraft,
  type Character,
  type CharacterVisualIdentity,
  type CharacterPlan,
  type BehaviorAction,
  type EventExecution,
  type ImageJob,
  type RelationshipEdge,
  type StoryWorld,
  type MemoryItem,
  type Moment,
  type MomentInteraction,
  type MomentDraft,
  type ProactiveMessageBudget,
  type ScheduledOccurrence,
  type WorldEventDefinition,
  type ImageWorkflowTemplate,
  type LlmProviderProfile,
  type ComfyUiSettings,
} from "@living-network/domain";
import {
  createSqlRepositories,
  type SqlClient,
  type SqlQueryResult,
  type SqlRow,
} from "./index.ts";

class RecordingSqlClient implements SqlClient {
  public readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  private readonly responses: SqlRow[][];

  public constructor(responses: SqlRow[][] = []) {
    this.responses = responses;
  }

  public async query<Row extends SqlRow = SqlRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, values: [...values] });
    return { rows: (this.responses.shift() ?? []) as readonly Row[] };
  }
}

const world = createStoryWorld({
  id: "world-sql",
  name: "SQL Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "user-sql",
  displayName: "SQL User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
  birthDate: "2000-01-01",
});
const ai = createCharacter({
  id: "ai-sql",
  displayName: "SQL AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const edge = createRelationshipEdge({
  id: "edge-sql",
  source: user,
  target: ai,
  storyWorld: world,
  relationshipType: "friend",
  initialState: { affinity: 10, trust: 20, conflict: 0, dependency: -5 },
  isPublic: true,
  isBidirectional: false,
});
const session = createActorSession({
  id: "session-sql",
  storyWorld: world,
  userCharacter: user,
  startedAt: "2026-08-05T11:00:00.000Z",
});

function worldRow(value: StoryWorld): SqlRow {
  return {
    id: value.id,
    name: value.name,
    timezone: value.timezone,
    story_mode: value.storyMode,
    relationship_dynamics_enabled: value.relationshipDynamicsEnabled,
  };
}

function characterRow(value: Character, prefix = ""): SqlRow {
  return {
    [`${prefix}id`]: value.id,
    [`${prefix}display_name`]: value.displayName,
    [`${prefix}role`]: value.role,
    [`${prefix}story_world_id`]: value.storyWorldId,
    [`${prefix}timezone`]: value.timezone,
    [`${prefix}birth_date`]: value.birthDate ?? null,
    [`${prefix}persona_prompt_ref`]: value.personaPromptRef ?? null,
    [`${prefix}visual_prompt_ref`]: value.visualPromptRef ?? null,
  };
}

function edgeRow(value: RelationshipEdge): SqlRow {
  return {
    id: value.id,
    relationship_type: value.relationshipType,
    affinity: value.initialState.affinity,
    trust: value.initialState.trust,
    conflict: value.initialState.conflict,
    dependency: value.initialState.dependency,
    is_public: value.isPublic,
    is_bidirectional: value.isBidirectional,
    world_id: world.id,
    world_name: world.name,
    world_timezone: world.timezone,
    world_story_mode: world.storyMode,
    world_relationship_dynamics_enabled: world.relationshipDynamicsEnabled,
    ...characterRow(user, "source_"),
    ...characterRow(ai, "target_"),
  };
}

function sessionRow(): SqlRow {
  return {
    id: session.id,
    started_at: session.startedAt,
    ended_at: null,
    world_id: world.id,
    world_name: world.name,
    world_timezone: world.timezone,
    world_story_mode: world.storyMode,
    world_relationship_dynamics_enabled: world.relationshipDynamicsEnabled,
    ...characterRow(user, "user_"),
  };
}

function conversationRows(): SqlRow[] {
  const base = {
    conversation_id: "conversation-sql",
    conversation_story_world_id: world.id,
    conversation_type: "PRIVATE",
    conversation_title: null,
    conversation_created_at: "2026-08-05T12:30:00.000Z",
    world_id: world.id,
    world_name: world.name,
    world_timezone: world.timezone,
    world_story_mode: world.storyMode,
    world_relationship_dynamics_enabled: world.relationshipDynamicsEnabled,
  };
  return [
    {
      ...base,
      member_character_id: user.id,
      member_joined_at: "2026-08-05T12:30:00.000Z",
      member_left_at: null,
      ...characterRow(user, "member_"),
    },
    {
      ...base,
      member_character_id: ai.id,
      member_joined_at: "2026-08-05T12:30:00.000Z",
      member_left_at: null,
      ...characterRow(ai, "member_"),
    },
  ];
}

function messageRow(value = "message-sql"): SqlRow {
  return {
    id: value,
    conversation_id: "conversation-sql",
    author_character_id: user.id,
    kind: "TEXT",
    text: "SQL message",
    media_ref: null,
    sticker_id: null,
    created_at: "2026-08-05T12:31:00.000Z",
    idempotency_key: "message-sql-key",
  };
}

const memory = createMemoryItem({
  id: "memory-sql",
  storyWorld: world,
  kind: MemoryKind.EVENT_FACT,
  visibility: MemoryVisibility.PUBLIC,
  source: MemorySource.SYSTEM_EVENT,
  content: "The SQL lantern festival is tomorrow.",
  confidence: 0.9,
  createdAt: "2026-08-05T12:40:00.000Z",
  sourceRef: "event:sql-lantern",
});

function memoryRow(value: MemoryItem = memory): SqlRow {
  return {
    id: value.id,
    story_world_id: value.storyWorldId,
    kind: value.kind,
    visibility: value.visibility,
    source: value.source,
    content: value.content,
    confidence: value.confidence,
    created_at: value.createdAt,
    occurred_at: null,
    subject_character_id: null,
    audience_character_ids: [...value.audienceCharacterIds],
    source_ref: value.sourceRef ?? null,
    score: 1.15,
  };
}

const eventDefinition = createWorldEventDefinition({
  id: "event-sql-festival",
  storyWorld: world,
  eventKey: "world:sql-festival",
  name: "SQL festival",
  triggerSource: TriggerSource.WORLD_HOLIDAY,
  recurrence: {
    kind: EventRecurrenceKind.ANNUAL,
    month: 8,
    day: 15,
    localTime: "18:00",
  },
  targetCharacters: [ai],
  priority: 10,
  cooldownSeconds: 3600,
  createdAt: "2026-08-05T12:45:00.000Z",
});

const eventOccurrence = createScheduledOccurrence({
  id: "occurrence-sql-festival",
  definition: eventDefinition,
  scheduledFor: "2026-08-15T10:00:00.000Z",
  occurrenceKey: annualOccurrenceKey(eventDefinition, 2026),
  createdAt: "2026-08-05T12:45:00.000Z",
});

function eventDefinitionRow(value: WorldEventDefinition = eventDefinition): SqlRow {
  return {
    id: value.id,
    story_world_id: value.storyWorldId,
    event_key: value.eventKey,
    name: value.name,
    trigger_source: value.triggerSource,
    timezone: value.timezone,
    recurrence_kind: value.recurrence.kind,
    run_at: null,
    recurrence_month: value.recurrence.kind === EventRecurrenceKind.ANNUAL
      ? value.recurrence.month
      : null,
    recurrence_day: value.recurrence.kind === EventRecurrenceKind.ANNUAL
      ? value.recurrence.day
      : null,
    recurrence_local_time: value.recurrence.kind === EventRecurrenceKind.ANNUAL
      ? `${value.recurrence.localTime}:00`
      : null,
    target_character_ids: [...value.targetCharacterIds],
    recipient_character_ids: [...value.recipientCharacterIds],
    output_send_message: value.outputs.sendMessage,
    output_publish_moment: value.outputs.publishMoment,
    output_generate_image: value.outputs.generateImage,
    priority: value.priority,
    cooldown_seconds: value.cooldownSeconds ?? null,
    enabled: value.enabled,
    created_at: value.createdAt,
  };
}

function occurrenceRow(value: ScheduledOccurrence = eventOccurrence): SqlRow {
  return {
    id: value.id,
    definition_id: value.definitionId,
    story_world_id: value.storyWorldId,
    event_key: value.eventKey,
    scheduled_for: value.scheduledFor,
    timezone: value.timezone,
    occurrence_key: value.occurrenceKey,
    status: value.status,
    created_at: value.createdAt,
  };
}

const plan = createCharacterPlan({
  id: "plan-sql",
  storyWorld: world,
  character: ai,
  startsAt: "2026-08-15T09:00:00.000Z",
  endsAt: "2026-08-15T11:00:00.000Z",
  location: "SQL Observatory",
  activity: "Prepare SQL festival",
  interruptibility: PlanInterruptibility.LIMITED,
  createdAt: "2026-08-05T12:50:00.000Z",
});

const budget = createProactiveMessageBudget({
  id: "budget-sql",
  storyWorld: world,
  character: ai,
  windowStartsAt: "2026-08-15T00:00:00.000Z",
  windowEndsAt: "2026-08-16T00:00:00.000Z",
  limit: 5,
  consumed: 2,
  updatedAt: "2026-08-05T12:50:00.000Z",
});

const execution = createEventExecution({
  id: "execution-sql",
  occurrence: eventOccurrence,
  definition: eventDefinition,
  ruleVersion: "rules-v1",
  inputSnapshot: { planId: plan.id, source: "WORLD_HOLIDAY" },
  startedAt: "2026-08-15T10:00:01.000Z",
});

const action = createBehaviorAction({
  id: "action-sql",
  execution,
  actorCharacterId: ai.id,
  kind: ActionKind.CREATE_MOMENT,
  payload: {
    body: "SQL moment draft",
    imagePrompt: "anime festival",
    workflowVersion: "wf-v1",
  },
  createdAt: "2026-08-05T12:55:00.000Z",
});
const momentDraft = createMomentDraft({
  id: "moment-draft-sql",
  action,
  visibility: MomentVisibility.PUBLIC,
  createdAt: "2026-08-05T12:55:00.000Z",
});
const imageJob = createImageJob({
  id: "image-job-sql",
  action,
  momentDraftId: momentDraft.id,
  createdAt: "2026-08-05T12:55:00.000Z",
});
const readyMomentDraft = transitionMomentDraft(momentDraft, MomentDraftStatus.READY, "2026-08-05T12:56:00.000Z");
const moment = createMoment({
  id: "moment-sql",
  draft: readyMomentDraft,
  publishedAt: "2026-08-15T10:05:00.000Z",
  imageMediaRef: "media://fake/moment-sql.png",
});
const momentInteraction = createMomentInteraction({
  id: "moment-interaction-sql",
  moment,
  actor: ai,
  kind: MomentInteractionKind.LIKE,
  createdAt: "2026-08-05T12:57:00.000Z",
  idempotencyKey: "moment-interaction-sql-key",
});

const visualIdentity = createCharacterVisualIdentity({
  id: "visual-identity-sql",
  characterId: ai.id,
  storyWorldId: world.id,
  positivePrompt: "silver-haired alchemist",
  negativePrompt: "blurry",
  styleTags: ["anime illustration"],
  referenceImageRefs: ["media://sql/reference.png"],
  updatedAt: "2026-08-05T13:00:00.000Z",
});

const workflowTemplate = createImageWorkflowTemplate({
  id: "workflow-template-sql",
  version: "v1",
  workflow: { node: { inputs: { text: "placeholder" } } },
  positivePromptPath: ["node", "inputs", "text"],
  negativePromptPath: ["node", "inputs", "negative"],
});

function planRow(value: CharacterPlan = plan): SqlRow {
  return {
    id: value.id,
    story_world_id: value.storyWorldId,
    character_id: value.characterId,
    starts_at: value.startsAt,
    ends_at: value.endsAt,
    timezone: value.timezone,
    location: value.location ?? null,
    activity: value.activity,
    interruptibility: value.interruptibility,
    created_at: value.createdAt,
  };
}

function budgetRow(value: ProactiveMessageBudget = budget): SqlRow {
  return {
    id: value.id,
    story_world_id: value.storyWorldId,
    character_id: value.characterId,
    window_starts_at: value.windowStartsAt,
    window_ends_at: value.windowEndsAt,
    limit_count: value.limit,
    consumed: value.consumed,
    updated_at: value.updatedAt,
  };
}

function executionRow(value: EventExecution = execution): SqlRow {
  return {
    id: value.id,
    occurrence_id: value.occurrenceId,
    definition_id: value.definitionId,
    story_world_id: value.storyWorldId,
    event_key: value.eventKey,
    target_character_ids: [...value.targetCharacterIds],
    attempt: value.attempt,
    rule_version: value.ruleVersion,
    input_snapshot: value.inputSnapshot,
    status: value.status,
    started_at: value.startedAt,
    finished_at: value.finishedAt ?? null,
    output_snapshot: value.outputSnapshot ?? null,
    failure_reason: value.failureReason ?? null,
  };
}

function actionRow(value: BehaviorAction = action): SqlRow {
  return {
    id: value.id,
    execution_id: value.executionId,
    story_world_id: value.storyWorldId,
    actor_character_id: value.actorCharacterId,
    kind: value.kind,
    status: value.status,
    priority: value.priority,
    payload: value.payload,
    created_at: value.createdAt,
  };
}

function momentDraftRow(value: MomentDraft = momentDraft): SqlRow {
  return {
    id: value.id,
    action_id: value.actionId,
    execution_id: value.executionId,
    story_world_id: value.storyWorldId,
    author_character_id: value.authorCharacterId,
    visibility: value.visibility,
    body: value.body,
    status: value.status,
    image_job_id: value.imageJobId ?? null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function imageJobRow(value: ImageJob = imageJob): SqlRow {
  return {
    id: value.id,
    kind: value.kind,
    action_id: value.actionId,
    execution_id: value.executionId,
    story_world_id: value.storyWorldId,
    owner_character_id: value.ownerCharacterId,
    moment_draft_id: value.momentDraftId ?? null,
    workflow_version: value.workflowVersion,
    prompt: value.prompt,
    attempt: value.attempt,
    negative_prompt: value.negativePrompt ?? null,
    seed: value.seed ?? null,
    status: value.status,
    external_job_id: value.externalJobId ?? null,
    media_ref: value.mediaRef ?? null,
    failure_reason: value.failureReason ?? null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

function visualIdentityRow(value: CharacterVisualIdentity = visualIdentity): SqlRow {
  return {
    id: value.id,
    character_id: value.characterId,
    story_world_id: value.storyWorldId,
    positive_prompt: value.positivePrompt,
    negative_prompt: value.negativePrompt ?? null,
    style_tags: [...value.styleTags],
    reference_image_refs: [...value.referenceImageRefs],
    revision: value.revision,
    updated_at: value.updatedAt,
  };
}

function workflowTemplateRow(value: ImageWorkflowTemplate = workflowTemplate): SqlRow {
  return {
    id: value.id,
    version: value.version,
    workflow: value.workflow,
    positive_prompt_path: [...value.positivePromptPath],
    negative_prompt_path: value.negativePromptPath === undefined ? null : [...value.negativePromptPath],
    seed_path: value.seedPath === undefined ? null : [...value.seedPath],
  };
}

function momentRow(value: Moment = moment): SqlRow {
  return {
    id: value.id,
    draft_id: value.draftId,
    story_world_id: value.storyWorldId,
    author_character_id: value.authorCharacterId,
    visibility: value.visibility,
    audience_character_ids: [...value.audienceCharacterIds],
    body: value.body,
    image_media_ref: value.imageMediaRef ?? null,
    published_at: value.publishedAt,
    created_at: value.createdAt,
  };
}

function momentInteractionRow(value: MomentInteraction = momentInteraction): SqlRow {
  return {
    id: value.id,
    moment_id: value.momentId,
    story_world_id: value.storyWorldId,
    actor_character_id: value.actorCharacterId,
    kind: value.kind,
    text: value.text ?? null,
    created_at: value.createdAt,
    idempotency_key: value.idempotencyKey,
  };
}

test("maps world and character rows while keeping lookup values parameterized", async () => {
  const client = new RecordingSqlClient([[worldRow(world)], [characterRow(user)]]);
  const repositories = createSqlRepositories(client);

  assert.deepEqual(await repositories.storyWorlds.list(), [world]);
  assert.deepEqual(await repositories.characters.getById("user-sql"), user);
  assert.match(client.calls[0]?.text ?? "", /ORDER BY id/);
  assert.deepEqual(client.calls[0]?.values, []);
  assert.match(client.calls[1]?.text ?? "", /WHERE id = \$1/);
  assert.deepEqual(client.calls[1]?.values, ["user-sql"]);
});

test("maps joined relationship and actor session rows through domain constructors", async () => {
  const client = new RecordingSqlClient([[edgeRow(edge)], [sessionRow()]]);
  const repositories = createSqlRepositories(client);

  assert.deepEqual(
    await repositories.relationshipEdges.listByStoryWorld(world.id),
    [edge],
  );
  assert.deepEqual(await repositories.actorSessions.getById(session.id), session);
  assert.match(client.calls[0]?.text ?? "", /JOIN characters source_character/);
  assert.match(client.calls[1]?.text ?? "", /JOIN characters user_character/);
  assert.deepEqual(client.calls[0]?.values, [world.id]);
  assert.deepEqual(client.calls[1]?.values, [session.id]);
});

test("writes relationship edges and actor sessions with parameterized upserts", async () => {
  const client = new RecordingSqlClient();
  const repositories = createSqlRepositories(client);

  await repositories.relationshipEdges.save(edge);
  await repositories.actorSessions.save(session);

  assert.match(client.calls[0]?.text ?? "", /INSERT INTO relationship_edges/);
  assert.match(client.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(client.calls[0]?.values, [
    edge.id,
    edge.sourceCharacterId,
    edge.targetCharacterId,
    edge.storyWorldId,
    edge.relationshipType,
    10,
    20,
    0,
    -5,
    true,
    false,
  ]);
  assert.match(client.calls[1]?.text ?? "", /INSERT INTO actor_sessions/);
  assert.deepEqual(client.calls[1]?.values, [
    session.id,
    session.storyWorldId,
    session.userCharacterId,
    session.startedAt,
    null,
  ]);
  assert.ok(!client.calls[0]?.text.includes(edge.id));
  assert.ok(!client.calls[1]?.text.includes(session.id));
});

test("rejects malformed database rows through the domain boundary", async () => {
  const malformed = new RecordingSqlClient([[{ ...sessionRow(), user_role: CharacterRole.AI }]]);
  const repositories = createSqlRepositories(malformed);

  await assert.rejects(
    repositories.actorSessions.getById(session.id),
    { name: "TypeError", message: /role USER/ },
  );
});

test("maps SQL conversation rows and writes member values through placeholders", async () => {
  const client = new RecordingSqlClient([conversationRows()]);
  const repositories = createSqlRepositories(client);
  const aggregate = await repositories.conversations?.getById("conversation-sql");
  assert.deepEqual(aggregate, {
    conversation: {
      id: "conversation-sql",
      storyWorldId: world.id,
      type: "PRIVATE",
      createdAt: "2026-08-05T12:30:00.000Z",
    },
    members: [
      {
        conversationId: "conversation-sql",
        characterId: user.id,
        joinedAt: "2026-08-05T12:30:00.000Z",
      },
      {
        conversationId: "conversation-sql",
        characterId: ai.id,
        joinedAt: "2026-08-05T12:30:00.000Z",
      },
    ],
  });

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.conversations);
  await writeRepositories.conversations.save(aggregate!);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO conversations/);
  assert.match(writeClient.calls[0]?.text ?? "", /conversation_members/);
  assert.deepEqual(writeClient.calls[0]?.values.slice(0, 5), [
    "conversation-sql",
    world.id,
    "PRIVATE",
    null,
    "2026-08-05T12:30:00.000Z",
  ]);
  assert.ok(!writeClient.calls[0]?.text.includes(user.id));
  assert.ok(!writeClient.calls[0]?.text.includes(ai.id));
});

test("maps SQL messages and handles insert/replay idempotency", async () => {
  const firstClient = new RecordingSqlClient([[messageRow()]]);
  const firstRepositories = createSqlRepositories(firstClient);
  assert.ok(firstRepositories.messages);
  const first = await firstRepositories.messages.save({
    id: "message-sql",
    conversationId: "conversation-sql",
    authorCharacterId: user.id,
    kind: "TEXT",
    text: "SQL message",
    createdAt: "2026-08-05T12:31:00.000Z",
    idempotencyKey: "message-sql-key",
  });
  assert.deepEqual(first, {
    message: {
      id: "message-sql",
      conversationId: "conversation-sql",
      authorCharacterId: user.id,
      kind: "TEXT",
      text: "SQL message",
      createdAt: "2026-08-05T12:31:00.000Z",
      idempotencyKey: "message-sql-key",
    },
    inserted: true,
  });
  assert.ok(!firstClient.calls[0]?.text.includes("message-sql"));

  const replayClient = new RecordingSqlClient([[], [messageRow()]]);
  const replayRepositories = createSqlRepositories(replayClient);
  assert.ok(replayRepositories.messages);
  const replay = await replayRepositories.messages.save({
    id: "different-message-id",
    conversationId: "conversation-sql",
    authorCharacterId: user.id,
    kind: "TEXT",
    text: "SQL message",
    createdAt: "2026-08-05T12:31:00.000Z",
    idempotencyKey: "message-sql-key",
  });
  assert.equal(replay.inserted, false);
  assert.equal(replay.message.id, "message-sql");
  assert.match(replayClient.calls[1]?.text ?? "", /idempotency_key = \$2/);
});

test("maps and searches SQL memories with visibility parameters and FTS", async () => {
  const client = new RecordingSqlClient([[memoryRow()], [memoryRow()]]);
  const repositories = createSqlRepositories(client);
  assert.ok(repositories.memories);

  assert.deepEqual(await repositories.memories.listForCharacter(world.id, user.id), [memory]);
  const results = await repositories.memories.search({
    storyWorldId: world.id,
    readerCharacterId: user.id,
    queryText: "lantern festival",
    limit: 7,
  });
  assert.deepEqual(results, [{ memory, score: 1.15 }]);
  assert.match(client.calls[0]?.text ?? "", /visibility = 'PUBLIC'/);
  assert.deepEqual(client.calls[0]?.values, [world.id, user.id]);
  assert.match(client.calls[1]?.text ?? "", /websearch_to_tsquery/);
  assert.match(client.calls[1]?.text ?? "", /LIMIT \$4/);
  assert.deepEqual(client.calls[1]?.values, [world.id, user.id, "lantern festival", 7]);
});

test("writes memory provenance through a parameterized upsert", async () => {
  const client = new RecordingSqlClient();
  const repositories = createSqlRepositories(client);
  assert.ok(repositories.memories);
  await repositories.memories.save(memory);
  assert.match(client.calls[0]?.text ?? "", /INSERT INTO memory_items/);
  assert.match(client.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.ok(!client.calls[0]?.text.includes(memory.content));
  assert.deepEqual(client.calls[0]?.values, [
    memory.id,
    memory.storyWorldId,
    memory.kind,
    memory.visibility,
    memory.source,
    memory.content,
    memory.confidence,
    memory.createdAt,
    null,
    null,
    [],
    memory.sourceRef,
  ]);
});

test("maps annual event definitions and writes recurrence values through placeholders", async () => {
  const readClient = new RecordingSqlClient([[eventDefinitionRow()], [eventDefinitionRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.worldEventDefinitions);
  assert.deepEqual(
    await repositories.worldEventDefinitions.listByStoryWorld(world.id),
    [eventDefinition],
  );
  assert.deepEqual(
    await repositories.worldEventDefinitions.getById(eventDefinition.id),
    eventDefinition,
  );
  assert.deepEqual(readClient.calls[0]?.values, [world.id]);
  assert.deepEqual(readClient.calls[1]?.values, [eventDefinition.id]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.worldEventDefinitions);
  await writeRepositories.worldEventDefinitions.save(eventDefinition);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO world_event_definitions/);
  assert.match(writeClient.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    eventDefinition.id,
    eventDefinition.storyWorldId,
    eventDefinition.eventKey,
    eventDefinition.name,
    eventDefinition.triggerSource,
    eventDefinition.timezone,
    "ANNUAL",
    null,
    8,
    15,
    "18:00",
    [ai.id],
    [ai.id],
    false,
    false,
    false,
    10,
    3600,
    true,
    eventDefinition.createdAt,
  ]);
  assert.ok(!writeClient.calls[0]?.text.includes(eventDefinition.eventKey));
});

test("persists scheduled occurrences idempotently and lists due work", async () => {
  const insertClient = new RecordingSqlClient([[occurrenceRow()]]);
  const insertRepositories = createSqlRepositories(insertClient);
  assert.ok(insertRepositories.scheduledOccurrences);
  const inserted = await insertRepositories.scheduledOccurrences.save(eventOccurrence);
  assert.deepEqual(inserted, { occurrence: eventOccurrence, inserted: true });
  assert.match(insertClient.calls[0]?.text ?? "", /ON CONFLICT \(story_world_id, occurrence_key\) DO NOTHING/);
  assert.deepEqual(insertClient.calls[0]?.values, [
    eventOccurrence.id,
    eventOccurrence.definitionId,
    eventOccurrence.storyWorldId,
    eventOccurrence.eventKey,
    eventOccurrence.scheduledFor,
    eventOccurrence.timezone,
    eventOccurrence.occurrenceKey,
    ScheduledOccurrenceStatus.PENDING,
    eventOccurrence.createdAt,
  ]);

  const replayClient = new RecordingSqlClient([[], [occurrenceRow()]]);
  const replayRepositories = createSqlRepositories(replayClient);
  assert.ok(replayRepositories.scheduledOccurrences);
  const replay = await replayRepositories.scheduledOccurrences.save({
    ...eventOccurrence,
    id: "different-occurrence-id",
  });
  assert.equal(replay.inserted, false);
  assert.equal(replay.occurrence.id, eventOccurrence.id);
  assert.match(replayClient.calls[1]?.text ?? "", /occurrence_key = \$2/);

  const dueClient = new RecordingSqlClient([[occurrenceRow()]]);
  const dueRepositories = createSqlRepositories(dueClient);
  assert.ok(dueRepositories.scheduledOccurrences);
  assert.deepEqual(
    await dueRepositories.scheduledOccurrences.listPending(
      world.id,
      "2026-08-16T00:00:00.000Z",
      20,
    ),
    [eventOccurrence],
  );
  assert.match(dueClient.calls[0]?.text ?? "", /status = 'PENDING'/);
  assert.deepEqual(dueClient.calls[0]?.values, [world.id, "2026-08-16T00:00:00.000Z", 20]);

  const windowClient = new RecordingSqlClient([[occurrenceRow()]]);
  const windowRepositories = createSqlRepositories(windowClient);
  assert.ok(windowRepositories.scheduledOccurrences);
  assert.deepEqual(
    await windowRepositories.scheduledOccurrences.listByWindow(
      world.id,
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
      50,
    ),
    [eventOccurrence],
  );
  assert.match(windowClient.calls[0]?.text ?? "", /scheduled_for >= \$2/);
  assert.match(windowClient.calls[0]?.text ?? "", /scheduled_for < \$3/);
  assert.deepEqual(windowClient.calls[0]?.values, [
    world.id,
    "2026-08-01T00:00:00.000Z",
    "2026-09-01T00:00:00.000Z",
    50,
  ]);
});

test("updates occurrence status without allowing identity changes", async () => {
  const updatedRow = occurrenceRow({
    ...eventOccurrence,
    status: ScheduledOccurrenceStatus.ENQUEUED,
  });
  const client = new RecordingSqlClient([[updatedRow]]);
  const repositories = createSqlRepositories(client);
  assert.ok(repositories.scheduledOccurrences);
  await repositories.scheduledOccurrences.update({
    ...eventOccurrence,
    status: ScheduledOccurrenceStatus.ENQUEUED,
  });
  assert.match(client.calls[0]?.text ?? "", /UPDATE scheduled_occurrences/);
  assert.deepEqual(client.calls[0]?.values, [ScheduledOccurrenceStatus.ENQUEUED, eventOccurrence.id]);
});

test("maps and upserts character plans and active message budgets", async () => {
  const readClient = new RecordingSqlClient([[planRow()], [budgetRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.characterPlans);
  assert.ok(repositories.proactiveMessageBudgets);
  assert.deepEqual(
    await repositories.characterPlans.listActive(ai.id, "2026-08-15T10:00:00.000Z"),
    [plan],
  );
  assert.deepEqual(
    await repositories.proactiveMessageBudgets.getActive(
      world.id,
      ai.id,
      "2026-08-15T10:00:00.000Z",
    ),
    budget,
  );
  assert.deepEqual(readClient.calls[0]?.values, [ai.id, "2026-08-15T10:00:00.000Z"]);
  assert.deepEqual(readClient.calls[1]?.values, [
    world.id,
    ai.id,
    "2026-08-15T10:00:00.000Z",
  ]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.characterPlans);
  assert.ok(writeRepositories.proactiveMessageBudgets);
  await writeRepositories.characterPlans.save(plan);
  await writeRepositories.proactiveMessageBudgets.save(budget);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO character_plans/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    plan.id,
    plan.storyWorldId,
    plan.characterId,
    plan.startsAt,
    plan.endsAt,
    plan.timezone,
    plan.location,
    plan.activity,
    plan.interruptibility,
    plan.createdAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /INSERT INTO proactive_message_budgets/);
  assert.deepEqual(writeClient.calls[1]?.values, [
    budget.id,
    budget.storyWorldId,
    budget.characterId,
    budget.windowStartsAt,
    budget.windowEndsAt,
    budget.limit,
    budget.consumed,
    budget.updatedAt,
  ]);
});

test("maps and upserts event execution snapshots with attempt history", async () => {
  const readClient = new RecordingSqlClient([[executionRow()], [executionRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.eventExecutions);
  assert.deepEqual(await repositories.eventExecutions.getById(execution.id), execution);
  assert.deepEqual(
    await repositories.eventExecutions.getLatestByOccurrence(eventOccurrence.id),
    execution,
  );
  assert.deepEqual(readClient.calls[0]?.values, [execution.id]);
  assert.deepEqual(readClient.calls[1]?.values, [eventOccurrence.id]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.eventExecutions);
  await writeRepositories.eventExecutions.save(execution);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO event_executions/);
  assert.match(writeClient.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    execution.id,
    execution.occurrenceId,
    execution.definitionId,
    execution.storyWorldId,
    execution.eventKey,
    [ai.id],
    execution.attempt,
    execution.ruleVersion,
    execution.inputSnapshot,
    EventExecutionStatus.RUNNING,
    execution.startedAt,
    null,
    null,
    null,
  ]);
  assert.ok(!writeClient.calls[0]?.text.includes(execution.eventKey));
});

test("maps and upserts behavior actions and moment drafts", async () => {
  const readClient = new RecordingSqlClient([
    [actionRow()],
    [actionRow()],
    [momentDraftRow()],
    [momentDraftRow()],
  ]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.behaviorActions);
  assert.ok(repositories.momentDrafts);
  assert.deepEqual(await repositories.behaviorActions.getById(action.id), action);
  assert.deepEqual(await repositories.behaviorActions.listByExecution(execution.id), [action]);
  assert.deepEqual(await repositories.momentDrafts.getById(momentDraft.id), momentDraft);
  assert.deepEqual(await repositories.momentDrafts.getByActionId(action.id), momentDraft);
  assert.deepEqual(readClient.calls[0]?.values, [action.id]);
  assert.deepEqual(readClient.calls[1]?.values, [execution.id]);
  assert.deepEqual(readClient.calls[2]?.values, [momentDraft.id]);
  assert.deepEqual(readClient.calls[3]?.values, [action.id]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.behaviorActions);
  assert.ok(writeRepositories.momentDrafts);
  await writeRepositories.behaviorActions.save(action);
  await writeRepositories.momentDrafts.save(momentDraft);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO behavior_actions/);
  assert.match(writeClient.calls[0]?.text ?? "", /payload/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    action.id,
    action.executionId,
    action.storyWorldId,
    action.actorCharacterId,
    action.kind,
    action.status,
    action.priority,
    action.payload,
    action.createdAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /INSERT INTO moment_drafts/);
  assert.deepEqual(writeClient.calls[1]?.values, [
    momentDraft.id,
    momentDraft.actionId,
    momentDraft.executionId,
    momentDraft.storyWorldId,
    momentDraft.authorCharacterId,
    MomentVisibility.PUBLIC,
    momentDraft.body,
    MomentDraftStatus.DRAFT,
    null,
    momentDraft.createdAt,
    momentDraft.updatedAt,
  ]);
});

test("maps and upserts image jobs with Fake ComfyUI lifecycle fields", async () => {
  const readClient = new RecordingSqlClient([[imageJobRow()], [imageJobRow()], [imageJobRow()], [imageJobRow()], []]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.imageJobs);
  assert.deepEqual(await repositories.imageJobs.getById(imageJob.id), imageJob);
  assert.deepEqual(await repositories.imageJobs.getByActionId(action.id), imageJob);
  assert.deepEqual(await repositories.imageJobs.listSucceededByStoryWorld(imageJob.storyWorldId), [imageJob]);
  assert.deepEqual(await repositories.imageJobs.listQueued(), [imageJob]);
  assert.deepEqual(await repositories.imageJobs.listSubmitted(), []);
  assert.deepEqual(readClient.calls[0]?.values, [imageJob.id]);
  assert.deepEqual(readClient.calls[1]?.values, [action.id]);
  assert.deepEqual(readClient.calls[2]?.values, [imageJob.storyWorldId]);
  assert.match(readClient.calls[2]?.text ?? "", /status = 'SUCCEEDED'/);
  assert.deepEqual(readClient.calls[3]?.values, [100]);
  assert.match(readClient.calls[3]?.text ?? "", /status = 'QUEUED'/);
  assert.deepEqual(readClient.calls[4]?.values, [100]);
  assert.match(readClient.calls[4]?.text ?? "", /status = 'SUBMITTED'/);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.imageJobs);
  await writeRepositories.imageJobs.save(imageJob);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO image_jobs/);
  assert.match(writeClient.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    imageJob.id,
    imageJob.kind,
    imageJob.actionId,
    imageJob.executionId,
    imageJob.storyWorldId,
    imageJob.ownerCharacterId,
    imageJob.momentDraftId,
    imageJob.workflowVersion,
    imageJob.prompt,
    imageJob.attempt,
    null,
    null,
    ImageJobStatus.QUEUED,
    null,
    null,
    null,
    imageJob.createdAt,
    imageJob.updatedAt,
  ]);
});

test("maps and upserts visual identities and versioned workflow templates", async () => {
  const readClient = new RecordingSqlClient([
    [visualIdentityRow()],
    [visualIdentityRow()],
    [workflowTemplateRow()],
    [workflowTemplateRow()],
  ]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.characterVisualIdentities);
  assert.ok(repositories.imageWorkflowTemplates);
  assert.deepEqual(
    await repositories.characterVisualIdentities.getById(visualIdentity.id),
    visualIdentity,
  );
  assert.deepEqual(
    await repositories.characterVisualIdentities.getByCharacterId(ai.id),
    visualIdentity,
  );
  assert.deepEqual(
    await repositories.imageWorkflowTemplates.getById(workflowTemplate.id, workflowTemplate.version),
    workflowTemplate,
  );
  assert.deepEqual(await repositories.imageWorkflowTemplates.list(), [workflowTemplate]);
  assert.deepEqual(readClient.calls[0]?.values, [visualIdentity.id]);
  assert.deepEqual(readClient.calls[1]?.values, [ai.id]);
  assert.deepEqual(readClient.calls[2]?.values, [workflowTemplate.id, workflowTemplate.version]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.characterVisualIdentities);
  assert.ok(writeRepositories.imageWorkflowTemplates);
  await writeRepositories.characterVisualIdentities.save(visualIdentity);
  await writeRepositories.imageWorkflowTemplates.save(workflowTemplate);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO character_visual_identities/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    visualIdentity.id,
    visualIdentity.characterId,
    visualIdentity.storyWorldId,
    visualIdentity.positivePrompt,
    visualIdentity.negativePrompt,
    [...visualIdentity.styleTags],
    [...visualIdentity.referenceImageRefs],
    visualIdentity.revision,
    visualIdentity.updatedAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /INSERT INTO image_workflow_templates/);
  assert.deepEqual(writeClient.calls[1]?.values, [
    workflowTemplate.id,
    workflowTemplate.version,
    JSON.stringify(workflowTemplate.workflow),
    [...workflowTemplate.positivePromptPath],
    [...workflowTemplate.negativePromptPath!],
    null,
  ]);
});

test("maps and upserts social moments with visibility-aware feed queries", async () => {
  const readClient = new RecordingSqlClient([[momentRow()], [momentRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.moments);
  assert.deepEqual(
    await repositories.moments.getById(moment.id),
    moment,
  );
  assert.deepEqual(
    await repositories.moments.listFeed(world.id, ai.id, 10),
    [moment],
  );
  assert.deepEqual(readClient.calls[0]?.values, [moment.id]);
  assert.deepEqual(readClient.calls[1]?.values, [world.id, ai.id, 10]);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.moments);
  await writeRepositories.moments.save(moment);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO moments/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    moment.id,
    moment.draftId,
    moment.storyWorldId,
    moment.authorCharacterId,
    MomentVisibility.PUBLIC,
    [],
    moment.body,
    moment.imageMediaRef,
    moment.publishedAt,
    moment.createdAt,
  ]);
});

test("maps and idempotently writes moment interactions", async () => {
  const readClient = new RecordingSqlClient([[momentInteractionRow()], [momentInteractionRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.momentInteractions);
  assert.deepEqual(
    await repositories.momentInteractions.listByMoment(moment.id),
    [momentInteraction],
  );

  const insertedClient = new RecordingSqlClient([[momentInteractionRow()]]);
  const insertedRepositories = createSqlRepositories(insertedClient);
  assert.ok(insertedRepositories.momentInteractions);
  const inserted = await insertedRepositories.momentInteractions.save(momentInteraction);
  assert.deepEqual(inserted, { interaction: momentInteraction, inserted: true });

  const replayClient = new RecordingSqlClient([[], [momentInteractionRow()]]);
  const replayRepositories = createSqlRepositories(replayClient);
  assert.ok(replayRepositories.momentInteractions);
  const replay = await replayRepositories.momentInteractions.save({
    ...momentInteraction,
    id: "different-interaction-id",
  });
  assert.equal(replay.inserted, false);
  assert.equal(replay.interaction.id, momentInteraction.id);
  assert.match(replayClient.calls[1]?.text ?? "", /idempotency_key = \$2/);
});

test("maps optional PostgreSQL dates, arrays, JSON payloads, and lifecycle fields", async () => {
  const endedSession = {
    ...sessionRow(),
    started_at: new Date(session.startedAt),
    ended_at: new Date("2026-08-05T12:00:00.000Z"),
    user_birth_date: new Date("2000-01-01T00:00:00.000Z"),
  };
  const optionalMessage = {
    ...messageRow("message-optional"),
    author_character_id: null,
    text: null,
    media_ref: "media://optional.png",
    sticker_id: "sticker-optional",
    created_at: new Date("2026-08-05T12:31:00.000Z"),
  };
  const optionalMemory = {
    ...memoryRow(),
    occurred_at: new Date("2026-08-05T12:40:00.000Z"),
    subject_character_id: user.id,
    audience_character_ids: '{"user-sql","ai-sql"}',
    source_ref: "event:optional",
    created_at: new Date("2026-08-05T12:40:00.000Z"),
  };
  const onceDefinition = createWorldEventDefinition({
    id: "event-sql-once",
    storyWorld: world,
    eventKey: "world:sql-once",
    name: "SQL once",
    triggerSource: TriggerSource.MANUAL,
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-16T10:00:00.000Z" },
    targetCharacters: [ai],
    createdAt: "2026-08-05T12:45:00.000Z",
  });
  const onceRow = {
    ...eventDefinitionRow(onceDefinition),
    recurrence_kind: "ONCE",
    run_at: new Date("2026-08-16T10:00:00.000Z"),
    recurrence_month: null,
    recurrence_day: null,
    recurrence_local_time: null,
  };
  const completedExecution = {
    ...executionRow(),
    input_snapshot: JSON.stringify(execution.inputSnapshot),
    output_snapshot: JSON.stringify({ done: true }),
    status: EventExecutionStatus.COMPLETED,
    finished_at: new Date("2026-08-15T10:01:00.000Z"),
  };
  const optionalJob = imageJobRow({
    ...imageJob,
    status: ImageJobStatus.SUCCEEDED,
    negativePrompt: "blurry",
    seed: 42,
    externalJobId: "external-job",
    mediaRef: "media://job.png",
  });
  const optionalIdentity = { ...visualIdentityRow(), style_tags: '{"anime","soft"}', reference_image_refs: "{}" };
  const optionalTemplate = { ...workflowTemplateRow(), workflow: JSON.stringify(workflowTemplate.workflow), positive_prompt_path: '{"node","inputs","text"}', negative_prompt_path: '{"node","inputs","negative"}', seed_path: null };
  const optionalPack = { ...momentRow(), audience_character_ids: '{"user-sql"}' };
  const optionalSticker = { ...momentInteractionRow(), kind: MomentInteractionKind.COMMENT, text: "comment" };
  const client = new RecordingSqlClient([
    [endedSession],
    [optionalMessage],
    [optionalMemory],
    [onceRow],
    [completedExecution],
    [optionalJob],
    [optionalIdentity],
    [optionalTemplate],
    [optionalPack],
    [optionalSticker],
  ]);
  const repositories = createSqlRepositories(client);
  assert.equal((await repositories.actorSessions.getById(session.id))?.endedAt, "2026-08-05T12:00:00.000Z");
  const optionalMessageResult = (await repositories.messages.listByConversation("conversation-sql"))[0];
  assert.equal(optionalMessageResult?.id, "message-optional");
  assert.equal(optionalMessageResult?.authorCharacterId, undefined);
  assert.equal(optionalMessageResult?.mediaRef, "media://optional.png");
  assert.equal(optionalMessageResult?.stickerId, "sticker-optional");
  const memoryResult = await repositories.memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: "lantern", limit: 1 });
  assert.equal(memoryResult[0]?.memory.subjectCharacterId, user.id);
  assert.equal((await repositories.worldEventDefinitions.getById(onceDefinition.id))?.recurrence.kind, EventRecurrenceKind.ONCE);
  assert.equal((await repositories.eventExecutions.getById(execution.id))?.status, EventExecutionStatus.COMPLETED);
  assert.equal((await repositories.imageJobs.getById(imageJob.id))?.seed, 42);
  assert.deepEqual((await repositories.characterVisualIdentities.getById(visualIdentity.id))?.styleTags, ["anime", "soft"]);
  assert.equal((await repositories.imageWorkflowTemplates.getById(workflowTemplate.id, workflowTemplate.version))?.seedPath, undefined);
  assert.equal((await repositories.moments.getById(moment.id))?.audienceCharacterIds[0], user.id);
  assert.equal((await repositories.momentInteractions.listByMoment(moment.id))[0]?.text, "comment");
});

test("SQL repositories bound invalid limits, missing rows, and idempotency conflicts", async () => {
  const empty = new RecordingSqlClient([[], [], [], [], [], [], [], []]);
  const repositories = createSqlRepositories(empty);
  await assert.rejects(repositories.scheduledOccurrences.listPending(world.id, "not-a-date", 1), /scheduledBefore/);
  await assert.rejects(repositories.scheduledOccurrences.listPending(world.id, eventOccurrence.scheduledFor, 0), /limit/);
  await assert.rejects(repositories.scheduledOccurrences.listByWindow(world.id, "not-a-date", eventOccurrence.scheduledFor, 1), /window/);
  await assert.rejects(repositories.scheduledOccurrences.listByWindow(world.id, eventOccurrence.scheduledFor, eventOccurrence.scheduledFor, 1), /startsAt/);
  await assert.rejects(repositories.moments.listFeed(world.id, user.id, 0), /moment feed limit/);
  await assert.rejects(repositories.scheduledOccurrences.update(eventOccurrence), /Unknown scheduled occurrence/);
  await assert.rejects(repositories.messages.save({
    id: "message-missing-replay",
    conversationId: "conversation-sql",
    authorCharacterId: user.id,
    kind: "TEXT",
    text: "message",
    createdAt: "2026-08-05T12:31:00.000Z",
    idempotencyKey: "missing-replay",
  }), /idempotency lookup/);
  const conflict = new RecordingSqlClient([[], [messageRow()]]);
  await assert.rejects(createSqlRepositories(conflict).messages.save({
    id: "message-conflict",
    conversationId: "conversation-sql",
    authorCharacterId: ai.id,
    kind: "TEXT",
    text: "different",
    createdAt: "2026-08-05T12:31:00.000Z",
    idempotencyKey: "message-sql-key",
  }), /idempotency key conflict/);
});

test("covers SQL row parser failures and less-traveled repository branches", async () => {
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...worldRow(world), id: " " }]])).storyWorlds.list(),
    /must be a non-empty string/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...worldRow(world), relationship_dynamics_enabled: "yes" }]])).storyWorlds.list(),
    /must be a boolean/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...memoryRow(), confidence: "not-a-number" }]])).memories.listForCharacter(world.id, user.id),
    /must be a finite number/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...memoryRow(), audience_character_ids: "not-an-array" }]])).memories.listForCharacter(world.id, user.id),
    /must be a string array/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...eventDefinitionRow(), recurrence_kind: "OTHER" }]])).worldEventDefinitions.listByStoryWorld(world.id),
    /unsupported value/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...executionRow(), input_snapshot: "not-json" }]])).eventExecutions.getById(execution.id),
    /valid JSON/,
  );
  await assert.rejects(
    createSqlRepositories(new RecordingSqlClient([[{ ...actionRow(), payload: "[]" }]])).behaviorActions.getById(action.id),
    /JSON object/,
  );

  const lookupClient = new RecordingSqlClient([[], [characterRow(user)], [], conversationRows()]);
  const lookup = createSqlRepositories(lookupClient);
  assert.equal(await lookup.storyWorlds.getById("missing"), undefined);
  assert.deepEqual(await lookup.characters.listByStoryWorld(undefined), [user]);
  const filteredCharacters = createSqlRepositories(new RecordingSqlClient([[characterRow(user)]]));
  assert.deepEqual(await filteredCharacters.characters.listByStoryWorld(world.id), [user]);
  assert.equal(await lookup.relationshipEdges.getById("missing"), undefined);
  assert.deepEqual(await lookup.conversations.listByCharacter(user.id), [{
    conversation: {
      id: "conversation-sql",
      storyWorldId: world.id,
      type: "PRIVATE",
      createdAt: "2026-08-05T12:30:00.000Z",
    },
    members: [
      { conversationId: "conversation-sql", characterId: user.id, joinedAt: "2026-08-05T12:30:00.000Z" },
      { conversationId: "conversation-sql", characterId: ai.id, joinedAt: "2026-08-05T12:30:00.000Z" },
    ],
  }]);

  const emptyConversation = {
    conversation: {
      id: "empty-conversation",
      storyWorldId: world.id,
      type: "GROUP" as const,
      createdAt: "2026-08-05T12:30:00.000Z",
    },
    members: [],
  };
  await assert.rejects(createSqlRepositories(new RecordingSqlClient()).conversations.save(emptyConversation), /at least one member/);

  await assert.rejects(createSqlRepositories(new RecordingSqlClient()).memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: " " }), /queryText/);
  await assert.rejects(createSqlRepositories(new RecordingSqlClient()).memories.search({ storyWorldId: world.id, readerCharacterId: user.id, queryText: "query", limit: 0 }), /limit/);

  const missingOccurrenceClient = new RecordingSqlClient([[], []]);
  const missingOccurrence = createSqlRepositories(missingOccurrenceClient);
  assert.equal(await missingOccurrence.scheduledOccurrences.getById("missing"), undefined);
  assert.equal(await missingOccurrence.scheduledOccurrences.getByOccurrenceKey(world.id, "missing"), undefined);
  await assert.rejects(missingOccurrence.scheduledOccurrences.listByWindow(world.id, "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z", 0), /limit/);

  const unresolved = createSqlRepositories(new RecordingSqlClient([[], []]));
  await assert.rejects(unresolved.scheduledOccurrences.save(eventOccurrence), /could not be resolved/);

  const changedRow = occurrenceRow({ ...eventOccurrence, definitionId: "different-definition" });
  await assert.rejects(createSqlRepositories(new RecordingSqlClient([[changedRow]])).scheduledOccurrences.update(eventOccurrence), /identity cannot change/);

  assert.equal(await createSqlRepositories(new RecordingSqlClient([[]])).stickerPacks.getById("missing"), undefined);

  const appearanceRow = {
    id: "appearance-local-user",
    owner_key: "local-user",
    theme_id: "blossom",
    chat_background_kind: "custom",
    chat_background_image_ref: "data:image/jpeg;base64,aGVsbG8=",
    chat_background_opacity: 0.55,
    chat_background_blur: 6,
    chat_background_items: [{ id: "bg-1", label: "夜色窗边", kind: "custom", imageRef: "data:image/png;base64,aGVsbG8=", createdAt: "2026-08-08T10:01:00.000Z" }],
    updated_at: "2026-08-08T10:00:00.000Z",
  };
  const appearanceClient = new RecordingSqlClient([[appearanceRow]]);
  const appearanceRepo = createSqlRepositories(appearanceClient).appearanceSettings;
  assert.ok(appearanceRepo);
  assert.deepEqual(await appearanceRepo.getByOwnerKey("local-user"), {
    id: "appearance-local-user",
    ownerKey: "local-user",
    themeId: "blossom",
    chatBackground: {
      kind: "custom",
      imageRef: "data:image/jpeg;base64,aGVsbG8=",
      opacity: 0.55,
      blur: 6,
      items: [{ id: "bg-1", label: "夜色窗边", kind: "custom", imageRef: "data:image/png;base64,aGVsbG8=", createdAt: "2026-08-08T10:01:00.000Z" }],
    },
    updatedAt: "2026-08-08T10:00:00.000Z",
  });
  assert.equal(await createSqlRepositories(new RecordingSqlClient([[]])).appearanceSettings?.getByOwnerKey("missing"), undefined);
  const appearanceNullImageClient = new RecordingSqlClient([[{ ...appearanceRow, chat_background_kind: "theme", chat_background_image_ref: null }]]);
  const themeBackground = await createSqlRepositories(appearanceNullImageClient).appearanceSettings?.getByOwnerKey("local-user");
  assert.equal(themeBackground?.chatBackground.kind, "theme");
  assert.equal(themeBackground?.chatBackground.imageRef, undefined);
  assert.deepEqual(themeBackground?.chatBackground.items, appearanceRow.chat_background_items);
  const appearanceSaveClient = new RecordingSqlClient();
  await createSqlRepositories(appearanceSaveClient).appearanceSettings?.save({
    id: "appearance-local-user",
    ownerKey: "local-user",
    themeId: "blossom",
    chatBackground: { kind: "theme", opacity: 0.4, blur: 0 },
    updatedAt: "2026-08-08T11:00:00.000Z",
  });
  assert.match(appearanceSaveClient.calls[0]?.text ?? "", /INSERT INTO appearance_settings/);
  assert.match(appearanceSaveClient.calls[0]?.text ?? "", /ON CONFLICT \(owner_key\) DO UPDATE/);
  assert.deepEqual(appearanceSaveClient.calls[0]?.values.slice(0, 4), [
    "appearance-local-user",
    "local-user",
    "blossom",
    "theme",
  ]);
  assert.equal(appearanceSaveClient.calls[0]?.values[4], null);
  assert.equal(appearanceSaveClient.calls[0]?.values[7], "[]");

  const interactionConflict = createSqlRepositories(new RecordingSqlClient([[], [{ ...momentInteractionRow(), kind: MomentInteractionKind.COMMENT, text: "different" }]]));
  await assert.rejects(interactionConflict.momentInteractions.save(momentInteraction), /idempotency key conflict/);

  const unsupported = createSqlRepositories(new RecordingSqlClient());
  await assert.rejects(unsupported.transaction(async () => "never"), /does not support transactions/);
  const transactionalClient = {
    async query<Row extends SqlRow = SqlRow>() { return { rows: [] as readonly Row[] }; },
    async transaction<T>(operation: (client: SqlClient) => Promise<T>) {
      return operation(new RecordingSqlClient());
    },
  };
  assert.equal(await createSqlRepositories(transactionalClient).transaction(async () => "ok"), "ok");
});

test("maps and persists integration provider profiles and default ComfyUI settings", async () => {
  const llmProfile = createLlmProviderProfile({
    id: "profile-sql",
    name: "SQL provider",
    protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
    baseUrl: "https://llm.example.test/v1",
    model: "example-model",
    encryptedApiKey: "encrypted-key",
    encryptionIv: "encryption-iv",
    isActive: true,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:01:00.000Z",
  });
  const comfySettings = createComfyUiSettings({
    id: "default",
    baseUrl: "https://comfy.example.test",
    defaultWorkflowVersion: "workflow@v1",
    autoImageIntentEnabled: true,
    updatedAt: "2026-08-09T00:01:00.000Z",
  });
  const profileRow: SqlRow = {
    id: llmProfile.id, name: llmProfile.name, protocol: llmProfile.protocol,
    base_url: llmProfile.baseUrl, model: llmProfile.model, timeout_ms: llmProfile.timeoutMs,
    max_tokens: llmProfile.maxTokens, temperature: llmProfile.temperature,
    encrypted_api_key: llmProfile.encryptedApiKey, encryption_iv: llmProfile.encryptionIv,
    is_active: llmProfile.isActive, created_at: llmProfile.createdAt, updated_at: llmProfile.updatedAt,
  };
  const settingsRow: SqlRow = {
    id: comfySettings.id, comfyui_base_url: comfySettings.baseUrl,
    comfyui_timeout_ms: comfySettings.timeoutMs, default_workflow_version: comfySettings.defaultWorkflowVersion,
    auto_image_intent_enabled: comfySettings.autoImageIntentEnabled, updated_at: comfySettings.updatedAt,
  };
  const readClient = new RecordingSqlClient([[profileRow], [profileRow], [settingsRow]]);
  const readRepositories = createSqlRepositories(readClient);
  assert.deepEqual(await readRepositories.llmProviderProfiles.getById(llmProfile.id), llmProfile);
  assert.deepEqual(await readRepositories.llmProviderProfiles.getActive(), llmProfile);
  assert.deepEqual(await readRepositories.comfyUiSettings.get(), comfySettings);
  assert.deepEqual(readClient.calls[0]?.values, [llmProfile.id]);
  assert.match(readClient.calls[1]?.text ?? "", /WHERE is_active = true/);
  assert.match(readClient.calls[2]?.text ?? "", /WHERE id = 'default'/);

  const writeClient = new RecordingSqlClient();
  const writeRepositories = createSqlRepositories(writeClient);
  await writeRepositories.llmProviderProfiles.save(llmProfile);
  await writeRepositories.llmProviderProfiles.delete(llmProfile.id);
  await writeRepositories.comfyUiSettings.save(comfySettings);
  assert.match(writeClient.calls[0]?.text ?? "", /WITH deactivate_other_profiles AS/);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO llm_provider_profiles/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    llmProfile.id, llmProfile.name, llmProfile.protocol, llmProfile.baseUrl, llmProfile.model,
    llmProfile.timeoutMs, llmProfile.maxTokens, llmProfile.temperature, llmProfile.encryptedApiKey,
    llmProfile.encryptionIv, true, llmProfile.createdAt, llmProfile.updatedAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /DELETE FROM llm_provider_profiles WHERE id = \$1/);
  assert.deepEqual(writeClient.calls[1]?.values, [llmProfile.id]);
  assert.match(writeClient.calls[2]?.text ?? "", /INSERT INTO integration_settings/);
  assert.deepEqual(writeClient.calls[2]?.values, [
    comfySettings.id, comfySettings.baseUrl, comfySettings.timeoutMs, comfySettings.defaultWorkflowVersion,
    comfySettings.autoImageIntentEnabled, comfySettings.updatedAt,
  ]);
});

test("maps, searches, and persists categorized world lore entries", async () => {
  const entry = createWorldLoreEntry({
    id: "lore-sql",
    storyWorldId: world.id,
    category: "location",
    title: "Moon Harbor",
    content: "Ships arrive under a silver moon.",
    tags: ["harbor", "moon"],
    isEnabled: true,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:01:00.000Z",
  });
  const row: SqlRow = {
    id: entry.id,
    story_world_id: entry.storyWorldId,
    category: entry.category,
    title: entry.title,
    content: entry.content,
    tags: [...entry.tags],
    is_enabled: entry.isEnabled,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
  const readClient = new RecordingSqlClient([[row], [row], [row]]);
  const repository = createSqlRepositories(readClient).worldLoreEntries;
  assert.deepEqual(await repository.listByStoryWorld(world.id), [entry]);
  assert.deepEqual(await repository.getById(entry.id), entry);
  assert.deepEqual(await repository.search(world.id, "moon harbor"), [entry]);
  assert.match(readClient.calls[2]?.text ?? "", /is_enabled = true/);
  assert.match(readClient.calls[2]?.text ?? "", /websearch_to_tsquery\('simple', \$2\)/);
  assert.deepEqual(readClient.calls[2]?.values, [world.id, "moon harbor"]);

  const writeClient = new RecordingSqlClient();
  const writable = createSqlRepositories(writeClient).worldLoreEntries;
  await writable.save(entry);
  await writable.delete(entry.id);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO world_lore_entries/);
  assert.match(writeClient.calls[0]?.text ?? "", /ON CONFLICT \(id\) DO UPDATE/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    entry.id, entry.storyWorldId, entry.category, entry.title, entry.content,
    [...entry.tags], entry.isEnabled, entry.createdAt, entry.updatedAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /DELETE FROM world_lore_entries WHERE id = \$1/);
  await assert.rejects(repository.search(world.id, " "), /queryText/);
});

test("SQL llmProviderProfiles.list returns all profiles ordered by id", async () => {
  const llmProfile = createLlmProviderProfile({
    id: "llm-list", name: "List Test", protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
    baseUrl: "https://api.test.com", model: "gpt-4",
    createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
  });
  const profileRow: SqlRow = {
    id: llmProfile.id, name: llmProfile.name, protocol: llmProfile.protocol,
    base_url: llmProfile.baseUrl, model: llmProfile.model, timeout_ms: llmProfile.timeoutMs,
    max_tokens: llmProfile.maxTokens, temperature: llmProfile.temperature,
    encrypted_api_key: null, encryption_iv: null,
    is_active: llmProfile.isActive, created_at: llmProfile.createdAt, updated_at: llmProfile.updatedAt,
  };
  const client = new RecordingSqlClient([[profileRow]]);
  const repos = createSqlRepositories(client);
  const list = await repos.llmProviderProfiles.list();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, llmProfile.id);
  assert.match(client.calls[0]?.text ?? "", /ORDER BY id/);
});

test("SQL comfyUiSettings.save rejects non-default id", async () => {
  const client = new RecordingSqlClient();
  const repos = createSqlRepositories(client);
  await assert.rejects(
    repos.comfyUiSettings.save({
      id: "wrong-id",
      baseUrl: "http://localhost:8188",
      timeoutMs: 30_000,
      autoImageIntentEnabled: false,
      updatedAt: "2026-08-09T00:00:00.000Z",
    }),
    { name: "TypeError", message: /must be default/ },
  );
});

test("SQL storyWorlds.save and characters.save execute insert/upsert", async () => {
  const client = new RecordingSqlClient();
  const repos = createSqlRepositories(client);
  await repos.storyWorlds.save(world);
  assert.match(client.calls[0]?.text ?? "", /INSERT INTO story_worlds/);
  assert.deepEqual(client.calls[0]?.values, [
    world.id, world.name, world.timezone, world.storyMode, world.relationshipDynamicsEnabled,
  ]);

  await repos.characters.save(user);
  assert.match(client.calls[1]?.text ?? "", /INSERT INTO characters/);
  assert.deepEqual(client.calls[1]?.values, [
    user.id, user.displayName, user.role, user.storyWorldId, user.timezone,
    user.birthDate ?? null, user.personaPrompt ?? null, user.personaPromptRef ?? null, user.visualPromptRef ?? null,
  ]);
});

test("SQL scheduledOccurrences.listForCreatorScan validates limit and horizonEnd", async () => {
  const client = new RecordingSqlClient();
  const repos = createSqlRepositories(client);
  await assert.rejects(
    repos.scheduledOccurrences.listForCreatorScan(world.id, "2026-08-10T00:00:00.000Z", 0),
    /positive integer/,
  );
  await assert.rejects(
    repos.scheduledOccurrences.listForCreatorScan(world.id, "not-a-date", 10),
    /valid ISO timestamp/,
  );
});

test("SQL jsonArray parses string values and rejects non-arrays", async () => {
  const itemsRow: SqlRow = {
    id: "appearance-string-items",
    owner_key: "user",
    theme_id: "blossom",
    chat_background_kind: "custom",
    chat_background_image_ref: "data:image/png;base64,aGVsbG8=",
    chat_background_opacity: 0.5,
    chat_background_blur: 0,
    chat_background_items: JSON.stringify([{ id: "bg-1", label: "Str", kind: "custom", imageRef: "data:image/png;base64,aGVsbG8=", createdAt: "2026-08-08T10:00:00.000Z" }]),
    updated_at: "2026-08-08T10:00:00.000Z",
  };
  const client = new RecordingSqlClient([[itemsRow]]);
  const repos = createSqlRepositories(client);
  const settings = await repos.appearanceSettings.getByOwnerKey("user");
  assert.ok(settings);
  assert.equal(settings.chatBackground.items?.length, 1);
  assert.equal(settings.chatBackground.items?.[0]?.id, "bg-1");

  // Test non-array JSON rejection (valid JSON but not an array)
  const badRow: SqlRow = { ...itemsRow, chat_background_items: JSON.stringify({ not: "array" }) };
  const badClient = new RecordingSqlClient([[badRow]]);
  const badRepos = createSqlRepositories(badClient);
  await assert.rejects(badRepos.appearanceSettings.getByOwnerKey("user"), /JSON array/);
});

test("SQL scheduledOccurrences.listForCreatorScan executes query with valid parameters", async () => {
  const client = new RecordingSqlClient([[]]);
  const repos = createSqlRepositories(client);
  const result = await repos.scheduledOccurrences.listForCreatorScan(world.id, "2026-08-10T00:00:00.000Z", 10);
  assert.deepEqual(result, []);
  assert.match(client.calls[0]?.text ?? "", /scheduled_for <= \$2/);
});

test("SQL jsonArray rejects invalid JSON strings", async () => {
  const badJsonRow: SqlRow = {
    id: "appearance-bad-json",
    owner_key: "user",
    theme_id: "blossom",
    chat_background_kind: "custom",
    chat_background_image_ref: "data:image/png;base64,aGVsbG8=",
    chat_background_opacity: 0.5,
    chat_background_blur: 0,
    chat_background_items: "{invalid json",
    updated_at: "2026-08-08T10:00:00.000Z",
  };
  const client = new RecordingSqlClient([[badJsonRow]]);
  const repos = createSqlRepositories(client);
  await assert.rejects(repos.appearanceSettings.getByOwnerKey("user"), /valid JSON/);
});
