export type CharacterId = string;
export type StoryWorldId = string;
export type RelationshipId = string;
export type ActorSessionId = string;
export type ConversationId = string;
export type MessageId = string;
export type MemoryId = string;
export type EventDefinitionId = string;
export type OccurrenceId = string;
export type CharacterPlanId = string;
export type EventExecutionId = string;
export type ProactiveMessageBudgetId = string;
export type BehaviorActionId = string;
export type MomentDraftId = string;
export type ImageJobId = string;
export type VisualIdentityId = string;
export type WorkflowTemplateId = string;
export type StickerPackId = string;
export type StickerId = string;
export type MomentId = string;
export type MomentInteractionId = string;
export type AppearanceSettingsId = string;
export type WorldLoreEntryId = string;

export const CharacterRole = {
  AI: "AI",
  USER: "USER",
} as const;

export type CharacterRole = (typeof CharacterRole)[keyof typeof CharacterRole];

export const StoryMode = {
  STATIC: "STATIC",
  DYNAMIC: "DYNAMIC",
} as const;

export type StoryMode = (typeof StoryMode)[keyof typeof StoryMode];

export const RelationshipMetric = {
  AFFINITY: "affinity",
  TRUST: "trust",
  CONFLICT: "conflict",
  DEPENDENCY: "dependency",
} as const;

export type RelationshipMetric =
  (typeof RelationshipMetric)[keyof typeof RelationshipMetric];

export interface RelationshipStateDto {
  affinity: number;
  trust: number;
  conflict: number;
  dependency: number;
}

export type RelationshipDeltaDto = RelationshipStateDto;

