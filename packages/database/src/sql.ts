import {
  createActorSession,
  assertCharacterPlan,
  assertBehaviorAction,
  assertEventExecution,
  assertImageJob,
  assertCharacterVisualIdentity,
  assertImageWorkflowTemplate,
  assertSticker,
  assertStickerPack,
  assertMoment,
  assertMomentInteraction,
  assertMomentDraft,
  assertProactiveMessageBudget,
  createCharacter,
  createConversation,
  assertScheduledOccurrence,
  assertMemoryItem,
  assertWorldEventDefinition,
  createRelationshipEdge,
  createStoryWorld,
  type ActorSession,
  type BehaviorAction,
  type CharacterPlan,
  type Character,
  type CharacterInput,
  type ConversationAggregate,
  type ConversationType as ConversationTypeValue,
  type EventExecution,
  type ImageJob,
  type CharacterVisualIdentity,
  type ImageWorkflowTemplate,
  type Sticker,
  type StickerPack,
  type Moment,
  type MomentInteraction,
  type JsonObject,
  type Message,
  type MessageKind as MessageKindValue,
  type MemoryItem,
  type MemorySearchQuery,
  type MemorySearchResult,
  type ProactiveMessageBudget,
  type MomentDraft,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type ScheduledOccurrenceStatus as ScheduledOccurrenceStatusValue,
  type StoryWorld,
  type StoryMode as StoryModeValue,
  type WorldEventDefinition,
} from "../../domain/src/index.ts";
import type {
  ActorSessionRepository,
  BehaviorActionRepository,
  CharacterPlanRepository,
  CharacterRepository,
  ConversationRepository,
  DomainRepositories,
  EventExecutionRepository,
  ImageJobRepository,
  CharacterVisualIdentityRepository,
  ImageWorkflowTemplateRepository,
  StickerPackRepository,
  StickerRepository,
  MomentInteractionRepository,
  MomentInteractionWriteResult,
  MomentRepository,
  MessageRepository,
  MessageWriteResult,
  MemoryRepository,
  ProactiveMessageBudgetRepository,
  MomentDraftRepository,
  RelationshipEdgeRepository,
  ScheduledOccurrenceRepository,
  ScheduledOccurrenceWriteResult,
  StoryWorldRepository,
  WorldEventDefinitionRepository,
} from "./repositories.ts";
import { SqlOutboxEventRepository } from "./outbox.ts";
import type { MigrationDatabase } from "./migrations.ts";

export type SqlRow = Record<string, unknown>;

export interface SqlQueryResult<Row extends SqlRow = SqlRow> {
  readonly rows: readonly Row[];
}

export interface SqlClient {
  query<Row extends SqlRow = SqlRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Database row ${field} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return requiredString(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`Database row ${field} must be a boolean`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`Database row ${field} must be a finite number`);
  }
  return number;
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return requiredString(value, field).slice(0, 10);
}

function requiredTimestamp(value: unknown, field: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return requiredString(value, field);
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return requiredTimestamp(value, field);
}

function mapStoryWorldRow(row: SqlRow): StoryWorld {
  return createStoryWorld({
    id: requiredString(row.id, "story_worlds.id"),
    name: requiredString(row.name, "story_worlds.name"),
    timezone: requiredString(row.timezone, "story_worlds.timezone"),
    storyMode: requiredString(row.story_mode, "story_worlds.story_mode") as StoryModeValue,
    relationshipDynamicsEnabled: requiredBoolean(
      row.relationship_dynamics_enabled,
      "story_worlds.relationship_dynamics_enabled",
    ),
  });
}

function mapCharacterRow(row: SqlRow, prefix = ""): Character {
  const input: CharacterInput = {
    id: requiredString(row[`${prefix}id`], `${prefix}characters.id`),
    displayName: requiredString(
      row[`${prefix}display_name`],
      `${prefix}characters.display_name`,
    ),
    role: requiredString(row[`${prefix}role`], `${prefix}characters.role`) as Character["role"],
    storyWorldId: requiredString(
      row[`${prefix}story_world_id`],
      `${prefix}characters.story_world_id`,
    ),
    timezone: requiredString(row[`${prefix}timezone`], `${prefix}characters.timezone`),
  };
  const birthDate = optionalDate(row[`${prefix}birth_date`], `${prefix}characters.birth_date`);
  const personaPromptRef = optionalString(
    row[`${prefix}persona_prompt_ref`],
    `${prefix}characters.persona_prompt_ref`,
  );
  const visualPromptRef = optionalString(
    row[`${prefix}visual_prompt_ref`],
    `${prefix}characters.visual_prompt_ref`,
  );
  if (birthDate !== undefined) input.birthDate = birthDate;
  if (personaPromptRef !== undefined) input.personaPromptRef = personaPromptRef;
  if (visualPromptRef !== undefined) input.visualPromptRef = visualPromptRef;
  return createCharacter(input);
}

function mapRelationshipEdgeRow(row: SqlRow): RelationshipEdge {
  return createRelationshipEdge({
    id: requiredString(row.id, "relationship_edges.id"),
    source: mapCharacterRow(row, "source_"),
    target: mapCharacterRow(row, "target_"),
    storyWorld: createStoryWorld({
      id: requiredString(row.world_id, "story_worlds.id"),
      name: requiredString(row.world_name, "story_worlds.name"),
      timezone: requiredString(row.world_timezone, "story_worlds.timezone"),
      storyMode: requiredString(
        row.world_story_mode,
        "story_worlds.story_mode",
      ) as StoryModeValue,
      relationshipDynamicsEnabled: requiredBoolean(
        row.world_relationship_dynamics_enabled,
        "story_worlds.relationship_dynamics_enabled",
      ),
    }),
    relationshipType: requiredString(
      row.relationship_type,
      "relationship_edges.relationship_type",
    ),
    initialState: {
      affinity: requiredNumber(row.affinity, "relationship_edges.affinity"),
      trust: requiredNumber(row.trust, "relationship_edges.trust"),
      conflict: requiredNumber(row.conflict, "relationship_edges.conflict"),
      dependency: requiredNumber(row.dependency, "relationship_edges.dependency"),
    },
    isPublic: requiredBoolean(row.is_public, "relationship_edges.is_public"),
    isBidirectional: requiredBoolean(
      row.is_bidirectional,
      "relationship_edges.is_bidirectional",
    ),
  });
}

function mapActorSessionRow(row: SqlRow): ActorSession {
  const world = createStoryWorld({
    id: requiredString(row.world_id, "story_worlds.id"),
    name: requiredString(row.world_name, "story_worlds.name"),
    timezone: requiredString(row.world_timezone, "story_worlds.timezone"),
    storyMode: requiredString(row.world_story_mode, "story_worlds.story_mode") as StoryModeValue,
    relationshipDynamicsEnabled: requiredBoolean(
      row.world_relationship_dynamics_enabled,
      "story_worlds.relationship_dynamics_enabled",
    ),
  });
  const userCharacter = mapCharacterRow(row, "user_");
  const endedAt = row.ended_at === null || row.ended_at === undefined
    ? undefined
    : requiredTimestamp(row.ended_at, "actor_sessions.ended_at");
  const input = {
    id: requiredString(row.id, "actor_sessions.id"),
    storyWorld: world,
    userCharacter,
    startedAt: requiredTimestamp(row.started_at, "actor_sessions.started_at"),
  };
  if (endedAt !== undefined) {
    return createActorSession({ ...input, endedAt });
  }
  return createActorSession(input);
}

function mapConversationRows(rows: readonly SqlRow[]): ConversationAggregate[] {
  const groups = new Map<string, SqlRow[]>();
  for (const row of rows) {
    const id = requiredString(row.conversation_id, "conversations.id");
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new TypeError("Database returned an empty conversation group");
    const storyWorld = createStoryWorld({
      id: requiredString(first.world_id, "story_worlds.id"),
      name: requiredString(first.world_name, "story_worlds.name"),
      timezone: requiredString(first.world_timezone, "story_worlds.timezone"),
      storyMode: requiredString(first.world_story_mode, "story_worlds.story_mode") as StoryModeValue,
      relationshipDynamicsEnabled: requiredBoolean(
        first.world_relationship_dynamics_enabled,
        "story_worlds.relationship_dynamics_enabled",
      ),
    });
    const characters = group.map((row) => mapCharacterRow(row, "member_"));
    const title = optionalString(first.conversation_title, "conversations.title");
    const conversationInput = {
      id: requiredString(first.conversation_id, "conversations.id"),
      storyWorld: storyWorld,
      type: requiredString(first.conversation_type, "conversations.type") as ConversationTypeValue,
      createdAt: requiredTimestamp(first.conversation_created_at, "conversations.created_at"),
      members: characters,
    };
    const created = title === undefined
      ? createConversation(conversationInput)
      : createConversation({ ...conversationInput, title });
    return {
      conversation: created.conversation,
      members: group.map((row) => {
        const leftAt = optionalTimestamp(row.member_left_at, "conversation_members.left_at");
        const member = {
          conversationId: created.conversation.id,
          characterId: requiredString(row.member_character_id, "conversation_members.character_id"),
          joinedAt: requiredTimestamp(row.member_joined_at, "conversation_members.joined_at"),
        };
        return leftAt === undefined ? member : { ...member, leftAt };
      }),
    };
  });
}

