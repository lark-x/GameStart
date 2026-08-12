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

export {
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
  createSqlRepositories,
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
  type SqlClient,
  type SqlQueryResult,
  type SqlRow,
};

export class RecordingSqlClient implements SqlClient {
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

export const world = createStoryWorld({
  id: "world-sql",
  name: "SQL Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});

export const user = createCharacter({
  id: "user-sql",
  displayName: "SQL User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
  birthDate: "2000-01-01",
});

export const ai = createCharacter({
  id: "ai-sql",
  displayName: "SQL AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});

export const edge = createRelationshipEdge({
  id: "edge-sql",
  source: user,
  target: ai,
  storyWorld: world,
  relationshipType: "friend",
  initialState: { affinity: 10, trust: 20, conflict: 0, dependency: -5 },
  isPublic: true,
  isBidirectional: false,
});

export const session = createActorSession({
  id: "session-sql",
  storyWorld: world,
  userCharacter: user,
  startedAt: "2026-08-05T11:00:00.000Z",
});

export function worldRow(value: StoryWorld): SqlRow {
  return {
    id: value.id,
    name: value.name,
    timezone: value.timezone,
    story_mode: value.storyMode,
    relationship_dynamics_enabled: value.relationshipDynamicsEnabled,
  };
}

export function characterRow(value: Character, prefix = ""): SqlRow {
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

export function edgeRow(value: RelationshipEdge): SqlRow {
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

export function sessionRow(): SqlRow {
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

export function conversationRows(): SqlRow[] {
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

export function messageRow(value = "message-sql"): SqlRow {
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

export const memory = createMemoryItem({
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

export function memoryRow(value: MemoryItem = memory): SqlRow {
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

export const eventDefinition = createWorldEventDefinition({
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

export const eventOccurrence = createScheduledOccurrence({
  id: "occurrence-sql-festival",
  definition: eventDefinition,
  scheduledFor: "2026-08-15T10:00:00.000Z",
  occurrenceKey: annualOccurrenceKey(eventDefinition, 2026),
  createdAt: "2026-08-05T12:45:00.000Z",
});

export function eventDefinitionRow(value: WorldEventDefinition = eventDefinition): SqlRow {
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
      ? value.recurrence.localTime
      : null,
    recurrence_cron_expression: null,
    priority: value.priority,
    cooldown_seconds: value.cooldownSeconds ?? null,
    target_character_ids: [...value.targetCharacterIds],
    recipient_character_ids: [...value.recipientCharacterIds],
    output_send_message: value.outputs.sendMessage,
    output_publish_moment: value.outputs.publishMoment,
    output_generate_image: value.outputs.generateImage,
    enabled: value.enabled,
    created_at: value.createdAt,
  };
}

export function occurrenceRow(value: ScheduledOccurrence = eventOccurrence): SqlRow {
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
    definition_story_world_id: eventDefinition.storyWorldId,
    definition_event_key: eventDefinition.eventKey,
    definition_timezone: eventDefinition.timezone,
  };
}

export const plan = createCharacterPlan({
  id: "plan-sql",
  character: ai,
  storyWorld: world,
  startsAt: "2026-08-05T00:00:00.000Z",
  endsAt: "2026-08-06T00:00:00.000Z",
  activity: "SQL activity",
  interruptibility: PlanInterruptibility.FLEXIBLE,
  createdAt: "2026-08-05T12:50:00.000Z",
});

export function planRow(value: CharacterPlan = plan): SqlRow {
  return {
    id: value.id,
    character_id: value.characterId,
    story_world_id: value.storyWorldId,
    starts_at: value.startsAt,
    ends_at: value.endsAt,
    timezone: value.timezone,
    location: value.location ?? null,
    activity: value.activity,
    interruptibility: value.interruptibility,
    created_at: value.createdAt,
  };
}

export const budget = createProactiveMessageBudget({
  id: "budget-sql",
  character: ai,
  storyWorld: world,
  limit: 5,
  windowStartsAt: "2026-08-05T00:00:00.000Z",
  windowEndsAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-05T12:55:00.000Z",
});

export function budgetRow(value: ProactiveMessageBudget = budget): SqlRow {
  return {
    id: value.id,
    character_id: value.characterId,
    story_world_id: value.storyWorldId,
    limit_count: value.limit,
    consumed: value.consumed,
    window_starts_at: value.windowStartsAt,
    window_ends_at: value.windowEndsAt,
    updated_at: value.updatedAt,
  };
}

export const execution = createEventExecution({
  id: "execution-sql",
  occurrence: eventOccurrence,
  definition: eventDefinition,
  attempt: 1,
  ruleVersion: "v1",
  inputSnapshot: { hello: "world" },
  startedAt: "2026-08-05T13:00:00.000Z",
});

export function executionRow(value: EventExecution = execution): SqlRow {
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
    finished_at: null,
    output_snapshot: null,
    failure_reason: null,
  };
}

export const action = createBehaviorAction({
  id: "action-sql",
  execution,
  actorCharacterId: ai.id,
  kind: ActionKind.CREATE_MOMENT,
  priority: 10,
  payload: { body: "SQL draft body", imagePrompt: "A lantern festival", workflowVersion: "v1" },
  createdAt: "2026-08-05T13:01:00.000Z",
});

export function actionRow(value: BehaviorAction = action): SqlRow {
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

export const draft = createMomentDraft({
  id: "draft-sql",
  action,
  visibility: MomentVisibility.PUBLIC,
  createdAt: "2026-08-05T13:02:00.000Z",
});

export function draftRow(value: MomentDraft = draft): SqlRow {
  return {
    id: value.id,
    action_id: value.actionId,
    execution_id: value.executionId,
    story_world_id: value.storyWorldId,
    author_character_id: value.authorCharacterId,
    visibility: value.visibility,
    body: value.body,
    status: value.status,
    image_job_id: null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export const imageJob = createImageJob({
  id: "image-sql",
  action,
  momentDraftId: draft.id,
  createdAt: "2026-08-05T13:03:00.000Z",
});

export function imageJobRow(value: ImageJob = imageJob): SqlRow {
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
    negative_prompt: value.negativePrompt ?? null,
    seed: value.seed ?? null,
    attempt: value.attempt,
    status: value.status,
    external_job_id: value.externalJobId ?? null,
    media_ref: value.mediaRef ?? null,
    failure_reason: value.failureReason ?? null,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export const visualIdentity = createCharacterVisualIdentity({
  id: "visual-sql",
  characterId: ai.id,
  storyWorldId: world.id,
  styleTags: ["anime"],
  referenceImageRefs: ["ref-1"],
  positivePrompt: "A portrait of {{name}}",
  negativePrompt: "blurry",
  updatedAt: "2026-08-05T13:04:00.000Z",
});

export function visualIdentityRow(value: CharacterVisualIdentity = visualIdentity): SqlRow {
  return {
    id: value.id,
    character_id: value.characterId,
    story_world_id: value.storyWorldId,
    style_tags: [...value.styleTags],
    reference_image_refs: [...value.referenceImageRefs],
    positive_prompt: value.positivePrompt,
    negative_prompt: value.negativePrompt ?? null,
    revision: value.revision,
    updated_at: value.updatedAt,
  };
}

export const workflowTemplate = createImageWorkflowTemplate({
  id: "workflow-sql",
  version: "v1",
  positivePromptPath: ["inputs", "text"],
  workflow: { node: { inputs: { text: "placeholder" } } },
});

export function workflowTemplateRow(value: ImageWorkflowTemplate = workflowTemplate): SqlRow {
  return {
    id: value.id,
    version: value.version,
    positive_prompt_path: [...value.positivePromptPath],
    negative_prompt_path: value.negativePromptPath ? [...value.negativePromptPath] : null,
    seed_path: value.seedPath ? [...value.seedPath] : null,
    workflow: value.workflow,
  };
}

const readyDraft = transitionMomentDraft(draft, MomentDraftStatus.READY, "2026-08-05T13:05:30.000Z");

export const moment = createMoment({
  id: "moment-sql",
  draft: readyDraft,
  publishedAt: "2026-08-05T13:06:00.000Z",
});

export function momentRow(value: Moment = moment): SqlRow {
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

export const interaction = createMomentInteraction({
  id: "interaction-sql",
  moment,
  actor: user,
  kind: MomentInteractionKind.COMMENT,
  text: "Nice!",
  createdAt: "2026-08-05T13:07:00.000Z",
  idempotencyKey: "interaction-sql-key",
});

export function interactionRow(value: MomentInteraction = interaction): SqlRow {
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

export const llmProfile = createLlmProviderProfile({
  id: "llm-sql",
  name: "SQL LLM",
  protocol: LlmProviderProtocol.OPENAI_COMPATIBLE,
  baseUrl: "https://api.openai.com",
  model: "gpt-4",
  isActive: true,
  createdAt: "2026-08-05T13:08:00.000Z",
  updatedAt: "2026-08-05T13:08:00.000Z",
});

export function llmProfileRow(value: LlmProviderProfile = llmProfile): SqlRow {
  return {
    id: value.id,
    name: value.name,
    protocol: value.protocol,
    base_url: value.baseUrl,
    model: value.model,
    is_active: value.isActive,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export const comfySettings = createComfyUiSettings({
  id: "default",
  baseUrl: "http://localhost:8188",
  updatedAt: "2026-08-05T13:09:00.000Z",
});

export function comfySettingsRow(value: ComfyUiSettings = comfySettings): SqlRow {
  return {
    id: value.id,
    base_url: value.baseUrl,
    updated_at: value.updatedAt,
  };
}

export const loreEntry = createWorldLoreEntry({
  id: "lore-sql",
  storyWorldId: world.id,
  title: "SQL Lore",
  content: "The SQL lantern festival",
  category: "festival",
  isEnabled: true,
  createdAt: "2026-08-05T13:10:00.000Z",
  updatedAt: "2026-08-05T13:10:00.000Z",
});

export function loreEntryRow(value = loreEntry): SqlRow {
  return {
    id: value.id,
    story_world_id: value.storyWorldId,
    title: value.title,
    content: value.content,
    category: value.category,
    is_enabled: value.isEnabled,
    tags: [...value.tags],
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}