export interface CharacterDto {
  id: CharacterId;
  displayName: string;
  role: CharacterRole;
  storyWorldId: StoryWorldId;
  timezone: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

export interface CharacterVisualIdentityDto {
  id: VisualIdentityId;
  characterId: CharacterId;
  storyWorldId: StoryWorldId;
  positivePrompt: string;
  negativePrompt?: string;
  styleTags: readonly string[];
  referenceImageRefs: readonly string[];
  revision: number;
  updatedAt: string;
}

export interface ImageWorkflowTemplateDto {
  id: WorkflowTemplateId;
  version: string;
  workflow: Record<string, unknown>;
  positivePromptPath: readonly string[];
  negativePromptPath?: readonly string[];
  seedPath?: readonly string[];
}

export interface CompiledImageWorkflowDto {
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  workflow: Record<string, unknown>;
}

export type ValidateImageWorkflowRequest = ImageWorkflowTemplateDto;

export interface ValidateImageWorkflowResultDto {
  valid: true;
  id: WorkflowTemplateId;
  version: string;
  checkedBindings: readonly string[];
}

export interface StickerPackDto {
  id: StickerPackId;
  storyWorldId: StoryWorldId;
  name: string;
  sourceRef?: string;
  createdAt: string;
}

export interface StickerDto {
  id: StickerId;
  packId: StickerPackId;
  storyWorldId: StoryWorldId;
  label: string;
  mediaRef: string;
  tags: readonly string[];
  createdAt: string;
}

export interface CreateStickerInput {
  id: StickerId;
  label: string;
  mediaRef: string;
  tags?: readonly string[];
}

export interface CreateStickerPackRequest {
  id: StickerPackId;
  storyWorldId: StoryWorldId;
  name: string;
  sourceRef?: string;
  createdAt: string;
  stickers: readonly CreateStickerInput[];
}

export interface StickerPackImportResultDto {
  pack: StickerPackDto;
  stickers: readonly StickerDto[];
}

/** 聊天背景模式：跟随皮肤主题或使用自定义导入图�?*/
export const ChatBackgroundKindDto = {
  THEME: "theme",
  CUSTOM: "custom",
} as const;

export type ChatBackgroundKindDto =
  (typeof ChatBackgroundKindDto)[keyof typeof ChatBackgroundKindDto];

export interface ChatBackgroundSettingsDto {
  kind: ChatBackgroundKindDto;
  /** kind �?custom 时必填：data:image/、media:// �?http(s) 图片引用 */
  imageRef?: string;
  /** 背景不透明�?0 ~ 1 */
  opacity: number;
  /** 背景虚化像素 0 ~ 40 */
  blur: number;
}

export interface AppearanceSettingsDto {
  id: AppearanceSettingsId;
  ownerKey: string;
  themeId: string;
  chatBackground: ChatBackgroundSettingsDto;
  updatedAt: string;
}

/** PUT /v1/appearance-settings 请求体：全量替换外观设置 */
export interface UpdateAppearanceSettingsRequest {
  themeId: string;
  chatBackground: ChatBackgroundSettingsDto;
}

export interface WorldLoreEntryDto {
  id: WorldLoreEntryId;
  storyWorldId: StoryWorldId;
  category: string;
  title: string;
  content: string;
  tags: readonly string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorldLoreEntryRequest {
  id: WorldLoreEntryId;
  storyWorldId: StoryWorldId;
  category: string;
  title: string;
  content: string;
  tags?: readonly string[];
  isEnabled?: boolean;
}

export interface UpdateWorldLoreEntryRequest {
  category?: string;
  title?: string;
  content?: string;
  tags?: readonly string[];
  isEnabled?: boolean;
}

export const LlmProviderProtocolDto = {
  OPENAI_COMPATIBLE: "OPENAI_COMPATIBLE",
  ANTHROPIC: "ANTHROPIC",
} as const;

export type LlmProviderProtocolDto = (typeof LlmProviderProtocolDto)[keyof typeof LlmProviderProtocolDto];

export interface LlmProviderProfileDto {
  id: string;
  name: string;
  protocol: LlmProviderProtocolDto;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMask?: string;
  source: "database" | "environment";
  createdAt: string;
  updatedAt: string;
}

export interface SaveLlmProviderProfileRequest {
  id: string;
  name: string;
  protocol: LlmProviderProtocolDto;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
  isActive?: boolean;
}

export interface ComfyUiSettingsDto {
  id: "default";
  baseUrl: string;
  timeoutMs: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled: boolean;
  updatedAt: string;
}

export interface UpdateComfyUiSettingsRequest {
  baseUrl: string;
  timeoutMs?: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled?: boolean;
}

export interface StoryWorldDto {
  id: StoryWorldId;
  name: string;
  timezone: string;
  storyMode: StoryMode;
  relationshipDynamicsEnabled: boolean;
}

export interface CreateStoryWorldRequest {
  id: StoryWorldId;
  name: string;
  timezone: string;
  storyMode: StoryMode;
  relationshipDynamicsEnabled: boolean;
}

export interface UpdateStoryWorldRequest {
  name?: string;
  timezone?: string;
  storyMode?: StoryMode;
  relationshipDynamicsEnabled?: boolean;
}

export interface CreateCharacterRequest {
  id: CharacterId;
  displayName: string;
  role: CharacterRole;
  storyWorldId: StoryWorldId;
  timezone: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

export interface UpdateCharacterRequest {
  displayName?: string;
  timezone?: string;
  birthDate?: string;
  personaPrompt?: string;
  personaPromptRef?: string;
  visualPromptRef?: string;
}

export interface RelationshipEdgeDto {
  id: RelationshipId;
  sourceCharacterId: CharacterId;
  targetCharacterId: CharacterId;
  storyWorldId: StoryWorldId;
  relationshipType: string;
  initialState: RelationshipStateDto;
  isPublic: boolean;
  isBidirectional: boolean;
}

export interface CreateRelationshipEdgeRequest {
  id: RelationshipId;
  sourceCharacterId: CharacterId;
  targetCharacterId: CharacterId;
  storyWorldId: StoryWorldId;
  relationshipType: string;
  initialState: RelationshipStateDto;
  isPublic: boolean;
  isBidirectional: boolean;
}

export interface UpdateRelationshipEdgeRequest {
  relationshipType?: string;
  initialState?: RelationshipStateDto;
  isPublic?: boolean;
  isBidirectional?: boolean;
}

export interface ActorSessionDto {
  id: ActorSessionId;
  storyWorldId: StoryWorldId;
  userCharacterId: CharacterId;
  startedAt: string;
  endedAt?: string;
}

export interface ActorSessionSwitchRequest {
  actorSessionId: ActorSessionId;
  nextCharacterId: CharacterId;
}

export const ConversationType = {
  PRIVATE: "PRIVATE",
  GROUP: "GROUP",
} as const;

export type ConversationType =
  (typeof ConversationType)[keyof typeof ConversationType];

export const MessageKind = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  STICKER: "STICKER",
  SYSTEM: "SYSTEM",
} as const;

export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind];

export interface ConversationDto {
  id: ConversationId;
  storyWorldId: StoryWorldId;
  type: ConversationType;
  title?: string;
  createdAt: string;
}

export interface CreateConversationRequest {
  id: ConversationId;
  storyWorldId: StoryWorldId;
  type: ConversationType;
  title?: string;
  createdAt: string;
  memberCharacterIds: readonly CharacterId[];
}

export interface ConversationMemberDto {
  conversationId: ConversationId;
  characterId: CharacterId;
  joinedAt: string;
  leftAt?: string;
}

export interface ConversationDetailDto {
  conversation: ConversationDto;
  members: readonly ConversationMemberDto[];
}

export interface MessageDto {
  id: MessageId;
  conversationId: ConversationId;
  authorCharacterId?: CharacterId;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface SendMessageRequest {
  id: MessageId;
  authorCharacterId?: CharacterId;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface SendMessageResultDto {
  message: MessageDto;
  inserted: boolean;
}

/** A user-initiated image request bound to a private conversation. */
export interface RequestConversationImageRequest {
  actorCharacterId: CharacterId;
  recipientCharacterId: CharacterId;
  prompt: string;
  workflowVersion: string;
  negativePrompt?: string;
  seed?: number;
  createdAt: string;
  /** Stable per-request key. Repeating it returns the same queued job. */
  idempotencyKey: string;
}

export const MemoryKind = {
  EVENT_FACT: "EVENT_FACT",
  CONVERSATION_SUMMARY: "CONVERSATION_SUMMARY",
  CHARACTER_IMPRESSION: "CHARACTER_IMPRESSION",
  USER_PREFERENCE: "USER_PREFERENCE",
} as const;

export type MemoryKind = (typeof MemoryKind)[keyof typeof MemoryKind];

export const MemoryVisibility = {
  PRIVATE: "PRIVATE",
  RELATION: "RELATION",
  GROUP: "GROUP",
  PUBLIC: "PUBLIC",
  SYSTEM: "SYSTEM",
} as const;

export type MemoryVisibility =
  (typeof MemoryVisibility)[keyof typeof MemoryVisibility];

export const MemorySource = {
  USER_AUTHORED: "USER_AUTHORED",
  LLM_DERIVED: "LLM_DERIVED",
  SYSTEM_EVENT: "SYSTEM_EVENT",
  IMPORTED: "IMPORTED",
} as const;

export type MemorySource = (typeof MemorySource)[keyof typeof MemorySource];

export interface MemoryItemDto {
  id: MemoryId;
  storyWorldId: StoryWorldId;
  kind: MemoryKind;
  visibility: MemoryVisibility;
  source: MemorySource;
  content: string;
  confidence: number;
  createdAt: string;
  occurredAt?: string;
  subjectCharacterId?: CharacterId;
  audienceCharacterIds: readonly CharacterId[];
  sourceRef?: string;
}

export const TriggerSource = {
  BIRTHDAY: "BIRTHDAY",
  REAL_HOLIDAY: "REAL_HOLIDAY",
  WORLD_HOLIDAY: "WORLD_HOLIDAY",
  STORY_NODE: "STORY_NODE",
  USER_INTERACTION: "USER_INTERACTION",
  RELATIONSHIP_EVENT: "RELATIONSHIP_EVENT",
  MANUAL: "MANUAL",
} as const;

export type TriggerSource = (typeof TriggerSource)[keyof typeof TriggerSource];

export const EventRecurrenceKind = {
  ONCE: "ONCE",
  ANNUAL: "ANNUAL",
} as const;

export type EventRecurrenceKind =
  (typeof EventRecurrenceKind)[keyof typeof EventRecurrenceKind];

export interface OnceEventRecurrenceDto {
  kind: typeof EventRecurrenceKind.ONCE;
  runAt: string;
}

export interface AnnualEventRecurrenceDto {
  kind: typeof EventRecurrenceKind.ANNUAL;
  month: number;
  day: number;
  localTime: string;
}

export type EventRecurrenceDto = OnceEventRecurrenceDto | AnnualEventRecurrenceDto;

export interface EventOutputPolicyDto {
  sendMessage: boolean;
  publishMoment: boolean;
  generateImage: boolean;
}

export interface WorldEventDefinitionDto {
  id: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone: string;
  recurrence: EventRecurrenceDto;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds: readonly CharacterId[];
  outputs: EventOutputPolicyDto;
  priority: number;
  cooldownSeconds?: number;
  enabled: boolean;
  createdAt: string;
}

export interface CreateWorldEventDefinitionRequest {
  id: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone?: string;
  recurrence: EventRecurrenceDto;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds?: readonly CharacterId[];
  outputs?: Partial<EventOutputPolicyDto>;
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
  createdAt: string;
}

export interface UpdateWorldEventDefinitionRequest {
  eventKey?: string;
  name?: string;
  triggerSource?: TriggerSource;
  timezone?: string;
  recurrence?: EventRecurrenceDto;
  targetCharacterIds?: readonly CharacterId[];
  recipientCharacterIds?: readonly CharacterId[];
  outputs?: Partial<EventOutputPolicyDto>;
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
}

export const ScheduledOccurrenceStatus = {
  PENDING: "PENDING",
  ENQUEUED: "ENQUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ScheduledOccurrenceStatus =
  (typeof ScheduledOccurrenceStatus)[keyof typeof ScheduledOccurrenceStatus];

export interface ScheduledOccurrenceDto {
  id: OccurrenceId;
  definitionId: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  scheduledFor: string;
  timezone: string;
  occurrenceKey: string;
  status: ScheduledOccurrenceStatus;
  createdAt: string;
}

export interface WorldCalendarDto {
  storyWorldId: StoryWorldId;
  startsAt: string;
  endsAt: string;
  definitions: readonly WorldEventDefinitionDto[];
  occurrences: readonly ScheduledOccurrenceDto[];
}

export const PlanInterruptibility = {
  BLOCKED: "BLOCKED",
  LIMITED: "LIMITED",
  FLEXIBLE: "FLEXIBLE",
} as const;

export type PlanInterruptibility =
  (typeof PlanInterruptibility)[keyof typeof PlanInterruptibility];

export interface CharacterPlanDto {
  id: CharacterPlanId;
  storyWorldId: StoryWorldId;
  characterId: CharacterId;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  activity: string;
  interruptibility: PlanInterruptibility;
  createdAt: string;
}

export const EventExecutionStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventExecutionStatus =
  (typeof EventExecutionStatus)[keyof typeof EventExecutionStatus];

export interface EventExecutionDto {
  id: EventExecutionId;
  occurrenceId: OccurrenceId;
  definitionId: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  targetCharacterIds: readonly CharacterId[];
  attempt: number;
  ruleVersion: string;
  inputSnapshot: Readonly<Record<string, unknown>>;
  status: EventExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  outputSnapshot?: Readonly<Record<string, unknown>>;
  failureReason?: string;
}

export interface ProactiveMessageBudgetDto {
  id: ProactiveMessageBudgetId;
  storyWorldId: StoryWorldId;
  characterId: CharacterId;
  windowStartsAt: string;
  windowEndsAt: string;
  limit: number;
  consumed: number;
  updatedAt: string;
}

export const ActionKind = {
  NOOP: "NOOP",
  SEND_MESSAGE: "SEND_MESSAGE",
  CREATE_MOMENT: "CREATE_MOMENT",
  REQUEST_IMAGE: "REQUEST_IMAGE",
} as const;

export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export const ActionStatus = {
  PROPOSED: "PROPOSED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export interface BehaviorActionDto {
  id: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  actorCharacterId: CharacterId;
  kind: ActionKind;
  status: ActionStatus;
  priority: number;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export const MomentVisibility = {
  PUBLIC: "PUBLIC",
  RELATION: "RELATION",
  GROUP: "GROUP",
  PRIVATE: "PRIVATE",
} as const;

export type MomentVisibility =
  (typeof MomentVisibility)[keyof typeof MomentVisibility];

export const MomentDraftStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED",
} as const;

export type MomentDraftStatus =
  (typeof MomentDraftStatus)[keyof typeof MomentDraftStatus];

export interface MomentDraftDto {
  id: MomentDraftId;
  actionId: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  authorCharacterId: CharacterId;
  visibility: MomentVisibility;
  body: string;
  status: MomentDraftStatus;
  imageJobId?: ImageJobId;
  createdAt: string;
  updatedAt: string;
}

export const ImageJobKind = {
  MOMENT: "MOMENT",
} as const;

export type ImageJobKind = (typeof ImageJobKind)[keyof typeof ImageJobKind];

export const ImageJobStatus = {
  QUEUED: "QUEUED",
  SUBMITTED: "SUBMITTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ImageJobStatus = (typeof ImageJobStatus)[keyof typeof ImageJobStatus];

export interface ImageJobDto {
  id: ImageJobId;
  kind: ImageJobKind;
  actionId: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  ownerCharacterId: CharacterId;
  momentDraftId?: MomentDraftId;
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  attempt: number;
  status: ImageJobStatus;
  externalJobId?: string;
  mediaRef?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MomentDto {
  id: MomentId;
  draftId: MomentDraftId;
  storyWorldId: StoryWorldId;
  authorCharacterId: CharacterId;
  visibility: MomentVisibility;
  audienceCharacterIds: readonly CharacterId[];
  body: string;
  imageMediaRef?: string;
  publishedAt: string;
  createdAt: string;
}

export const MomentInteractionKind = {
  LIKE: "LIKE",
  COMMENT: "COMMENT",
} as const;

export type MomentInteractionKind =
  (typeof MomentInteractionKind)[keyof typeof MomentInteractionKind];

export interface MomentInteractionDto {
  id: MomentInteractionId;
  momentId: MomentId;
  storyWorldId: StoryWorldId;
  actorCharacterId: CharacterId;
  kind: MomentInteractionKind;
  text?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface CreateMomentInteractionRequest {
  id: MomentInteractionId;
  actorCharacterId: CharacterId;
  kind: MomentInteractionKind;
  text?: string;
  createdAt: string;
  idempotencyKey: string;
}

export const CreatorEventCandidateCategory = {
  OVERDUE: "OVERDUE",
  UPCOMING: "UPCOMING",
  FAILED: "FAILED",
  STALLED: "STALLED",
  MANUAL: "MANUAL",
} as const;

export type CreatorEventCandidateCategory =
  (typeof CreatorEventCandidateCategory)[keyof typeof CreatorEventCandidateCategory];

export const EventDispatchAction = {
  EXECUTE_EXISTING: "EXECUTE_EXISTING",
  RETRY_FAILED: "RETRY_FAILED",
  RUN_TRIAL: "RUN_TRIAL",
} as const;

export type EventDispatchAction =
  (typeof EventDispatchAction)[keyof typeof EventDispatchAction];

export interface CreatorEventCandidateDto {
  id: string;
  category: CreatorEventCandidateCategory;
  worldId: StoryWorldId;
  definition: WorldEventDefinitionDto;
  occurrence?: ScheduledOccurrenceDto;
  execution?: EventExecutionDto;
  projected?: boolean;
  scheduledFor: string;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds: readonly CharacterId[];
  outputSummary: readonly string[];
  risks: readonly string[];
  allowedActions: readonly EventDispatchAction[];
}

export interface EventDispatchPreviewItemDto {
  candidateId: string;
  action: EventDispatchAction;
  effect: string;
  risks: readonly string[];
}

export interface EventDispatchSelectionDto {
  candidateId: string;
  action: EventDispatchAction;
}

export interface EventDispatchPreviewRequest {
  selections: readonly EventDispatchSelectionDto[];
}

export const EventDispatchBatchStatus = {
  PENDING_DISPATCH: "PENDING_DISPATCH",
  DISPATCHED: "DISPATCHED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventDispatchBatchStatus =
  (typeof EventDispatchBatchStatus)[keyof typeof EventDispatchBatchStatus];

export const EventDispatchItemStatus = {
  PENDING_DISPATCH: "PENDING_DISPATCH",
  DISPATCHED: "DISPATCHED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventDispatchItemStatus =
  (typeof EventDispatchItemStatus)[keyof typeof EventDispatchItemStatus];

export interface EventDispatchBatchItemDto {
  id: string;
  candidateId: string;
  action: EventDispatchAction;
  status: EventDispatchItemStatus;
  occurrenceId?: OccurrenceId;
  executionId?: EventExecutionId;
  outputSnapshot?: Readonly<Record<string, unknown>>;
  failureReason?: string;
}

export interface EventDispatchBatchDto {
  id: string;
  worldId: StoryWorldId;
  status: EventDispatchBatchStatus;
  idempotencyKey: string;
  items: readonly EventDispatchBatchItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventDispatchBatchRequest {
  idempotencyKey: string;
  selections: readonly EventDispatchSelectionDto[];
}
export interface EventDispatchPreviewDto {
  worldId: StoryWorldId;
  items: readonly EventDispatchPreviewItemDto[];
  risks: readonly string[];
  canDispatch: boolean;
}
export interface MomentInteractionWriteResultDto {
  interaction: MomentInteractionDto;
  inserted: boolean;
}

export interface JsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
readonly enum?: readonly (string | number | boolean | null)[];
readonly format?: string;
readonly minLength?: number;
readonly maxLength?: number;
readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: JsonSchema;
  readonly oneOf?: readonly JsonSchema[];
}

const idSchema = { type: "string", minLength: 1 } as const satisfies JsonSchema;
const nonEmptyStringSchema = {
  type: "string",
  minLength: 1,
} as const satisfies JsonSchema;
const timestampSchema = {
  type: "string",
  format: "date-time",
} as const satisfies JsonSchema;

const stringListSchema = {
  type: "array",
  items: nonEmptyStringSchema,
} as const satisfies JsonSchema;

const workflowObjectSchema = {
  type: "object",
  additionalProperties: true,
} as const satisfies JsonSchema;

export const characterSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character",
  title: "Character",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    displayName: nonEmptyStringSchema,
    role: {
      type: "string",
      enum: [CharacterRole.AI, CharacterRole.USER],
    },
    storyWorldId: idSchema,
    timezone: nonEmptyStringSchema,
    birthDate: { type: "string", format: "date" },
    personaPromptRef: nonEmptyStringSchema,
    visualPromptRef: nonEmptyStringSchema,
  },
  required: ["id", "displayName", "role", "storyWorldId", "timezone"],
} as const satisfies JsonSchema;

export const characterVisualIdentitySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character-visual-identity",
  title: "CharacterVisualIdentity",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    characterId: idSchema,
    storyWorldId: idSchema,
    positivePrompt: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    styleTags: stringListSchema,
    referenceImageRefs: stringListSchema,
    revision: { type: "number", minimum: 1 },
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "characterId",
    "storyWorldId",
    "positivePrompt",
    "styleTags",
    "referenceImageRefs",
    "revision",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const imageWorkflowTemplateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:image-workflow-template",
  title: "ImageWorkflowTemplate",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    version: nonEmptyStringSchema,
    workflow: workflowObjectSchema,
    positivePromptPath: stringListSchema,
    negativePromptPath: stringListSchema,
    seedPath: stringListSchema,
  },
  required: ["id", "version", "workflow", "positivePromptPath"],
} as const satisfies JsonSchema;

export const compiledImageWorkflowSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:compiled-image-workflow",
  title: "CompiledImageWorkflow",
  type: "object",
  additionalProperties: false,
  properties: {
    workflowVersion: nonEmptyStringSchema,
    prompt: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    seed: { type: "number", minimum: 0 },
    workflow: workflowObjectSchema,
  },
  required: ["workflowVersion", "prompt", "workflow"],
} as const satisfies JsonSchema;

export const validateImageWorkflowResultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:validate-image-workflow-result",
  title: "ValidateImageWorkflowResult",
  type: "object",
  additionalProperties: false,
  properties: {
    valid: { type: "boolean", enum: [true] },
    id: idSchema,
    version: nonEmptyStringSchema,
    checkedBindings: stringListSchema,
  },
  required: ["valid", "id", "version", "checkedBindings"],
} as const satisfies JsonSchema;

export const stickerPackSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:sticker-pack",
  title: "StickerPack",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    name: nonEmptyStringSchema,
    sourceRef: nonEmptyStringSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "name", "createdAt"],
} as const satisfies JsonSchema;

export const stickerSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:sticker",
  title: "Sticker",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    packId: idSchema,
    storyWorldId: idSchema,
    label: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    tags: stringListSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "packId", "storyWorldId", "label", "mediaRef", "tags", "createdAt"],
} as const satisfies JsonSchema;