function mapMessageRow(row: SqlRow): Message {
  const message: Message = {
    id: requiredString(row.id, "messages.id"),
    conversationId: requiredString(row.conversation_id, "messages.conversation_id"),
    kind: requiredString(row.kind, "messages.kind") as MessageKindValue,
    createdAt: requiredTimestamp(row.created_at, "messages.created_at"),
    idempotencyKey: requiredString(row.idempotency_key, "messages.idempotency_key"),
  };
  const authorCharacterId = optionalString(
    row.author_character_id,
    "messages.author_character_id",
  );
  const text = optionalString(row.text, "messages.text");
  const mediaRef = optionalString(row.media_ref, "messages.media_ref");
  const stickerId = optionalString(row.sticker_id, "messages.sticker_id");
  if (authorCharacterId !== undefined) message.authorCharacterId = authorCharacterId;
  if (text !== undefined) message.text = text;
  if (mediaRef !== undefined) message.mediaRef = mediaRef;
  if (stickerId !== undefined) message.stickerId = stickerId;
  return message;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    return inner.length === 0 ? [] : inner.split(",").map((item) => item.replace(/^"|"$/g, ""));
  }
  throw new TypeError(`Database row ${field} must be a string array`);
}

function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === null || value === undefined) return undefined;
  return stringArray(value, field);
}

function mapMemoryRow(row: SqlRow): MemoryItem {
  const memory: MemoryItem = {
    id: requiredString(row.id, "memory_items.id"),
    storyWorldId: requiredString(row.story_world_id, "memory_items.story_world_id"),
    kind: requiredString(row.kind, "memory_items.kind") as MemoryItem["kind"],
    visibility: requiredString(row.visibility, "memory_items.visibility") as MemoryItem["visibility"],
    source: requiredString(row.source, "memory_items.source") as MemoryItem["source"],
    content: requiredString(row.content, "memory_items.content"),
    confidence: requiredNumber(row.confidence, "memory_items.confidence"),
    createdAt: requiredTimestamp(row.created_at, "memory_items.created_at"),
    audienceCharacterIds: stringArray(
      row.audience_character_ids,
      "memory_items.audience_character_ids",
    ),
  };
  const occurredAt = optionalTimestamp(row.occurred_at, "memory_items.occurred_at");
  const subjectCharacterId = optionalString(
    row.subject_character_id,
    "memory_items.subject_character_id",
  );
  const sourceRef = optionalString(row.source_ref, "memory_items.source_ref");
  if (occurredAt !== undefined) memory.occurredAt = occurredAt;
  if (subjectCharacterId !== undefined) memory.subjectCharacterId = subjectCharacterId;
  if (sourceRef !== undefined) memory.sourceRef = sourceRef;
  assertMemoryItem(memory);
  return memory;
}

function requiredLocalTime(value: unknown, field: string): string {
  return requiredString(value, field).slice(0, 5);
}

function mapWorldEventDefinitionRow(row: SqlRow): WorldEventDefinition {
  const recurrenceKind = requiredString(
    row.recurrence_kind,
    "world_event_definitions.recurrence_kind",
  );
  if (recurrenceKind !== "ONCE" && recurrenceKind !== "ANNUAL") {
    throw new TypeError(
      `Database row world_event_definitions.recurrence_kind has an unsupported value`,
    );
  }
  const recurrence = recurrenceKind === "ONCE"
    ? {
        kind: "ONCE" as const,
        runAt: requiredTimestamp(row.run_at, "world_event_definitions.run_at"),
      }
    : {
        kind: "ANNUAL" as const,
        month: requiredNumber(row.recurrence_month, "world_event_definitions.recurrence_month"),
        day: requiredNumber(row.recurrence_day, "world_event_definitions.recurrence_day"),
        localTime: requiredLocalTime(
          row.recurrence_local_time,
          "world_event_definitions.recurrence_local_time",
        ),
      };
  const definition: WorldEventDefinition = {
    id: requiredString(row.id, "world_event_definitions.id"),
    storyWorldId: requiredString(
      row.story_world_id,
      "world_event_definitions.story_world_id",
    ),
    eventKey: requiredString(row.event_key, "world_event_definitions.event_key"),
    name: requiredString(row.name, "world_event_definitions.name"),
    triggerSource: requiredString(
      row.trigger_source,
      "world_event_definitions.trigger_source",
    ) as WorldEventDefinition["triggerSource"],
    timezone: requiredString(row.timezone, "world_event_definitions.timezone"),
    recurrence,
    targetCharacterIds: stringArray(
      row.target_character_ids,
      "world_event_definitions.target_character_ids",
    ),
    priority: requiredNumber(row.priority, "world_event_definitions.priority"),
    enabled: requiredBoolean(row.enabled, "world_event_definitions.enabled"),
    createdAt: requiredTimestamp(row.created_at, "world_event_definitions.created_at"),
  };
  const cooldownSeconds = row.cooldown_seconds === null || row.cooldown_seconds === undefined
    ? undefined
    : requiredNumber(row.cooldown_seconds, "world_event_definitions.cooldown_seconds");
  if (cooldownSeconds !== undefined) definition.cooldownSeconds = cooldownSeconds;
  assertWorldEventDefinition(definition);
  return definition;
}

function mapScheduledOccurrenceRow(row: SqlRow): ScheduledOccurrence {
  const occurrence: ScheduledOccurrence = {
    id: requiredString(row.id, "scheduled_occurrences.id"),
    definitionId: requiredString(
      row.definition_id,
      "scheduled_occurrences.definition_id",
    ),
    storyWorldId: requiredString(
      row.story_world_id,
      "scheduled_occurrences.story_world_id",
    ),
    eventKey: requiredString(row.event_key, "scheduled_occurrences.event_key"),
    scheduledFor: requiredTimestamp(row.scheduled_for, "scheduled_occurrences.scheduled_for"),
    timezone: requiredString(row.timezone, "scheduled_occurrences.timezone"),
    occurrenceKey: requiredString(
      row.occurrence_key,
      "scheduled_occurrences.occurrence_key",
    ),
    status: requiredString(
      row.status,
      "scheduled_occurrences.status",
    ) as ScheduledOccurrenceStatusValue,
    createdAt: requiredTimestamp(row.created_at, "scheduled_occurrences.created_at"),
  };
  assertScheduledOccurrence(occurrence);
  return occurrence;
}

function jsonObject(value: unknown, field: string): JsonObject {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new TypeError(`Database row ${field} must contain valid JSON`);
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`Database row ${field} must contain a JSON object`);
  }
  return parsed as JsonObject;
}

function mapCharacterPlanRow(row: SqlRow): CharacterPlan {
  const plan: CharacterPlan = {
    id: requiredString(row.id, "character_plans.id"),
    storyWorldId: requiredString(row.story_world_id, "character_plans.story_world_id"),
    characterId: requiredString(row.character_id, "character_plans.character_id"),
    startsAt: requiredTimestamp(row.starts_at, "character_plans.starts_at"),
    endsAt: requiredTimestamp(row.ends_at, "character_plans.ends_at"),
    timezone: requiredString(row.timezone, "character_plans.timezone"),
    activity: requiredString(row.activity, "character_plans.activity"),
    interruptibility: requiredString(
      row.interruptibility,
      "character_plans.interruptibility",
    ) as CharacterPlan["interruptibility"],
    createdAt: requiredTimestamp(row.created_at, "character_plans.created_at"),
  };
  const location = optionalString(row.location, "character_plans.location");
  if (location !== undefined) plan.location = location;
  assertCharacterPlan(plan);
  return plan;
}

function mapEventExecutionRow(row: SqlRow): EventExecution {
  const execution: EventExecution = {
    id: requiredString(row.id, "event_executions.id"),
    occurrenceId: requiredString(row.occurrence_id, "event_executions.occurrence_id"),
    definitionId: requiredString(row.definition_id, "event_executions.definition_id"),
    storyWorldId: requiredString(row.story_world_id, "event_executions.story_world_id"),
    eventKey: requiredString(row.event_key, "event_executions.event_key"),
    targetCharacterIds: stringArray(
      row.target_character_ids,
      "event_executions.target_character_ids",
    ),
    attempt: requiredNumber(row.attempt, "event_executions.attempt"),
    ruleVersion: requiredString(row.rule_version, "event_executions.rule_version"),
    inputSnapshot: jsonObject(row.input_snapshot, "event_executions.input_snapshot"),
    status: requiredString(row.status, "event_executions.status") as EventExecution["status"],
    startedAt: requiredTimestamp(row.started_at, "event_executions.started_at"),
  };
  const finishedAt = optionalTimestamp(row.finished_at, "event_executions.finished_at");
  const outputSnapshot = row.output_snapshot === null || row.output_snapshot === undefined
    ? undefined
    : jsonObject(row.output_snapshot, "event_executions.output_snapshot");
  const failureReason = optionalString(row.failure_reason, "event_executions.failure_reason");
  if (finishedAt !== undefined) execution.finishedAt = finishedAt;
  if (outputSnapshot !== undefined) execution.outputSnapshot = outputSnapshot;
  if (failureReason !== undefined) execution.failureReason = failureReason;
  assertEventExecution(execution);
  return execution;
}