export const createStickerInputSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-sticker-input",
  title: "CreateStickerInput",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    label: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    tags: stringListSchema,
  },
  required: ["id", "label", "mediaRef"],
} as const satisfies JsonSchema;

export const createStickerPackRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-sticker-pack-request",
  title: "CreateStickerPackRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    name: nonEmptyStringSchema,
    sourceRef: nonEmptyStringSchema,
    createdAt: timestampSchema,
    stickers: { type: "array", items: createStickerInputSchema },
  },
  required: ["id", "storyWorldId", "name", "createdAt", "stickers"],
} as const satisfies JsonSchema;

export const worldLoreEntrySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-lore-entry",
  title: "WorldLoreEntry",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "category", "title", "content", "tags", "isEnabled", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createWorldLoreEntryRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-world-lore-entry-request",
  title: "CreateWorldLoreEntryRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
  },
  required: ["id", "storyWorldId", "category", "title", "content"],
} as const satisfies JsonSchema;

export const updateWorldLoreEntryRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-world-lore-entry-request",
  title: "UpdateWorldLoreEntryRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const chatBackgroundSettingsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:chat-background-settings",
  title: "ChatBackgroundSettings",
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [ChatBackgroundKindDto.THEME, ChatBackgroundKindDto.CUSTOM],
    },
    imageRef: { type: "string", minLength: 1, maxLength: 2_000_000 },
    opacity: { type: "number", minimum: 0, maximum: 1 },
    blur: { type: "number", minimum: 0, maximum: 40 },
  },
  required: ["kind", "opacity", "blur"],
} as const satisfies JsonSchema;

export const appearanceSettingsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:appearance-settings",
  title: "AppearanceSettings",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    ownerKey: nonEmptyStringSchema,
    themeId: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
    chatBackground: chatBackgroundSettingsSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "ownerKey", "themeId", "chatBackground", "updatedAt"],
} as const satisfies JsonSchema;

export const updateAppearanceSettingsRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-appearance-settings-request",
  title: "UpdateAppearanceSettingsRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    themeId: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
    chatBackground: chatBackgroundSettingsSchema,
  },
  required: ["themeId", "chatBackground"],
} as const satisfies JsonSchema;

export const storyWorldSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:story-world",
  title: "StoryWorld",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    name: nonEmptyStringSchema,
    timezone: nonEmptyStringSchema,
    storyMode: {
      type: "string",
      enum: [StoryMode.STATIC, StoryMode.DYNAMIC],
    },
    relationshipDynamicsEnabled: { type: "boolean" },
  },
  required: [
    "id",
    "name",
    "timezone",
    "storyMode",
    "relationshipDynamicsEnabled",
  ],
} as const satisfies JsonSchema;

export const relationshipStateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:relationship-state",
  title: "RelationshipState",
  type: "object",
  additionalProperties: false,
  properties: {
    affinity: { type: "number", minimum: -100, maximum: 100 },
    trust: { type: "number", minimum: -100, maximum: 100 },
    conflict: { type: "number", minimum: -100, maximum: 100 },
    dependency: { type: "number", minimum: -100, maximum: 100 },
  },
  required: ["affinity", "trust", "conflict", "dependency"],
} as const satisfies JsonSchema;