function mapProactiveMessageBudgetRow(row: SqlRow): ProactiveMessageBudget {
  const budget: ProactiveMessageBudget = {
    id: requiredString(row.id, "proactive_message_budgets.id"),
    storyWorldId: requiredString(
      row.story_world_id,
      "proactive_message_budgets.story_world_id",
    ),
    characterId: requiredString(row.character_id, "proactive_message_budgets.character_id"),
    windowStartsAt: requiredTimestamp(
      row.window_starts_at,
      "proactive_message_budgets.window_starts_at",
    ),
    windowEndsAt: requiredTimestamp(
      row.window_ends_at,
      "proactive_message_budgets.window_ends_at",
    ),
    limit: requiredNumber(row.limit_count, "proactive_message_budgets.limit_count"),
    consumed: requiredNumber(row.consumed, "proactive_message_budgets.consumed"),
    updatedAt: requiredTimestamp(row.updated_at, "proactive_message_budgets.updated_at"),
  };
  assertProactiveMessageBudget(budget);
  return budget;
}

function mapBehaviorActionRow(row: SqlRow): BehaviorAction {
  const action: BehaviorAction = {
    id: requiredString(row.id, "behavior_actions.id"),
    executionId: requiredString(row.execution_id, "behavior_actions.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "behavior_actions.story_world_id"),
    actorCharacterId: requiredString(
      row.actor_character_id,
      "behavior_actions.actor_character_id",
    ),
    kind: requiredString(row.kind, "behavior_actions.kind") as BehaviorAction["kind"],
    status: requiredString(row.status, "behavior_actions.status") as BehaviorAction["status"],
    priority: requiredNumber(row.priority, "behavior_actions.priority"),
    payload: jsonObject(row.payload, "behavior_actions.payload"),
    createdAt: requiredTimestamp(row.created_at, "behavior_actions.created_at"),
  };
  assertBehaviorAction(action);
  return action;
}

function mapMomentDraftRow(row: SqlRow): MomentDraft {
  const draft: MomentDraft = {
    id: requiredString(row.id, "moment_drafts.id"),
    actionId: requiredString(row.action_id, "moment_drafts.action_id"),
    executionId: requiredString(row.execution_id, "moment_drafts.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "moment_drafts.story_world_id"),
    authorCharacterId: requiredString(
      row.author_character_id,
      "moment_drafts.author_character_id",
    ),
    visibility: requiredString(
      row.visibility,
      "moment_drafts.visibility",
    ) as MomentDraft["visibility"],
    body: requiredString(row.body, "moment_drafts.body"),
    status: requiredString(row.status, "moment_drafts.status") as MomentDraft["status"],
    createdAt: requiredTimestamp(row.created_at, "moment_drafts.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "moment_drafts.updated_at"),
  };
  const imageJobId = optionalString(row.image_job_id, "moment_drafts.image_job_id");
  if (imageJobId !== undefined) draft.imageJobId = imageJobId;
  assertMomentDraft(draft);
  return draft;
}

function mapImageJobRow(row: SqlRow): ImageJob {
  const job: ImageJob = {
    id: requiredString(row.id, "image_jobs.id"),
    kind: requiredString(row.kind, "image_jobs.kind") as ImageJob["kind"],
    actionId: requiredString(row.action_id, "image_jobs.action_id"),
    executionId: requiredString(row.execution_id, "image_jobs.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "image_jobs.story_world_id"),
    ownerCharacterId: requiredString(row.owner_character_id, "image_jobs.owner_character_id"),
    workflowVersion: requiredString(row.workflow_version, "image_jobs.workflow_version"),
    prompt: requiredString(row.prompt, "image_jobs.prompt"),
    attempt: requiredNumber(row.attempt, "image_jobs.attempt"),
    status: requiredString(row.status, "image_jobs.status") as ImageJob["status"],
    createdAt: requiredTimestamp(row.created_at, "image_jobs.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "image_jobs.updated_at"),
  };
  const momentDraftId = optionalString(row.moment_draft_id, "image_jobs.moment_draft_id");
  const negativePrompt = optionalString(row.negative_prompt, "image_jobs.negative_prompt");
  const externalJobId = optionalString(row.external_job_id, "image_jobs.external_job_id");
  const mediaRef = optionalString(row.media_ref, "image_jobs.media_ref");
  const failureReason = optionalString(row.failure_reason, "image_jobs.failure_reason");
  if (momentDraftId !== undefined) job.momentDraftId = momentDraftId;
  if (negativePrompt !== undefined) job.negativePrompt = negativePrompt;
  if (externalJobId !== undefined) job.externalJobId = externalJobId;
  if (mediaRef !== undefined) job.mediaRef = mediaRef;
  if (failureReason !== undefined) job.failureReason = failureReason;
  if (row.seed !== null && row.seed !== undefined) job.seed = requiredNumber(row.seed, "image_jobs.seed");
  assertImageJob(job);
  return job;
}

function mapCharacterVisualIdentityRow(row: SqlRow): CharacterVisualIdentity {
  const identity: CharacterVisualIdentity = {
    id: requiredString(row.id, "character_visual_identities.id"),
    characterId: requiredString(
      row.character_id,
      "character_visual_identities.character_id",
    ),
    storyWorldId: requiredString(
      row.story_world_id,
      "character_visual_identities.story_world_id",
    ),
    positivePrompt: requiredString(
      row.positive_prompt,
      "character_visual_identities.positive_prompt",
    ),
    styleTags: stringArray(row.style_tags, "character_visual_identities.style_tags"),
    referenceImageRefs: stringArray(
      row.reference_image_refs,
      "character_visual_identities.reference_image_refs",
    ),
    revision: requiredNumber(row.revision, "character_visual_identities.revision"),
    updatedAt: requiredTimestamp(row.updated_at, "character_visual_identities.updated_at"),
  };
  const negativePrompt = optionalString(
    row.negative_prompt,
    "character_visual_identities.negative_prompt",
  );
  if (negativePrompt !== undefined) identity.negativePrompt = negativePrompt;
  assertCharacterVisualIdentity(identity);
  return identity;
}

function mapImageWorkflowTemplateRow(row: SqlRow): ImageWorkflowTemplate {
  const template: ImageWorkflowTemplate = {
    id: requiredString(row.id, "image_workflow_templates.id"),
    version: requiredString(row.version, "image_workflow_templates.version"),
    workflow: jsonObject(row.workflow, "image_workflow_templates.workflow"),
    positivePromptPath: stringArray(
      row.positive_prompt_path,
      "image_workflow_templates.positive_prompt_path",
    ),
  };
  const negativePromptPath = optionalStringArray(
    row.negative_prompt_path,
    "image_workflow_templates.negative_prompt_path",
  );
  const seedPath = optionalStringArray(row.seed_path, "image_workflow_templates.seed_path");
  if (negativePromptPath !== undefined) template.negativePromptPath = negativePromptPath;
  if (seedPath !== undefined) template.seedPath = seedPath;
  assertImageWorkflowTemplate(template);
  return template;
}

function mapStickerPackRow(row: SqlRow): StickerPack {
  const pack: StickerPack = {
    id: requiredString(row.id, "sticker_packs.id"),
    storyWorldId: requiredString(row.story_world_id, "sticker_packs.story_world_id"),
    name: requiredString(row.name, "sticker_packs.name"),
    createdAt: requiredTimestamp(row.created_at, "sticker_packs.created_at"),
  };
  const sourceRef = optionalString(row.source_ref, "sticker_packs.source_ref");
  if (sourceRef !== undefined) pack.sourceRef = sourceRef;
  assertStickerPack(pack);
  return pack;
}

function mapStickerRow(row: SqlRow): Sticker {
  const sticker: Sticker = {
    id: requiredString(row.id, "stickers.id"),
    packId: requiredString(row.pack_id, "stickers.pack_id"),
    storyWorldId: requiredString(row.story_world_id, "stickers.story_world_id"),
    label: requiredString(row.label, "stickers.label"),
    mediaRef: requiredString(row.media_ref, "stickers.media_ref"),
    tags: stringArray(row.tags, "stickers.tags"),
    createdAt: requiredTimestamp(row.created_at, "stickers.created_at"),
  };
  assertSticker(sticker);
  return sticker;
}

function mapMomentRow(row: SqlRow): Moment {
  const moment: Moment = {
    id: requiredString(row.id, "moments.id"),
    draftId: requiredString(row.draft_id, "moments.draft_id"),
    storyWorldId: requiredString(row.story_world_id, "moments.story_world_id"),
    authorCharacterId: requiredString(row.author_character_id, "moments.author_character_id"),
    visibility: requiredString(row.visibility, "moments.visibility") as Moment["visibility"],
    audienceCharacterIds: stringArray(row.audience_character_ids, "moments.audience_character_ids"),
    body: requiredString(row.body, "moments.body"),
    publishedAt: requiredTimestamp(row.published_at, "moments.published_at"),
    createdAt: requiredTimestamp(row.created_at, "moments.created_at"),
  };
  const imageMediaRef = optionalString(row.image_media_ref, "moments.image_media_ref");
  if (imageMediaRef !== undefined) moment.imageMediaRef = imageMediaRef;
  assertMoment(moment);
  return moment;
}

function mapMomentInteractionRow(row: SqlRow): MomentInteraction {
  const interaction: MomentInteraction = {
    id: requiredString(row.id, "moment_interactions.id"),
    momentId: requiredString(row.moment_id, "moment_interactions.moment_id"),
    storyWorldId: requiredString(row.story_world_id, "moment_interactions.story_world_id"),
    actorCharacterId: requiredString(
      row.actor_character_id,
      "moment_interactions.actor_character_id",
    ),
    kind: requiredString(
      row.kind,
      "moment_interactions.kind",
    ) as MomentInteraction["kind"],
    createdAt: requiredTimestamp(row.created_at, "moment_interactions.created_at"),
    idempotencyKey: requiredString(
      row.idempotency_key,
      "moment_interactions.idempotency_key",
    ),
  };
  const text = optionalString(row.text, "moment_interactions.text");
  if (text !== undefined) interaction.text = text;
  assertMomentInteraction(interaction);
  return interaction;
}

function sameMessagePayload(left: Message, right: Message): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.authorCharacterId === right.authorCharacterId &&
    left.kind === right.kind &&
    left.text === right.text &&
    left.mediaRef === right.mediaRef &&
    left.stickerId === right.stickerId &&
    left.createdAt === right.createdAt &&
    left.idempotencyKey === right.idempotencyKey
  );
}

const STORY_WORLD_SELECT = `
  SELECT id, name, timezone, story_mode, relationship_dynamics_enabled
  FROM story_worlds`;

const CHARACTER_SELECT = `
  SELECT id, display_name, role, story_world_id, timezone,
         birth_date, persona_prompt_ref, visual_prompt_ref
  FROM characters`;

const RELATIONSHIP_EDGE_SELECT = `
  SELECT
    e.id, e.relationship_type, e.affinity, e.trust, e.conflict,
    e.dependency, e.is_public, e.is_bidirectional,
    sw.id AS world_id, sw.name AS world_name, sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    source_character.id AS source_id,
    source_character.display_name AS source_display_name,
    source_character.role AS source_role,
    source_character.story_world_id AS source_story_world_id,
    source_character.timezone AS source_timezone,
    source_character.birth_date AS source_birth_date,
    source_character.persona_prompt_ref AS source_persona_prompt_ref,
    source_character.visual_prompt_ref AS source_visual_prompt_ref,
    target_character.id AS target_id,
    target_character.display_name AS target_display_name,
    target_character.role AS target_role,
    target_character.story_world_id AS target_story_world_id,
    target_character.timezone AS target_timezone,
    target_character.birth_date AS target_birth_date,
    target_character.persona_prompt_ref AS target_persona_prompt_ref,
    target_character.visual_prompt_ref AS target_visual_prompt_ref
  FROM relationship_edges e
  JOIN story_worlds sw ON sw.id = e.story_world_id
  JOIN characters source_character
    ON source_character.id = e.source_character_id
   AND source_character.story_world_id = e.story_world_id
  JOIN characters target_character
    ON target_character.id = e.target_character_id
   AND target_character.story_world_id = e.story_world_id`;

const ACTOR_SESSION_SELECT = `
  SELECT
    s.id, s.started_at, s.ended_at,
    sw.id AS world_id, sw.name AS world_name, sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    user_character.id AS user_id,
    user_character.display_name AS user_display_name,
    user_character.role AS user_role,
    user_character.story_world_id AS user_story_world_id,
    user_character.timezone AS user_timezone,
    user_character.birth_date AS user_birth_date,
    user_character.persona_prompt_ref AS user_persona_prompt_ref,
    user_character.visual_prompt_ref AS user_visual_prompt_ref
  FROM actor_sessions s
  JOIN story_worlds sw ON sw.id = s.story_world_id
  JOIN characters user_character
    ON user_character.id = s.user_character_id
   AND user_character.story_world_id = s.story_world_id`;

const CONVERSATION_SELECT = `
  SELECT
    c.id AS conversation_id,
    c.story_world_id AS conversation_story_world_id,
    c.type AS conversation_type,
    c.title AS conversation_title,
    c.created_at AS conversation_created_at,
    sw.id AS world_id,
    sw.name AS world_name,
    sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    cm.character_id AS member_character_id,
    cm.joined_at AS member_joined_at,
    cm.left_at AS member_left_at,
    member_character.id AS member_id,
    member_character.display_name AS member_display_name,
    member_character.role AS member_role,
    member_character.story_world_id AS member_story_world_id,
    member_character.timezone AS member_timezone,
    member_character.birth_date AS member_birth_date,
    member_character.persona_prompt_ref AS member_persona_prompt_ref,
    member_character.visual_prompt_ref AS member_visual_prompt_ref
  FROM conversations c
  JOIN story_worlds sw ON sw.id = c.story_world_id
  JOIN conversation_members cm ON cm.conversation_id = c.id
  JOIN characters member_character
    ON member_character.id = cm.character_id
   AND member_character.story_world_id = cm.story_world_id`;

const MESSAGE_SELECT = `
  SELECT id, conversation_id, author_character_id, kind, text, media_ref,
         sticker_id, created_at, idempotency_key
  FROM messages`;

const MEMORY_SELECT = `
  SELECT id, story_world_id, kind, visibility, source, content, confidence,
         created_at, occurred_at, subject_character_id, audience_character_ids, source_ref
  FROM memory_items`;

const EVENT_DEFINITION_SELECT = `
  SELECT id, story_world_id, event_key, name, trigger_source, timezone,
         recurrence_kind, run_at, recurrence_month, recurrence_day,
         recurrence_local_time, target_character_ids, priority,
         cooldown_seconds, enabled, created_at
  FROM world_event_definitions`;

const OCCURRENCE_SELECT = `
  SELECT id, definition_id, story_world_id, event_key, scheduled_for,
         timezone, occurrence_key, status, created_at
  FROM scheduled_occurrences`;

const CHARACTER_PLAN_SELECT = `
  SELECT id, story_world_id, character_id, starts_at, ends_at, timezone,
         location, activity, interruptibility, created_at
  FROM character_plans`;

const EVENT_EXECUTION_SELECT = `
  SELECT id, occurrence_id, definition_id, story_world_id, event_key,
         target_character_ids, attempt, rule_version, input_snapshot,
         status, started_at, finished_at, output_snapshot, failure_reason
  FROM event_executions`;

const PROACTIVE_MESSAGE_BUDGET_SELECT = `
  SELECT id, story_world_id, character_id, window_starts_at, window_ends_at,
         limit_count, consumed, updated_at
  FROM proactive_message_budgets`;

const BEHAVIOR_ACTION_SELECT = `
  SELECT id, execution_id, story_world_id, actor_character_id, kind,
         status, priority, payload, created_at
  FROM behavior_actions`;

const MOMENT_DRAFT_SELECT = `
  SELECT id, action_id, execution_id, story_world_id, author_character_id,
         visibility, body, status, image_job_id, created_at, updated_at
  FROM moment_drafts`;

const IMAGE_JOB_SELECT = `
  SELECT id, kind, action_id, execution_id, story_world_id, owner_character_id,
         moment_draft_id, workflow_version, prompt, attempt, negative_prompt, seed,
         status, external_job_id, media_ref, failure_reason, created_at, updated_at
  FROM image_jobs`;

const CHARACTER_VISUAL_IDENTITY_SELECT = `
  SELECT id, character_id, story_world_id, positive_prompt, negative_prompt,
         style_tags, reference_image_refs, revision, updated_at
  FROM character_visual_identities`;

const IMAGE_WORKFLOW_TEMPLATE_SELECT = `
  SELECT id, version, workflow, positive_prompt_path, negative_prompt_path, seed_path
  FROM image_workflow_templates`;

const STICKER_PACK_SELECT = `
  SELECT id, story_world_id, name, source_ref, created_at
  FROM sticker_packs`;

const STICKER_SELECT = `
  SELECT id, pack_id, story_world_id, label, media_ref, tags, created_at
  FROM stickers`;

const MOMENT_SELECT = `
  SELECT id, draft_id, story_world_id, author_character_id, visibility,
         audience_character_ids, body, image_media_ref, published_at, created_at
  FROM moments`;

const MOMENT_INTERACTION_SELECT = `
  SELECT id, moment_id, story_world_id, actor_character_id, kind, text,
         created_at, idempotency_key
  FROM moment_interactions`;

export class SqlRepositories implements DomainRepositories {
  public readonly storyWorlds: StoryWorldRepository;
  public readonly characters: CharacterRepository;
  public readonly relationshipEdges: RelationshipEdgeRepository;
  public readonly actorSessions: ActorSessionRepository;
  public readonly conversations: ConversationRepository;
  public readonly messages: MessageRepository;
  public readonly memories: MemoryRepository;
  public readonly worldEventDefinitions: WorldEventDefinitionRepository;
  public readonly scheduledOccurrences: ScheduledOccurrenceRepository;
  public readonly characterPlans: CharacterPlanRepository;
  public readonly eventExecutions: EventExecutionRepository;
  public readonly proactiveMessageBudgets: ProactiveMessageBudgetRepository;
  public readonly behaviorActions: BehaviorActionRepository;
  public readonly momentDrafts: MomentDraftRepository;
  public readonly imageJobs: ImageJobRepository;
  public readonly characterVisualIdentities: CharacterVisualIdentityRepository;
  public readonly imageWorkflowTemplates: ImageWorkflowTemplateRepository;
  public readonly stickerPacks: StickerPackRepository;
  public readonly stickers: StickerRepository;
  public readonly moments: MomentRepository;
  public readonly momentInteractions: MomentInteractionRepository;
  public readonly outboxEvents: SqlOutboxEventRepository;

  private readonly client: SqlClient;

  public constructor(client: SqlClient) {
    this.client = client;
    this.outboxEvents = new SqlOutboxEventRepository(client);

    this.storyWorlds = {
      list: async () => {
        const result = await this.client.query(`${STORY_WORLD_SELECT} ORDER BY id`);
        return result.rows.map(mapStoryWorldRow);
      },
      getById: async (id) => {
        const result = await this.client.query(`${STORY_WORLD_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStoryWorldRow(row) : undefined;
      },
    };

    this.characters = {
      listByStoryWorld: async (storyWorldId) => {
        const result = storyWorldId === undefined
          ? await this.client.query(`${CHARACTER_SELECT} ORDER BY id`)
          : await this.client.query(
            `${CHARACTER_SELECT} WHERE story_world_id = $1 ORDER BY id`,
            [storyWorldId],
          );
        return result.rows.map((row) => mapCharacterRow(row));
      },
      getById: async (id) => {
        const result = await this.client.query(`${CHARACTER_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapCharacterRow(row) : undefined;
      },
    };

    this.relationshipEdges = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await this.client.query(
          `${RELATIONSHIP_EDGE_SELECT} WHERE e.story_world_id = $1 ORDER BY e.id`,
          [storyWorldId],
        );
        return result.rows.map(mapRelationshipEdgeRow);
      },
      getById: async (id) => {
        const result = await this.client.query(
          `${RELATIONSHIP_EDGE_SELECT} WHERE e.id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapRelationshipEdgeRow(row) : undefined;
      },
      save: async (edge) => {
        await this.client.query(
          `INSERT INTO relationship_edges (
             id, source_character_id, target_character_id, story_world_id,
             relationship_type, affinity, trust, conflict, dependency,
             is_public, is_bidirectional
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             source_character_id = EXCLUDED.source_character_id,
             target_character_id = EXCLUDED.target_character_id,
             story_world_id = EXCLUDED.story_world_id,
             relationship_type = EXCLUDED.relationship_type,
             affinity = EXCLUDED.affinity,
             trust = EXCLUDED.trust,
             conflict = EXCLUDED.conflict,
             dependency = EXCLUDED.dependency,
             is_public = EXCLUDED.is_public,
             is_bidirectional = EXCLUDED.is_bidirectional,
             updated_at = now()`,
          [
            edge.id,
            edge.sourceCharacterId,
            edge.targetCharacterId,
            edge.storyWorldId,
            edge.relationshipType,
            edge.initialState.affinity,
            edge.initialState.trust,
            edge.initialState.conflict,
            edge.initialState.dependency,
            edge.isPublic,
            edge.isBidirectional,
          ],
        );
      },
    };

    this.actorSessions = {
      getById: async (id) => {
        const result = await this.client.query(`${ACTOR_SESSION_SELECT} WHERE s.id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapActorSessionRow(row) : undefined;
      },
      save: async (session) => {
        await this.client.query(
          `INSERT INTO actor_sessions (id, story_world_id, user_character_id, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             user_character_id = EXCLUDED.user_character_id,
             started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at`,
          [
            session.id,
            session.storyWorldId,
            session.userCharacterId,
            session.startedAt,
            session.endedAt ?? null,
          ],
        );
      },
    };

    this.conversations = {
      listByCharacter: async (characterId) => {
        const result = await this.client.query(
          `${CONVERSATION_SELECT}
           JOIN conversation_members selected_member
             ON selected_member.conversation_id = c.id
            AND selected_member.character_id = $1
            AND selected_member.left_at IS NULL
           ORDER BY c.created_at, c.id, cm.character_id`,
          [characterId],
        );
        return mapConversationRows(result.rows);
      },
      getById: async (id) => {
        const result = await this.client.query(
          `${CONVERSATION_SELECT} WHERE c.id = $1 ORDER BY cm.character_id`,
          [id],
        );
        return mapConversationRows(result.rows)[0];
      },
      save: async (conversation) => {
        const members = conversation.members;
        if (members.length === 0) {
          throw new TypeError("Conversation must have at least one member");
        }
        const values: unknown[] = [
          conversation.conversation.id,
          conversation.conversation.storyWorldId,
          conversation.conversation.type,
          conversation.conversation.title ?? null,
          conversation.conversation.createdAt,
        ];
        const tuples = members.map((member, index) => {
          const offset = 6 + index * 4;
          values.push(
            member.characterId,
            conversation.conversation.storyWorldId,
            member.joinedAt,
            member.leftAt ?? null,
          );
          return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
        });
        await this.client.query(
          `WITH upserted AS (
             INSERT INTO conversations (id, story_world_id, type, title, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               story_world_id = EXCLUDED.story_world_id,
               type = EXCLUDED.type,
               title = EXCLUDED.title,
               created_at = EXCLUDED.created_at
             RETURNING id
           )
           INSERT INTO conversation_members (
             conversation_id, character_id, story_world_id, joined_at, left_at
           )
           SELECT upserted.id, member_values.character_id, member_values.story_world_id,
                  member_values.joined_at, member_values.left_at
           FROM upserted
           CROSS JOIN (VALUES ${tuples.join(", ")}) AS member_values(
             character_id, story_world_id, joined_at, left_at
           )
           ON CONFLICT (conversation_id, character_id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             joined_at = EXCLUDED.joined_at,
             left_at = EXCLUDED.left_at`,
          values,
        );
      },
    };

    this.messages = {
      listByConversation: async (conversationId) => {
        const result = await this.client.query(
          `${MESSAGE_SELECT}
           WHERE conversation_id = $1
           ORDER BY created_at, id`,
          [conversationId],
        );
        return result.rows.map(mapMessageRow);
      },
      save: async (message): Promise<MessageWriteResult> => {
        const values = [
          message.id,
          message.conversationId,
          message.authorCharacterId ?? null,
          message.kind,
          message.text ?? null,
          message.mediaRef ?? null,
          message.stickerId ?? null,
          message.createdAt,
          message.idempotencyKey,
        ];
        const inserted = await this.client.query(
          `INSERT INTO messages (
             id, conversation_id, author_character_id, kind, text, media_ref,
             sticker_id, created_at, idempotency_key
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (conversation_id, idempotency_key) DO NOTHING
           RETURNING id, conversation_id, author_character_id, kind, text,
                     media_ref, sticker_id, created_at, idempotency_key`,
          values,
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { message: mapMessageRow(insertedRow), inserted: true };
        }

        const existingResult = await this.client.query(
          `${MESSAGE_SELECT} WHERE conversation_id = $1 AND idempotency_key = $2`,
          [message.conversationId, message.idempotencyKey],
        );
        const existingRow = existingResult.rows[0];
        if (!existingRow) {
          throw new TypeError("Message idempotency lookup returned no row");
        }
        const existing = mapMessageRow(existingRow);
        if (!sameMessagePayload(existing, message)) {
          throw new TypeError(`Message idempotency key conflict: ${message.idempotencyKey}`);
        }
        return { message: existing, inserted: false };
      },
    };

    this.memories = {
      listForCharacter: async (storyWorldId, readerCharacterId) => {
        const result = await this.client.query(
          `${MEMORY_SELECT}
           WHERE story_world_id = $1
             AND (
               visibility = 'PUBLIC'
               OR (visibility = 'PRIVATE' AND subject_character_id = $2)
               OR (visibility IN ('RELATION', 'GROUP') AND $2 = ANY(audience_character_ids))
             )
           ORDER BY created_at DESC, id`,
          [storyWorldId, readerCharacterId],
        );
        return result.rows.map(mapMemoryRow);
      },
      search: async (query: MemorySearchQuery) => {
        const limit = query.limit ?? 20;
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("memory search limit must be a positive integer");
        }
        if (query.queryText.trim().length === 0) {
          throw new TypeError("memory search queryText must be non-empty");
        }
        const result = await this.client.query(
          `SELECT id, story_world_id, kind, visibility, source, content, confidence,
                  created_at, occurred_at, subject_character_id, audience_character_ids,
                  source_ref,
                  ts_rank_cd(search_vector, websearch_to_tsquery('simple', $3))
                    + confidence * 0.25 AS score
           FROM memory_items
           WHERE story_world_id = $1
             AND search_vector @@ websearch_to_tsquery('simple', $3)
             AND (
               visibility = 'PUBLIC'
               OR (visibility = 'PRIVATE' AND subject_character_id = $2)
               OR (visibility IN ('RELATION', 'GROUP') AND $2 = ANY(audience_character_ids))
             )
           ORDER BY score DESC, created_at DESC, id
           LIMIT $4`,
          [query.storyWorldId, query.readerCharacterId, query.queryText, limit],
        );
        return result.rows.map((row) => ({
          memory: mapMemoryRow(row),
          score: requiredNumber(row.score, "memory_items.score"),
        })) as readonly MemorySearchResult[];
      },
      save: async (memory) => {
        assertMemoryItem(memory);
        await this.client.query(
          `INSERT INTO memory_items (
             id, story_world_id, kind, visibility, source, content, confidence,
             created_at, occurred_at, subject_character_id, audience_character_ids, source_ref
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             kind = EXCLUDED.kind,
             visibility = EXCLUDED.visibility,
             source = EXCLUDED.source,
             content = EXCLUDED.content,
             confidence = EXCLUDED.confidence,
             created_at = EXCLUDED.created_at,
             occurred_at = EXCLUDED.occurred_at,
             subject_character_id = EXCLUDED.subject_character_id,
             audience_character_ids = EXCLUDED.audience_character_ids,
             source_ref = EXCLUDED.source_ref`,
          [
            memory.id,
            memory.storyWorldId,
            memory.kind,
            memory.visibility,
            memory.source,
            memory.content,
            memory.confidence,
            memory.createdAt,
            memory.occurredAt ?? null,
            memory.subjectCharacterId ?? null,
            [...memory.audienceCharacterIds],
            memory.sourceRef ?? null,
          ],
        );
      },
    };

    this.worldEventDefinitions = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await this.client.query(
          `${EVENT_DEFINITION_SELECT}
           WHERE story_world_id = $1
           ORDER BY id`,
          [storyWorldId],
        );
        return result.rows.map(mapWorldEventDefinitionRow);
      },
      getById: async (id) => {
        const result = await this.client.query(
          `${EVENT_DEFINITION_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapWorldEventDefinitionRow(row) : undefined;
      },
      save: async (definition) => {
        assertWorldEventDefinition(definition);
        const runAt = definition.recurrence.kind === "ONCE"
          ? definition.recurrence.runAt
          : null;
        const month = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.month
          : null;
        const day = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.day
          : null;
        const localTime = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.localTime
          : null;
        await this.client.query(
          `INSERT INTO world_event_definitions (
             id, story_world_id, event_key, name, trigger_source, timezone,
             recurrence_kind, run_at, recurrence_month, recurrence_day,
             recurrence_local_time, target_character_ids, priority,
             cooldown_seconds, enabled, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             event_key = EXCLUDED.event_key,
             name = EXCLUDED.name,
             trigger_source = EXCLUDED.trigger_source,
             timezone = EXCLUDED.timezone,
             recurrence_kind = EXCLUDED.recurrence_kind,
             run_at = EXCLUDED.run_at,
             recurrence_month = EXCLUDED.recurrence_month,
             recurrence_day = EXCLUDED.recurrence_day,
             recurrence_local_time = EXCLUDED.recurrence_local_time,
             target_character_ids = EXCLUDED.target_character_ids,
             priority = EXCLUDED.priority,
             cooldown_seconds = EXCLUDED.cooldown_seconds,
             enabled = EXCLUDED.enabled,
             created_at = EXCLUDED.created_at`,
          [
            definition.id,
            definition.storyWorldId,
            definition.eventKey,
            definition.name,
            definition.triggerSource,
            definition.timezone,
            definition.recurrence.kind,
            runAt,
            month,
            day,
            localTime,
            [...definition.targetCharacterIds],
            definition.priority,
            definition.cooldownSeconds ?? null,
            definition.enabled,
            definition.createdAt,
          ],
        );
      },
    };

    this.scheduledOccurrences = {
      getById: async (id) => {
        const result = await this.client.query(
          `${OCCURRENCE_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapScheduledOccurrenceRow(row) : undefined;
      },
      getByOccurrenceKey: async (storyWorldId, occurrenceKey) => {
        const result = await this.client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1 AND occurrence_key = $2`,
          [storyWorldId, occurrenceKey],
        );
        const row = result.rows[0];
        return row ? mapScheduledOccurrenceRow(row) : undefined;
      },
      listPending: async (storyWorldId, scheduledBefore, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        if (Number.isNaN(Date.parse(scheduledBefore))) {
          throw new TypeError("scheduledBefore must be a valid ISO timestamp");
        }
        const result = await this.client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1
             AND status = 'PENDING'
             AND scheduled_for <= $2
           ORDER BY scheduled_for, id
           LIMIT $3`,
          [storyWorldId, scheduledBefore, limit],
        );
        return result.rows.map(mapScheduledOccurrenceRow);
      },
      listByWindow: async (storyWorldId, startsAt, endsAt, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        const startsAtMs = Date.parse(startsAt);
        const endsAtMs = Date.parse(endsAt);
        if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
          throw new TypeError("scheduled occurrence window must use valid ISO timestamps");
        }
        if (startsAtMs >= endsAtMs) {
          throw new RangeError("scheduled occurrence startsAt must be before endsAt");
        }
        const result = await this.client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1
             AND scheduled_for >= $2
             AND scheduled_for < $3
           ORDER BY scheduled_for, id
           LIMIT $4`,
          [storyWorldId, startsAt, endsAt, limit],
        );
        return result.rows.map(mapScheduledOccurrenceRow);
      },
      save: async (occurrence): Promise<ScheduledOccurrenceWriteResult> => {
        assertScheduledOccurrence(occurrence);
        const inserted = await this.client.query(
          `INSERT INTO scheduled_occurrences (
             id, definition_id, story_world_id, event_key, scheduled_for,
             timezone, occurrence_key, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (story_world_id, occurrence_key) DO NOTHING
           RETURNING id, definition_id, story_world_id, event_key, scheduled_for,
                     timezone, occurrence_key, status, created_at`,
          [
            occurrence.id,
            occurrence.definitionId,
            occurrence.storyWorldId,
            occurrence.eventKey,
            occurrence.scheduledFor,
            occurrence.timezone,
            occurrence.occurrenceKey,
            occurrence.status,
            occurrence.createdAt,
          ],
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { occurrence: mapScheduledOccurrenceRow(insertedRow), inserted: true };
        }
        const existing = await this.client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1 AND occurrence_key = $2`,
          [occurrence.storyWorldId, occurrence.occurrenceKey],
        );
        const existingRow = existing.rows[0];
        if (!existingRow) {
          throw new TypeError("Scheduled occurrence id or key conflict could not be resolved");
        }
        return { occurrence: mapScheduledOccurrenceRow(existingRow), inserted: false };
      },
      update: async (occurrence) => {
        assertScheduledOccurrence(occurrence);
        const result = await this.client.query(
          `UPDATE scheduled_occurrences
           SET status = $1
           WHERE id = $2
           RETURNING id, definition_id, story_world_id, event_key, scheduled_for,
                     timezone, occurrence_key, status, created_at`,
          [occurrence.status, occurrence.id],
        );
        const row = result.rows[0];
        if (!row) throw new TypeError(`Unknown scheduled occurrence: ${occurrence.id}`);
        const updated = mapScheduledOccurrenceRow(row);
        if (
          updated.definitionId !== occurrence.definitionId ||
          updated.storyWorldId !== occurrence.storyWorldId ||
          updated.occurrenceKey !== occurrence.occurrenceKey
        ) {
          throw new TypeError(`Scheduled occurrence identity cannot change: ${occurrence.id}`);
        }
      },
    };

    this.characterPlans = {
      listActive: async (characterId, at) => {
        const result = await this.client.query(
          `${CHARACTER_PLAN_SELECT}
           WHERE character_id = $1
             AND starts_at <= $2
             AND ends_at > $2
           ORDER BY starts_at, id`,
          [characterId, at],
        );
        return result.rows.map(mapCharacterPlanRow);
      },
      save: async (plan) => {
        assertCharacterPlan(plan);
        await this.client.query(
          `INSERT INTO character_plans (
             id, story_world_id, character_id, starts_at, ends_at, timezone,
             location, activity, interruptibility, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             character_id = EXCLUDED.character_id,
             starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at,
             timezone = EXCLUDED.timezone,
             location = EXCLUDED.location,
             activity = EXCLUDED.activity,
             interruptibility = EXCLUDED.interruptibility,
             created_at = EXCLUDED.created_at`,
          [
            plan.id,
            plan.storyWorldId,
            plan.characterId,
            plan.startsAt,
            plan.endsAt,
            plan.timezone,
            plan.location ?? null,
            plan.activity,
            plan.interruptibility,
            plan.createdAt,
          ],
        );
      },
    };

    this.proactiveMessageBudgets = {
      getActive: async (storyWorldId, characterId, at) => {
        const result = await this.client.query(
          `${PROACTIVE_MESSAGE_BUDGET_SELECT}
           WHERE story_world_id = $1
             AND character_id = $2
             AND window_starts_at <= $3
             AND window_ends_at > $3
           ORDER BY window_starts_at DESC, id
           LIMIT 1`,
          [storyWorldId, characterId, at],
        );
        const row = result.rows[0];
        return row ? mapProactiveMessageBudgetRow(row) : undefined;
      },
      save: async (budget) => {
        assertProactiveMessageBudget(budget);
        await this.client.query(
          `INSERT INTO proactive_message_budgets (
             id, story_world_id, character_id, window_starts_at, window_ends_at,
             limit_count, consumed, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             character_id = EXCLUDED.character_id,
             window_starts_at = EXCLUDED.window_starts_at,
             window_ends_at = EXCLUDED.window_ends_at,
             limit_count = EXCLUDED.limit_count,
             consumed = EXCLUDED.consumed,
             updated_at = EXCLUDED.updated_at`,
          [
            budget.id,
            budget.storyWorldId,
            budget.characterId,
            budget.windowStartsAt,
            budget.windowEndsAt,
            budget.limit,
            budget.consumed,
            budget.updatedAt,
          ],
        );
      },
    };

    this.eventExecutions = {
      getById: async (id) => {
        const result = await this.client.query(
          `${EVENT_EXECUTION_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapEventExecutionRow(row) : undefined;
      },
      getLatestByOccurrence: async (occurrenceId) => {
        const result = await this.client.query(
          `${EVENT_EXECUTION_SELECT}
           WHERE occurrence_id = $1
           ORDER BY attempt DESC, id DESC
           LIMIT 1`,
          [occurrenceId],
        );
        const row = result.rows[0];
        return row ? mapEventExecutionRow(row) : undefined;
      },
      save: async (execution) => {
        assertEventExecution(execution);
        await this.client.query(
          `INSERT INTO event_executions (
             id, occurrence_id, definition_id, story_world_id, event_key,
             target_character_ids, attempt, rule_version, input_snapshot,
             status, started_at, finished_at, output_snapshot, failure_reason
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             occurrence_id = EXCLUDED.occurrence_id,
             definition_id = EXCLUDED.definition_id,
             story_world_id = EXCLUDED.story_world_id,
             event_key = EXCLUDED.event_key,
             target_character_ids = EXCLUDED.target_character_ids,
             attempt = EXCLUDED.attempt,
             rule_version = EXCLUDED.rule_version,
             input_snapshot = EXCLUDED.input_snapshot,
             status = EXCLUDED.status,
             started_at = EXCLUDED.started_at,
             finished_at = EXCLUDED.finished_at,
             output_snapshot = EXCLUDED.output_snapshot,
             failure_reason = EXCLUDED.failure_reason`,
          [
            execution.id,
            execution.occurrenceId,
            execution.definitionId,
            execution.storyWorldId,
            execution.eventKey,
            [...execution.targetCharacterIds],
            execution.attempt,
            execution.ruleVersion,
            execution.inputSnapshot,
            execution.status,
            execution.startedAt,
            execution.finishedAt ?? null,
            execution.outputSnapshot ?? null,
            execution.failureReason ?? null,
          ],
        );
      },
    };

    this.behaviorActions = {
      getById: async (id) => {
        const result = await this.client.query(`${BEHAVIOR_ACTION_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapBehaviorActionRow(row) : undefined;
      },
      listByExecution: async (executionId) => {
        const result = await this.client.query(
          `${BEHAVIOR_ACTION_SELECT}
           WHERE execution_id = $1
           ORDER BY priority, id`,
          [executionId],
        );
        return result.rows.map(mapBehaviorActionRow);
      },
      save: async (action) => {
        assertBehaviorAction(action);
        await this.client.query(
          `INSERT INTO behavior_actions (
             id, execution_id, story_world_id, actor_character_id, kind,
             status, priority, payload, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             actor_character_id = EXCLUDED.actor_character_id,
             kind = EXCLUDED.kind,
             status = EXCLUDED.status,
             priority = EXCLUDED.priority,
             payload = EXCLUDED.payload,
             created_at = EXCLUDED.created_at`,
          [
            action.id,
            action.executionId,
            action.storyWorldId,
            action.actorCharacterId,
            action.kind,
            action.status,
            action.priority,
            action.payload,
            action.createdAt,
          ],
        );
      },
    };

    this.momentDrafts = {
      getById: async (id) => {
        const result = await this.client.query(`${MOMENT_DRAFT_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMomentDraftRow(row) : undefined;
      },
      getByActionId: async (actionId) => {
        const result = await this.client.query(
          `${MOMENT_DRAFT_SELECT} WHERE action_id = $1`,
          [actionId],
        );
        const row = result.rows[0];
        return row ? mapMomentDraftRow(row) : undefined;
      },
      save: async (draft) => {
        assertMomentDraft(draft);
        await this.client.query(
          `INSERT INTO moment_drafts (
             id, action_id, execution_id, story_world_id, author_character_id,
             visibility, body, status, image_job_id, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             action_id = EXCLUDED.action_id,
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             author_character_id = EXCLUDED.author_character_id,
             visibility = EXCLUDED.visibility,
             body = EXCLUDED.body,
             status = EXCLUDED.status,
             image_job_id = EXCLUDED.image_job_id,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
          [
            draft.id,
            draft.actionId,
            draft.executionId,
            draft.storyWorldId,
            draft.authorCharacterId,
            draft.visibility,
            draft.body,
            draft.status,
            draft.imageJobId ?? null,
            draft.createdAt,
            draft.updatedAt,
          ],
        );
      },
    };

    this.imageJobs = {
      getById: async (id) => {
        const result = await this.client.query(`${IMAGE_JOB_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapImageJobRow(row) : undefined;
      },
      getByActionId: async (actionId) => {
        const result = await this.client.query(
          `${IMAGE_JOB_SELECT} WHERE action_id = $1`,
          [actionId],
        );
        const row = result.rows[0];
        return row ? mapImageJobRow(row) : undefined;
      },
      save: async (job) => {
        assertImageJob(job);
        await this.client.query(
          `INSERT INTO image_jobs (
             id, kind, action_id, execution_id, story_world_id, owner_character_id,
             moment_draft_id, workflow_version, prompt, attempt, negative_prompt, seed,
             status, external_job_id, media_ref, failure_reason, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (id) DO UPDATE SET
             kind = EXCLUDED.kind,
             action_id = EXCLUDED.action_id,
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             owner_character_id = EXCLUDED.owner_character_id,
             moment_draft_id = EXCLUDED.moment_draft_id,
             workflow_version = EXCLUDED.workflow_version,
             prompt = EXCLUDED.prompt,
             attempt = EXCLUDED.attempt,
             negative_prompt = EXCLUDED.negative_prompt,
             seed = EXCLUDED.seed,
             status = EXCLUDED.status,
             external_job_id = EXCLUDED.external_job_id,
             media_ref = EXCLUDED.media_ref,
             failure_reason = EXCLUDED.failure_reason,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
          [
            job.id,
            job.kind,
            job.actionId,
            job.executionId,
            job.storyWorldId,
            job.ownerCharacterId,
            job.momentDraftId ?? null,
            job.workflowVersion,
            job.prompt,
            job.attempt,
            job.negativePrompt ?? null,
            job.seed ?? null,
            job.status,
            job.externalJobId ?? null,
            job.mediaRef ?? null,
            job.failureReason ?? null,
            job.createdAt,
            job.updatedAt,
          ],
        );
      },
    };

    this.characterVisualIdentities = {
      getById: async (id) => {
        const result = await this.client.query(
          `${CHARACTER_VISUAL_IDENTITY_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapCharacterVisualIdentityRow(row) : undefined;
      },
      getByCharacterId: async (characterId) => {
        const result = await this.client.query(
          `${CHARACTER_VISUAL_IDENTITY_SELECT} WHERE character_id = $1`,
          [characterId],
        );
        const row = result.rows[0];
        return row ? mapCharacterVisualIdentityRow(row) : undefined;
      },
      save: async (identity) => {
        assertCharacterVisualIdentity(identity);
        await this.client.query(
          `INSERT INTO character_visual_identities (
             id, character_id, story_world_id, positive_prompt, negative_prompt,
             style_tags, reference_image_refs, revision, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             character_id = EXCLUDED.character_id,
             story_world_id = EXCLUDED.story_world_id,
             positive_prompt = EXCLUDED.positive_prompt,
             negative_prompt = EXCLUDED.negative_prompt,
             style_tags = EXCLUDED.style_tags,
             reference_image_refs = EXCLUDED.reference_image_refs,
             revision = EXCLUDED.revision,
             updated_at = EXCLUDED.updated_at`,
          [
            identity.id,
            identity.characterId,
            identity.storyWorldId,
            identity.positivePrompt,
            identity.negativePrompt ?? null,
            [...identity.styleTags],
            [...identity.referenceImageRefs],
            identity.revision,
            identity.updatedAt,
          ],
        );
      },
    };

    this.imageWorkflowTemplates = {
      getById: async (id, version) => {
        const result = await this.client.query(
          `${IMAGE_WORKFLOW_TEMPLATE_SELECT} WHERE id = $1 AND version = $2`,
          [id, version],
        );
        const row = result.rows[0];
        return row ? mapImageWorkflowTemplateRow(row) : undefined;
      },
      list: async () => {
        const result = await this.client.query(
          `${IMAGE_WORKFLOW_TEMPLATE_SELECT} ORDER BY id, version`,
        );
        return result.rows.map(mapImageWorkflowTemplateRow);
      },
      save: async (template) => {
        assertImageWorkflowTemplate(template);
        await this.client.query(
          `INSERT INTO image_workflow_templates (
             id, version, workflow, positive_prompt_path, negative_prompt_path, seed_path
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id, version) DO UPDATE SET
             workflow = EXCLUDED.workflow,
             positive_prompt_path = EXCLUDED.positive_prompt_path,
             negative_prompt_path = EXCLUDED.negative_prompt_path,
             seed_path = EXCLUDED.seed_path`,
          [
            template.id,
            template.version,
            JSON.stringify(template.workflow),
            [...template.positivePromptPath],
            template.negativePromptPath === undefined ? null : [...template.negativePromptPath],
            template.seedPath === undefined ? null : [...template.seedPath],
          ],
        );
      },
    };

    this.stickerPacks = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await this.client.query(
          `${STICKER_PACK_SELECT} WHERE story_world_id = $1 ORDER BY id`,
          [storyWorldId],
        );
        return result.rows.map(mapStickerPackRow);
      },
      getById: async (id) => {
        const result = await this.client.query(`${STICKER_PACK_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStickerPackRow(row) : undefined;
      },
      save: async (pack) => {
        assertStickerPack(pack);
        await this.client.query(
          `INSERT INTO sticker_packs (id, story_world_id, name, source_ref, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             name = EXCLUDED.name,
             source_ref = EXCLUDED.source_ref,
             created_at = EXCLUDED.created_at`,
          [pack.id, pack.storyWorldId, pack.name, pack.sourceRef ?? null, pack.createdAt],
        );
      },
    };

    this.stickers = {
      listByPack: async (packId) => {
        const result = await this.client.query(
          `${STICKER_SELECT} WHERE pack_id = $1 ORDER BY id`,
          [packId],
        );
        return result.rows.map(mapStickerRow);
      },
      getById: async (id) => {
        const result = await this.client.query(`${STICKER_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStickerRow(row) : undefined;
      },
      save: async (sticker) => {
        assertSticker(sticker);
        await this.client.query(
          `INSERT INTO stickers (
             id, pack_id, story_world_id, label, media_ref, tags, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             pack_id = EXCLUDED.pack_id,
             story_world_id = EXCLUDED.story_world_id,
             label = EXCLUDED.label,
             media_ref = EXCLUDED.media_ref,
             tags = EXCLUDED.tags,
             created_at = EXCLUDED.created_at`,
          [
            sticker.id,
            sticker.packId,
            sticker.storyWorldId,
            sticker.label,
            sticker.mediaRef,
            [...sticker.tags],
            sticker.createdAt,
          ],
        );
      },
    };

    this.moments = {
      getById: async (id) => {
        const result = await this.client.query(`${MOMENT_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMomentRow(row) : undefined;
      },
      listFeed: async (storyWorldId, readerCharacterId, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("moment feed limit must be a positive integer");
        }
        const result = await this.client.query(
          `${MOMENT_SELECT}
           WHERE story_world_id = $1
             AND (
               visibility = 'PUBLIC'
               OR $2 = ANY(audience_character_ids)
             )
           ORDER BY published_at DESC, id
           LIMIT $3`,
          [storyWorldId, readerCharacterId, limit],
        );
        return result.rows.map(mapMomentRow);
      },
      save: async (moment) => {
        assertMoment(moment);
        await this.client.query(
          `INSERT INTO moments (
             id, draft_id, story_world_id, author_character_id, visibility,
             audience_character_ids, body, image_media_ref, published_at, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             draft_id = EXCLUDED.draft_id,
             story_world_id = EXCLUDED.story_world_id,
             author_character_id = EXCLUDED.author_character_id,
             visibility = EXCLUDED.visibility,
             audience_character_ids = EXCLUDED.audience_character_ids,
             body = EXCLUDED.body,
             image_media_ref = EXCLUDED.image_media_ref,
             published_at = EXCLUDED.published_at,
             created_at = EXCLUDED.created_at`,
          [
            moment.id,
            moment.draftId,
            moment.storyWorldId,
            moment.authorCharacterId,
            moment.visibility,
            [...moment.audienceCharacterIds],
            moment.body,
            moment.imageMediaRef ?? null,
            moment.publishedAt,
            moment.createdAt,
          ],
        );
      },
    };

    this.momentInteractions = {
      listByMoment: async (momentId) => {
        const result = await this.client.query(
          `${MOMENT_INTERACTION_SELECT}
           WHERE moment_id = $1
           ORDER BY created_at, id`,
          [momentId],
        );
        return result.rows.map(mapMomentInteractionRow);
      },
      save: async (interaction): Promise<MomentInteractionWriteResult> => {
        assertMomentInteraction(interaction);
        const inserted = await this.client.query(
          `INSERT INTO moment_interactions (
             id, moment_id, story_world_id, actor_character_id, kind, text,
             created_at, idempotency_key
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (moment_id, idempotency_key) DO NOTHING
           RETURNING id, moment_id, story_world_id, actor_character_id, kind,
                     text, created_at, idempotency_key`,
          [
            interaction.id,
            interaction.momentId,
            interaction.storyWorldId,
            interaction.actorCharacterId,
            interaction.kind,
            interaction.text ?? null,
            interaction.createdAt,
            interaction.idempotencyKey,
          ],
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { interaction: mapMomentInteractionRow(insertedRow), inserted: true };
        }
        const existing = await this.client.query(
          `${MOMENT_INTERACTION_SELECT}
           WHERE moment_id = $1 AND idempotency_key = $2`,
          [interaction.momentId, interaction.idempotencyKey],
        );
        const existingRow = existing.rows[0];
        if (!existingRow) throw new TypeError("Moment interaction idempotency lookup returned no row");
        const stored = mapMomentInteractionRow(existingRow);
        if (
          stored.kind !== interaction.kind ||
          stored.actorCharacterId !== interaction.actorCharacterId ||
          stored.text !== interaction.text
        ) {
          throw new TypeError(
            `Moment interaction idempotency key conflict: ${interaction.idempotencyKey}`,
          );
        }
        return { interaction: stored, inserted: false };
      },
    };
  }

  public async transaction<T>(operation: (repositories: SqlRepositories) => Promise<T>): Promise<T> {
    const database = this.client as SqlClient & Partial<MigrationDatabase>;
    if (database.transaction === undefined) {
      throw new Error("SQL client does not support transactions");
    }
    return database.transaction((client) => operation(new SqlRepositories(client)));
  }
}

export function createSqlRepositories(client: SqlClient): SqlRepositories {
  return new SqlRepositories(client);
}