export const relationshipEdgeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:relationship-edge",
  title: "RelationshipEdge",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    sourceCharacterId: idSchema,
    targetCharacterId: idSchema,
    storyWorldId: idSchema,
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
  required: [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ],
} as const satisfies JsonSchema;

export const createRelationshipEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-relationship-edge-request",
  title: "CreateRelationshipEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    sourceCharacterId: idSchema,
    targetCharacterId: idSchema,
    storyWorldId: idSchema,
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
  required: [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ],
} as const satisfies JsonSchema;

export const updateRelationshipEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-relationship-edge-request",
  title: "UpdateRelationshipEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const actorSessionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:actor-session",
  title: "ActorSession",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    userCharacterId: idSchema,
    startedAt: timestampSchema,
    endedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "userCharacterId", "startedAt"],
} as const satisfies JsonSchema;

export const actorSessionSwitchRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:actor-session-switch-request",
  title: "ActorSessionSwitchRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    actorSessionId: idSchema,
    nextCharacterId: idSchema,
  },
  required: ["actorSessionId", "nextCharacterId"],
} as const satisfies JsonSchema;

export const conversationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:conversation",
  title: "Conversation",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: {
      type: "string",
      enum: [ConversationType.PRIVATE, ConversationType.GROUP],
    },
    title: nonEmptyStringSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "type", "createdAt"],
} as const satisfies JsonSchema;

export const conversationMemberSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:conversation-member",
  title: "ConversationMember",
  type: "object",
  additionalProperties: false,
  properties: {
    conversationId: idSchema,
    characterId: idSchema,
    joinedAt: timestampSchema,
    leftAt: timestampSchema,
  },
  required: ["conversationId", "characterId", "joinedAt"],
} as const satisfies JsonSchema;

export const messageSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:message",
  title: "Message",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    conversationId: idSchema,
    authorCharacterId: idSchema,
    kind: {
      type: "string",
      enum: [
        MessageKind.TEXT,
        MessageKind.IMAGE,
        MessageKind.STICKER,
        MessageKind.SYSTEM,
      ],
    },
    text: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    stickerId: nonEmptyStringSchema,
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: ["id", "conversationId", "kind", "createdAt", "idempotencyKey"],
} as const satisfies JsonSchema;

export const createConversationRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-conversation-request",
  title: "CreateConversationRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: {
      type: "string",
      enum: [ConversationType.PRIVATE, ConversationType.GROUP],
    },
    title: nonEmptyStringSchema,
    createdAt: timestampSchema,
    memberCharacterIds: {
      type: "array",
      items: idSchema,
    },
  },
  required: ["id", "storyWorldId", "type", "createdAt", "memberCharacterIds"],
} as const satisfies JsonSchema;

export const sendMessageRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:send-message-request",
  title: "SendMessageRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    authorCharacterId: idSchema,
    kind: {
      type: "string",
      enum: [
        MessageKind.TEXT,
        MessageKind.IMAGE,
        MessageKind.STICKER,
        MessageKind.SYSTEM,
      ],
    },
    text: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    stickerId: nonEmptyStringSchema,
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: ["id", "kind", "createdAt", "idempotencyKey"],
} as const satisfies JsonSchema;

export const requestConversationImageRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:request-conversation-image-request",
  title: "RequestConversationImageRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    actorCharacterId: idSchema,
    recipientCharacterId: idSchema,
    prompt: nonEmptyStringSchema,
    workflowVersion: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    seed: { type: "number", minimum: 0 },
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: [
    "actorCharacterId", "recipientCharacterId", "prompt", "workflowVersion",
    "createdAt", "idempotencyKey",
  ],
} as const satisfies JsonSchema;

export const memoryItemSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:memory-item",
  title: "MemoryItem",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    kind: {
      type: "string",
      enum: [
        MemoryKind.EVENT_FACT,
        MemoryKind.CONVERSATION_SUMMARY,
        MemoryKind.CHARACTER_IMPRESSION,
        MemoryKind.USER_PREFERENCE,
      ],
    },
    visibility: {
      type: "string",
      enum: [
        MemoryVisibility.PRIVATE,
        MemoryVisibility.RELATION,
        MemoryVisibility.GROUP,
        MemoryVisibility.PUBLIC,
        MemoryVisibility.SYSTEM,
      ],
    },
    source: {
      type: "string",
      enum: [
        MemorySource.USER_AUTHORED,
        MemorySource.LLM_DERIVED,
        MemorySource.SYSTEM_EVENT,
        MemorySource.IMPORTED,
      ],
    },
    content: nonEmptyStringSchema,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    createdAt: timestampSchema,
    occurredAt: timestampSchema,
    subjectCharacterId: idSchema,
    audienceCharacterIds: { type: "array", items: idSchema },
    sourceRef: nonEmptyStringSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "kind",
    "visibility",
    "source",
    "content",
    "confidence",
    "createdAt",
    "audienceCharacterIds",
  ],
} as const satisfies JsonSchema;

const onceEventRecurrenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [EventRecurrenceKind.ONCE] },
    runAt: timestampSchema,
  },
  required: ["kind", "runAt"],
} as const satisfies JsonSchema;

const annualEventRecurrenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [EventRecurrenceKind.ANNUAL] },
    month: { type: "number", minimum: 1, maximum: 12 },
    day: { type: "number", minimum: 1, maximum: 31 },
    localTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
  },
  required: ["kind", "month", "day", "localTime"],
} as const satisfies JsonSchema;

export const eventRecurrenceSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:event-recurrence",
  title: "EventRecurrence",
  oneOf: [onceEventRecurrenceSchema, annualEventRecurrenceSchema],
} as const satisfies JsonSchema;

export const worldEventDefinitionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-event-definition",
  title: "WorldEventDefinition",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: {
      type: "string",
      enum: Object.values(TriggerSource),
    },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
      required: ["sendMessage", "publishMoment", "generateImage"],
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "eventKey",
    "name",
    "triggerSource",
    "timezone",
    "recurrence",
    "targetCharacterIds",
    "recipientCharacterIds",
    "outputs",
    "priority",
    "enabled",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const createWorldEventDefinitionRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-world-event-definition-request",
  title: "CreateWorldEventDefinitionRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: { type: "string", enum: Object.values(TriggerSource) },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
    createdAt: timestampSchema,
  },
  required: [
    "id", "storyWorldId", "eventKey", "name", "triggerSource", "recurrence",
    "targetCharacterIds", "createdAt",
  ],
} as const satisfies JsonSchema;

export const updateWorldEventDefinitionRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-world-event-definition-request",
  title: "UpdateWorldEventDefinitionRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    eventKey: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    triggerSource: { type: "string", enum: Object.values(TriggerSource) },
    timezone: nonEmptyStringSchema,
    recurrence: eventRecurrenceSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    recipientCharacterIds: { type: "array", items: idSchema },
    outputs: {
      type: "object", additionalProperties: false,
      properties: { sendMessage: { type: "boolean" }, publishMoment: { type: "boolean" }, generateImage: { type: "boolean" } },
    },
    priority: { type: "number", minimum: 0 },
    cooldownSeconds: { type: "number", minimum: 0 },
    enabled: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const scheduledOccurrenceSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:scheduled-occurrence",
  title: "ScheduledOccurrence",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    definitionId: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    scheduledFor: timestampSchema,
    timezone: nonEmptyStringSchema,
    occurrenceKey: idSchema,
    status: {
      type: "string",
      enum: Object.values(ScheduledOccurrenceStatus),
    },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "definitionId",
    "storyWorldId",
    "eventKey",
    "scheduledFor",
    "timezone",
    "occurrenceKey",
    "status",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const worldCalendarSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-calendar",
  title: "WorldCalendar",
  type: "object",
  additionalProperties: false,
  properties: {
    storyWorldId: idSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    definitions: { type: "array", items: worldEventDefinitionSchema },
    occurrences: { type: "array", items: scheduledOccurrenceSchema },
  },
  required: ["storyWorldId", "startsAt", "endsAt", "definitions", "occurrences"],
} as const satisfies JsonSchema;

export const characterPlanSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character-plan",
  title: "CharacterPlan",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    characterId: idSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    timezone: nonEmptyStringSchema,
    location: nonEmptyStringSchema,
    activity: nonEmptyStringSchema,
    interruptibility: {
      type: "string",
      enum: Object.values(PlanInterruptibility),
    },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "characterId",
    "startsAt",
    "endsAt",
    "timezone",
    "activity",
    "interruptibility",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const eventExecutionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:event-execution",
  title: "EventExecution",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    occurrenceId: idSchema,
    definitionId: idSchema,
    storyWorldId: idSchema,
    eventKey: nonEmptyStringSchema,
    targetCharacterIds: { type: "array", items: idSchema },
    attempt: { type: "number", minimum: 1 },
    ruleVersion: nonEmptyStringSchema,
    inputSnapshot: { type: "object" },
    status: {
      type: "string",
      enum: Object.values(EventExecutionStatus),
    },
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    outputSnapshot: { type: "object" },
    failureReason: nonEmptyStringSchema,
  },
  required: [
    "id",
    "occurrenceId",
    "definitionId",
    "storyWorldId",
    "eventKey",
    "targetCharacterIds",
    "attempt",
    "ruleVersion",
    "inputSnapshot",
    "status",
    "startedAt",
  ],
} as const satisfies JsonSchema;

export const proactiveMessageBudgetSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:proactive-message-budget",
  title: "ProactiveMessageBudget",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    characterId: idSchema,
    windowStartsAt: timestampSchema,
    windowEndsAt: timestampSchema,
    limit: { type: "number", minimum: 0 },
    consumed: { type: "number", minimum: 0 },
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "characterId",
    "windowStartsAt",
    "windowEndsAt",
    "limit",
    "consumed",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const behaviorActionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:behavior-action",
  title: "BehaviorAction",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    executionId: idSchema,
    storyWorldId: idSchema,
    actorCharacterId: idSchema,
    kind: { type: "string", enum: Object.values(ActionKind) },
    status: { type: "string", enum: Object.values(ActionStatus) },
    priority: { type: "number", minimum: 0 },
    payload: { type: "object" },
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "executionId",
    "storyWorldId",
    "actorCharacterId",
    "kind",
    "status",
    "priority",
    "payload",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const momentDraftSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:moment-draft",
  title: "MomentDraft",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    actionId: idSchema,
    executionId: idSchema,
    storyWorldId: idSchema,
    authorCharacterId: idSchema,
    visibility: { type: "string", enum: Object.values(MomentVisibility) },
    body: nonEmptyStringSchema,
    status: { type: "string", enum: Object.values(MomentDraftStatus) },
    imageJobId: idSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "actionId",
    "executionId",
    "storyWorldId",
    "authorCharacterId",
    "visibility",
    "body",
    "status",
    "createdAt",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const imageJobSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:image-job",
  title: "ImageJob",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    kind: { type: "string", enum: Object.values(ImageJobKind) },
    actionId: idSchema,
    executionId: idSchema,
    storyWorldId: idSchema,
    ownerCharacterId: idSchema,
    momentDraftId: idSchema,
    workflowVersion: nonEmptyStringSchema,
    prompt: nonEmptyStringSchema,
    attempt: { type: "number", minimum: 1 },
    negativePrompt: nonEmptyStringSchema,
    seed: { type: "number", minimum: 0 },
    status: { type: "string", enum: Object.values(ImageJobStatus) },
    externalJobId: idSchema,
    mediaRef: nonEmptyStringSchema,
    failureReason: nonEmptyStringSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "kind",
    "actionId",
    "executionId",
    "storyWorldId",
    "ownerCharacterId",
    "workflowVersion",
    "prompt",
    "attempt",
    "status",
    "createdAt",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const momentSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:moment",
  title: "Moment",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    draftId: idSchema,
    storyWorldId: idSchema,
    authorCharacterId: idSchema,
    visibility: { type: "string", enum: Object.values(MomentVisibility) },
    audienceCharacterIds: { type: "array", items: idSchema },
    body: nonEmptyStringSchema,
    imageMediaRef: nonEmptyStringSchema,
    publishedAt: timestampSchema,
    createdAt: timestampSchema,
  },
  required: [
    "id",
    "draftId",
    "storyWorldId",
    "authorCharacterId",
    "visibility",
    "audienceCharacterIds",
    "body",
    "publishedAt",
    "createdAt",
  ],
} as const satisfies JsonSchema;

export const momentInteractionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:moment-interaction",
  title: "MomentInteraction",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    momentId: idSchema,
    storyWorldId: idSchema,
    actorCharacterId: idSchema,
    kind: { type: "string", enum: Object.values(MomentInteractionKind) },
    text: nonEmptyStringSchema,
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: [
    "id",
    "momentId",
    "storyWorldId",
    "actorCharacterId",
    "kind",
    "createdAt",
    "idempotencyKey",
  ],
} as const satisfies JsonSchema;

export const createMomentInteractionRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-moment-interaction-request",
  title: "CreateMomentInteractionRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    actorCharacterId: idSchema,
    kind: { type: "string", enum: Object.values(MomentInteractionKind) },
    text: nonEmptyStringSchema,
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: ["id", "actorCharacterId", "kind", "createdAt", "idempotencyKey"],
} as const satisfies JsonSchema;

export const contractSchemas = {
  character: characterSchema,
  characterVisualIdentity: characterVisualIdentitySchema,
  imageWorkflowTemplate: imageWorkflowTemplateSchema,
  compiledImageWorkflow: compiledImageWorkflowSchema,
  validateImageWorkflowResult: validateImageWorkflowResultSchema,
  stickerPack: stickerPackSchema,
  sticker: stickerSchema,
  createStickerInput: createStickerInputSchema,
  createStickerPackRequest: createStickerPackRequestSchema,
  worldLoreEntry: worldLoreEntrySchema,
  createWorldLoreEntryRequest: createWorldLoreEntryRequestSchema,
  updateWorldLoreEntryRequest: updateWorldLoreEntryRequestSchema,
  storyWorld: storyWorldSchema,
  updateAppearanceSettingsRequest: updateAppearanceSettingsRequestSchema,
  relationshipState: relationshipStateSchema,
  relationshipEdge: relationshipEdgeSchema,
  createRelationshipEdgeRequest: createRelationshipEdgeRequestSchema,
  updateRelationshipEdgeRequest: updateRelationshipEdgeRequestSchema,
  actorSession: actorSessionSchema,
  actorSessionSwitchRequest: actorSessionSwitchRequestSchema,
  appearanceSettings: appearanceSettingsSchema,
  chatBackgroundSettings: chatBackgroundSettingsSchema,
  conversation: conversationSchema,
  conversationMember: conversationMemberSchema,
  message: messageSchema,
  createConversationRequest: createConversationRequestSchema,
  sendMessageRequest: sendMessageRequestSchema,
  requestConversationImageRequest: requestConversationImageRequestSchema,
  memoryItem: memoryItemSchema,
  eventRecurrence: eventRecurrenceSchema,
  worldEventDefinition: worldEventDefinitionSchema,
  createWorldEventDefinitionRequest: createWorldEventDefinitionRequestSchema,
  updateWorldEventDefinitionRequest: updateWorldEventDefinitionRequestSchema,
  scheduledOccurrence: scheduledOccurrenceSchema,
  worldCalendar: worldCalendarSchema,
  characterPlan: characterPlanSchema,
  eventExecution: eventExecutionSchema,
  proactiveMessageBudget: proactiveMessageBudgetSchema,
  behaviorAction: behaviorActionSchema,
  momentDraft: momentDraftSchema,
  imageJob: imageJobSchema,
  moment: momentSchema,
  momentInteraction: momentInteractionSchema,
  createMomentInteractionRequest: createMomentInteractionRequestSchema,
} as const;


export * from "./interaction-log.ts";
