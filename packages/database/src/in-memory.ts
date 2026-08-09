import {
  CharacterRole,
  assertAppearanceSettings,
  assertComfyUiSettings,
  assertLlmProviderProfile,
  assertBehaviorAction,
  assertCharacterPlan,
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
  assertScheduledOccurrence,
  assertWorldEventDefinition,
  assertWorldLoreEntry,
  createMessage,
  isBudgetActiveAt,
  isMemoryVisibleTo,
  isPlanActiveAt,
  isMomentVisibleTo,
  scoreMemory,
  type ActorSession,
  type AppearanceSettings,
  type ComfyUiSettings,
  type LlmProviderProfile,
  type BehaviorAction,
  type CharacterPlan,
  type Character,
  type ConversationAggregate,
  type EventExecution,
  type ImageJob,
  type CharacterVisualIdentity,
  type ImageWorkflowTemplate,
  type Sticker,
  type StickerPack,
  type JsonObject,
  type Message,
  type MessageInput,
  type MemoryItem,
  type MemorySearchQuery,
  type MemorySearchResult,
  type ProactiveMessageBudget,
  type MomentDraft,
  type Moment,
  type MomentInteraction,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type StoryWorld,
  type WorldEventDefinition,
  type WorldLoreEntry,
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
  MomentInteractionRepository,
  MomentInteractionWriteResult,
  MomentRepository,
  InMemoryRepositorySeed,
  MessageRepository,
  MessageWriteResult,
  MemoryRepository,
  RelationshipEdgeRepository,
  ScheduledOccurrenceRepository,
  ScheduledOccurrenceWriteResult,
  StoryWorldRepository,
  WorldEventDefinitionRepository,
  WorldLoreEntryRepository,
  ProactiveMessageBudgetRepository,
  MomentDraftRepository,
  CharacterVisualIdentityRepository,
  ImageWorkflowTemplateRepository,
  StickerPackRepository,
  StickerRepository,
  AppearanceSettingsRepository,
  ComfyUiSettingsRepository,
  LlmProviderProfileRepository,
} from "./repositories.ts";
import { createInMemoryDispatchRequestRepository, type DispatchRequestRepository } from "./dispatch.ts";

function copyWorld(world: StoryWorld): StoryWorld {
  return { ...world };
}

function copyCharacter(character: Character): Character {
  return { ...character };
}

function copySession(session: ActorSession): ActorSession {
  return { ...session };
}

function copyEdge(edge: RelationshipEdge): RelationshipEdge {
  return { ...edge, initialState: { ...edge.initialState } };
}

function copyConversation(aggregate: ConversationAggregate): ConversationAggregate {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((member) => ({ ...member })),
  };
}

function copyMessage(message: Message): Message {
  return { ...message };
}

function copyMemory(memory: MemoryItem): MemoryItem {
  return {
    ...memory,
    audienceCharacterIds: [...memory.audienceCharacterIds],
  };
}

function copyEventDefinition(definition: WorldEventDefinition): WorldEventDefinition {
  return {
    ...definition,
    recurrence: definition.recurrence.kind === "ONCE"
      ? { ...definition.recurrence }
      : { ...definition.recurrence },
    targetCharacterIds: [...definition.targetCharacterIds],
    recipientCharacterIds: [...definition.recipientCharacterIds],
    outputs: { ...definition.outputs },
  };
}

function copyOccurrence(occurrence: ScheduledOccurrence): ScheduledOccurrence {
  return { ...occurrence };
}

function copyPlan(plan: CharacterPlan): CharacterPlan {
  return { ...plan };
}

function copyBudget(budget: ProactiveMessageBudget): ProactiveMessageBudget {
  return { ...budget };
}

function copyJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function copyExecution(execution: EventExecution): EventExecution {
  return {
    ...execution,
    targetCharacterIds: [...execution.targetCharacterIds],
    inputSnapshot: copyJsonObject(execution.inputSnapshot),
    ...(execution.outputSnapshot === undefined
      ? {}
      : { outputSnapshot: copyJsonObject(execution.outputSnapshot) }),
  };
}

function copyAction(action: BehaviorAction): BehaviorAction {
  return {
    ...action,
    payload: copyJsonObject(action.payload),
  };
}

function copyMomentDraft(draft: MomentDraft): MomentDraft {
  return { ...draft };
}

function copyImageJob(job: ImageJob): ImageJob {
  return { ...job };
}

function copyCharacterVisualIdentity(identity: CharacterVisualIdentity): CharacterVisualIdentity {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

function copyImageWorkflowTemplate(template: ImageWorkflowTemplate): ImageWorkflowTemplate {
  return {
    ...template,
    workflow: copyJsonObject(template.workflow),
    positivePromptPath: [...template.positivePromptPath],
    ...(template.negativePromptPath === undefined
      ? {}
      : { negativePromptPath: [...template.negativePromptPath] }),
    ...(template.seedPath === undefined ? {} : { seedPath: [...template.seedPath] }),
  };
}

function copyStickerPack(pack: StickerPack): StickerPack {
  return { ...pack };
}

function copySticker(sticker: Sticker): Sticker {
  return { ...sticker, tags: [...sticker.tags] };
}

function copyMoment(moment: Moment): Moment {
  return {
    ...moment,
    audienceCharacterIds: [...moment.audienceCharacterIds],
  };
}

function copyMomentInteraction(interaction: MomentInteraction): MomentInteraction {
return { ...interaction };
}

function copyAppearanceSettings(settings: AppearanceSettings): AppearanceSettings {
return { ...settings, chatBackground: { ...settings.chatBackground } };
}

function copyLlmProviderProfile(profile: LlmProviderProfile): LlmProviderProfile {
  return { ...profile };
}

function copyComfyUiSettings(settings: ComfyUiSettings): ComfyUiSettings {
  return { ...settings };
}

function copyWorldLoreEntry(entry: WorldLoreEntry): WorldLoreEntry {
  return { ...entry, tags: [...entry.tags] };
}

function addUnique<T extends { id: string }>(
  target: Map<string, T>,
  value: T,
  kind: string,
): void {
  if (target.has(value.id)) {
    throw new TypeError(`Duplicate ${kind} id: ${value.id}`);
  }
  target.set(value.id, value);
}

function assertEdgeReferences(
  edge: RelationshipEdge,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  const source = characters.get(edge.sourceCharacterId);
  const target = characters.get(edge.targetCharacterId);
  if (!worlds.has(edge.storyWorldId) || !source || !target) {
    throw new TypeError(`Relationship edge ${edge.id} references an unknown entity`);
  }
  if (
    source.storyWorldId !== edge.storyWorldId ||
    target.storyWorldId !== edge.storyWorldId ||
    source.id === target.id
  ) {
    throw new TypeError(`Relationship edge ${edge.id} has invalid character references`);
  }
}

function assertVisualIdentityReferences(
  identity: CharacterVisualIdentity,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertCharacterVisualIdentity(identity);
  const world = worlds.get(identity.storyWorldId);
  const character = characters.get(identity.characterId);
  if (!world || !character || character.storyWorldId !== identity.storyWorldId) {
    throw new TypeError(`Visual identity ${identity.id} references invalid character or world`);
  }
}

function assertSessionReferences(
  session: ActorSession,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  const userCharacter = characters.get(session.userCharacterId);
  if (
    !worlds.has(session.storyWorldId) ||
    !userCharacter ||
    userCharacter.role !== CharacterRole.USER ||
    userCharacter.storyWorldId !== session.storyWorldId
  ) {
    throw new TypeError(`Actor session ${session.id} references an invalid user character`);
  }
}

function assertConversationReferences(
  aggregate: ConversationAggregate,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  if (!worlds.has(aggregate.conversation.storyWorldId)) {
    throw new TypeError(
      `Conversation ${aggregate.conversation.id} references an unknown story world`,
    );
  }
  const ids = new Set<string>();
  for (const member of aggregate.members) {
    if (member.conversationId !== aggregate.conversation.id || ids.has(member.characterId)) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has invalid members`);
    }
    const character = characters.get(member.characterId);
    if (!character || character.storyWorldId !== aggregate.conversation.storyWorldId) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has an invalid member`);
    }
    ids.add(member.characterId);
  }
}

function messagePayloadInput(
  message: Message,
  conversation: ConversationAggregate,
  author: Character | undefined,
): MessageInput {
  const input: MessageInput = {
    id: message.id,
    conversation,
    kind: message.kind,
    createdAt: message.createdAt,
    idempotencyKey: message.idempotencyKey,
  };
  if (author !== undefined) input.author = author;
  if (message.text !== undefined) input.text = message.text;
  if (message.mediaRef !== undefined) input.mediaRef = message.mediaRef;
  if (message.stickerId !== undefined) input.stickerId = message.stickerId;
  return input;
}

function sameMessage(left: Message, right: Message): boolean {
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

function assertMemoryReferences(
  memory: MemoryItem,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  if (!worlds.has(memory.storyWorldId)) {
    throw new TypeError(`Memory ${memory.id} references an unknown story world`);
  }
  const ids = [
    ...(memory.subjectCharacterId === undefined ? [] : [memory.subjectCharacterId]),
    ...memory.audienceCharacterIds,
  ];
  for (const id of ids) {
    const character = characters.get(id);
    if (!character || character.storyWorldId !== memory.storyWorldId) {
      throw new TypeError(`Memory ${memory.id} references an invalid character`);
    }
  }
}

function assertEventDefinitionReferences(
  definition: WorldEventDefinition,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertWorldEventDefinition(definition);
  if (!worlds.has(definition.storyWorldId)) {
    throw new TypeError(
      `Event definition ${definition.id} references an unknown story world`,
    );
  }
  for (const characterId of definition.targetCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== definition.storyWorldId) {
      throw new TypeError(
        `Event definition ${definition.id} references an invalid target character`,
      );
    }
  }
  for (const characterId of definition.recipientCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== definition.storyWorldId) {
      throw new TypeError(
        `Event definition ${definition.id} references an invalid recipient character`,
      );
    }
  }
}

function assertPlanReferences(
  plan: CharacterPlan,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertCharacterPlan(plan);
  const character = characters.get(plan.characterId);
  if (!worlds.has(plan.storyWorldId) || !character || character.storyWorldId !== plan.storyWorldId) {
    throw new TypeError(`Character plan ${plan.id} references an invalid character or world`);
  }
}

function assertBudgetReferences(
  budget: ProactiveMessageBudget,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertProactiveMessageBudget(budget);
  const character = characters.get(budget.characterId);
  if (!worlds.has(budget.storyWorldId) || !character || character.storyWorldId !== budget.storyWorldId) {
    throw new TypeError(`Message budget ${budget.id} references an invalid character or world`);
  }
}

function assertExecutionReferences(
  execution: EventExecution,
  definitions: Map<string, WorldEventDefinition>,
  occurrences: Map<string, ScheduledOccurrence>,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertEventExecution(execution);
  const definition = definitions.get(execution.definitionId);
  const occurrence = occurrences.get(execution.occurrenceId);
  if (
    !worlds.has(execution.storyWorldId) ||
    !definition ||
    !occurrence ||
    definition.storyWorldId !== execution.storyWorldId ||
    occurrence.storyWorldId !== execution.storyWorldId ||
    occurrence.definitionId !== execution.definitionId ||
    occurrence.eventKey !== execution.eventKey
  ) {
    throw new TypeError(`Event execution ${execution.id} references invalid event state`);
  }
  for (const characterId of execution.targetCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== execution.storyWorldId) {
      throw new TypeError(`Event execution ${execution.id} references an invalid target character`);
    }
  }
}

function assertActionReferences(
  action: BehaviorAction,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
): void {
  assertBehaviorAction(action);
  const execution = executions.get(action.executionId);
  const actor = characters.get(action.actorCharacterId);
  if (
    !execution ||
    execution.storyWorldId !== action.storyWorldId ||
    !actor ||
    actor.storyWorldId !== action.storyWorldId ||
    !execution.targetCharacterIds.includes(action.actorCharacterId)
  ) {
    throw new TypeError(`Behavior action ${action.id} references invalid execution or actor`);
  }
}

function assertMomentDraftReferences(
  draft: MomentDraft,
  actions: Map<string, BehaviorAction>,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
): void {
  assertMomentDraft(draft);
  const action = actions.get(draft.actionId);
  const execution = executions.get(draft.executionId);
  const author = characters.get(draft.authorCharacterId);
  if (
    !action ||
    action.kind !== "CREATE_MOMENT" ||
    action.executionId !== draft.executionId ||
    !execution ||
    !author ||
    author.storyWorldId !== draft.storyWorldId ||
    action.actorCharacterId !== draft.authorCharacterId
  ) {
    throw new TypeError(`Moment draft ${draft.id} references invalid action or author`);
  }
}

function assertImageReferences(
  job: ImageJob,
  actions: Map<string, BehaviorAction>,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
  drafts: Map<string, MomentDraft>,
): void {
  assertImageJob(job);
  const action = actions.get(job.actionId);
  const execution = executions.get(job.executionId);
  const owner = characters.get(job.ownerCharacterId);
  if (
    !action ||
    (action.kind !== "REQUEST_IMAGE" && action.kind !== "CREATE_MOMENT") ||
    action.executionId !== job.executionId ||
    !execution ||
    !owner ||
    owner.storyWorldId !== job.storyWorldId ||
    action.actorCharacterId !== job.ownerCharacterId
  ) {
    throw new TypeError(`Image job ${job.id} references invalid action or owner`);
  }
  if (job.momentDraftId !== undefined) {
    const draft = drafts.get(job.momentDraftId);
    if (!draft || draft.actionId !== job.actionId) {
      throw new TypeError(`Image job ${job.id} references invalid moment draft`);
    }
  }
}

function assertMomentReferences(
  moment: Moment,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertMoment(moment);
  const author = characters.get(moment.authorCharacterId);
  if (!worlds.has(moment.storyWorldId) || !author || author.storyWorldId !== moment.storyWorldId) {
    throw new TypeError(`Moment ${moment.id} references an invalid author or world`);
  }
  for (const characterId of moment.audienceCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== moment.storyWorldId) {
      throw new TypeError(`Moment ${moment.id} references an invalid audience character`);
    }
  }
}

function assertMomentInteractionReferences(
  interaction: MomentInteraction,
  moments: Map<string, Moment>,
  characters: Map<string, Character>,
): void {
  assertMomentInteraction(interaction);
  const moment = moments.get(interaction.momentId);
  const actor = characters.get(interaction.actorCharacterId);
  if (
    !moment ||
    !actor ||
    actor.storyWorldId !== interaction.storyWorldId ||
    moment.storyWorldId !== interaction.storyWorldId
  ) {
    throw new TypeError(`Moment interaction ${interaction.id} references invalid moment or actor`);
  }
}

function assertWorldLoreEntryReferences(
  entry: WorldLoreEntry,
  worlds: Map<string, StoryWorld>,
): void {
  assertWorldLoreEntry(entry);
  if (!worlds.has(entry.storyWorldId)) {
    throw new TypeError(`World lore entry ${entry.id} references an unknown story world`);
  }
}

export class InMemoryRepositories implements DomainRepositories {
  public readonly storyWorlds: StoryWorldRepository;
  public readonly characters: CharacterRepository;
  public readonly relationshipEdges: RelationshipEdgeRepository;
  public readonly actorSessions: ActorSessionRepository;
  public readonly conversations: ConversationRepository;
  public readonly messages: MessageRepository;
  public readonly memories: MemoryRepository;
  public readonly worldEventDefinitions: WorldEventDefinitionRepository;
  public readonly worldLoreEntries: WorldLoreEntryRepository;
  public readonly scheduledOccurrences: ScheduledOccurrenceRepository;
  public readonly dispatchRequests: DispatchRequestRepository;
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
  public readonly appearanceSettings: AppearanceSettingsRepository;
  public readonly llmProviderProfiles: LlmProviderProfileRepository;
  public readonly comfyUiSettings: ComfyUiSettingsRepository;

  private readonly worldMap = new Map<string, StoryWorld>();
  private readonly characterMap = new Map<string, Character>();
  private readonly relationshipEdgeMap = new Map<string, RelationshipEdge>();
  private readonly actorSessionMap = new Map<string, ActorSession>();
  private readonly conversationMap = new Map<string, ConversationAggregate>();
  private readonly messageMap = new Map<string, Message>();
  private readonly memoryMap = new Map<string, MemoryItem>();
  private readonly worldEventDefinitionMap = new Map<string, WorldEventDefinition>();
  private readonly worldLoreEntryMap = new Map<string, WorldLoreEntry>();
  private readonly scheduledOccurrenceMap = new Map<string, ScheduledOccurrence>();
  private readonly characterPlanMap = new Map<string, CharacterPlan>();
  private readonly eventExecutionMap = new Map<string, EventExecution>();
  private readonly proactiveMessageBudgetMap = new Map<string, ProactiveMessageBudget>();
  private readonly behaviorActionMap = new Map<string, BehaviorAction>();
  private readonly momentDraftMap = new Map<string, MomentDraft>();
  private readonly imageJobMap = new Map<string, ImageJob>();
  private readonly characterVisualIdentityMap = new Map<string, CharacterVisualIdentity>();
  private readonly imageWorkflowTemplateMap = new Map<string, ImageWorkflowTemplate>();
  private readonly stickerPackMap = new Map<string, StickerPack>();
  private readonly stickerMap = new Map<string, Sticker>();
  private readonly momentMap = new Map<string, Moment>();
  private readonly momentInteractionMap = new Map<string, MomentInteraction>();
  private readonly appearanceSettingsMap = new Map<string, AppearanceSettings>();
  private readonly llmProviderProfileMap = new Map<string, LlmProviderProfile>();
  private readonly comfyUiSettingsMap = new Map<string, ComfyUiSettings>();

  public constructor(seed: InMemoryRepositorySeed = {}) {
    this.dispatchRequests = createInMemoryDispatchRequestRepository(seed.dispatchRequests);
    for (const world of seed.worlds ?? []) {
      addUnique(this.worldMap, copyWorld(world), "storyWorld");
    }

    for (const character of seed.characters ?? []) {
      if (!this.worldMap.has(character.storyWorldId)) {
        throw new TypeError(
          `Character ${character.id} references unknown story world ${character.storyWorldId}`,
        );
      }
      addUnique(this.characterMap, copyCharacter(character), "character");
    }

    for (const identity of seed.characterVisualIdentities ?? []) {
      assertVisualIdentityReferences(identity, this.worldMap, this.characterMap);
      if ([...this.characterVisualIdentityMap.values()].some(
        (candidate) => candidate.characterId === identity.characterId,
      )) {
        throw new TypeError(`Duplicate visual identity character: ${identity.characterId}`);
      }
      addUnique(
        this.characterVisualIdentityMap,
        copyCharacterVisualIdentity(identity),
        "characterVisualIdentity",
      );
    }

    for (const template of seed.imageWorkflowTemplates ?? []) {
      assertImageWorkflowTemplate(template);
      const key = `${template.id}@${template.version}`;
      if (this.imageWorkflowTemplateMap.has(key)) {
        throw new TypeError(`Duplicate image workflow template: ${key}`);
      }
      this.imageWorkflowTemplateMap.set(key, copyImageWorkflowTemplate(template));
    }

    for (const pack of seed.stickerPacks ?? []) {
      assertStickerPack(pack);
      addUnique(this.stickerPackMap, copyStickerPack(pack), "stickerPack");
    }
    for (const sticker of seed.stickers ?? []) {
      assertSticker(sticker);
      const pack = this.stickerPackMap.get(sticker.packId);
      if (!pack || pack.storyWorldId !== sticker.storyWorldId) {
        throw new TypeError(`Sticker ${sticker.id} references an invalid pack`);
      }
      addUnique(this.stickerMap, copySticker(sticker), "sticker");
    }

    for (const edge of seed.relationshipEdges ?? []) {
      assertEdgeReferences(edge, this.worldMap, this.characterMap);
      addUnique(this.relationshipEdgeMap, copyEdge(edge), "relationshipEdge");
    }

    for (const session of seed.actorSessions ?? []) {
      assertSessionReferences(session, this.worldMap, this.characterMap);
      addUnique(this.actorSessionMap, copySession(session), "actorSession");
    }

    for (const conversation of seed.conversations ?? []) {
      assertConversationReferences(conversation, this.worldMap, this.characterMap);
      if (this.conversationMap.has(conversation.conversation.id)) {
        throw new TypeError(`Duplicate conversation id: ${conversation.conversation.id}`);
      }
      this.conversationMap.set(
        conversation.conversation.id,
        copyConversation(conversation),
      );
    }

    for (const message of seed.messages ?? []) {
      this.saveMessageSeed(message);
    }
    for (const memory of seed.memories ?? []) {
      assertMemoryReferences(memory, this.worldMap, this.characterMap);
      addUnique(this.memoryMap, copyMemory(memory), "memory");
    }
    for (const definition of seed.worldEventDefinitions ?? []) {
      assertEventDefinitionReferences(definition, this.worldMap, this.characterMap);
      addUnique(
        this.worldEventDefinitionMap,
        copyEventDefinition(definition),
        "worldEventDefinition",
      );
    }
    for (const entry of seed.worldLoreEntries ?? []) {
      assertWorldLoreEntryReferences(entry, this.worldMap);
      addUnique(this.worldLoreEntryMap, copyWorldLoreEntry(entry), "worldLoreEntry");
    }
    for (const occurrence of seed.scheduledOccurrences ?? []) {
      assertScheduledOccurrence(occurrence);
      const definition = this.worldEventDefinitionMap.get(occurrence.definitionId);
      if (
        !definition ||
        definition.storyWorldId !== occurrence.storyWorldId ||
        definition.eventKey !== occurrence.eventKey ||
        definition.timezone !== occurrence.timezone
      ) {
        throw new TypeError(
          `Scheduled occurrence ${occurrence.id} references an invalid event definition`,
        );
      }
      if ([...this.scheduledOccurrenceMap.values()].some(
        (candidate) =>
          candidate.storyWorldId === occurrence.storyWorldId &&
          candidate.occurrenceKey === occurrence.occurrenceKey,
      )) {
        throw new TypeError(`Duplicate scheduled occurrence key: ${occurrence.occurrenceKey}`);
      }
      addUnique(this.scheduledOccurrenceMap, copyOccurrence(occurrence), "scheduledOccurrence");
    }
    for (const plan of seed.characterPlans ?? []) {
      assertPlanReferences(plan, this.worldMap, this.characterMap);
      addUnique(this.characterPlanMap, copyPlan(plan), "characterPlan");
    }
    for (const budget of seed.proactiveMessageBudgets ?? []) {
      assertBudgetReferences(budget, this.worldMap, this.characterMap);
      addUnique(this.proactiveMessageBudgetMap, copyBudget(budget), "proactiveMessageBudget");
    }
    for (const execution of seed.eventExecutions ?? []) {
      assertExecutionReferences(
        execution,
        this.worldEventDefinitionMap,
        this.scheduledOccurrenceMap,
        this.worldMap,
        this.characterMap,
      );
      if ([...this.eventExecutionMap.values()].some(
        (candidate) =>
          candidate.occurrenceId === execution.occurrenceId &&
          candidate.attempt === execution.attempt,
      )) {
        throw new TypeError(`Duplicate event execution attempt: ${execution.occurrenceId}:${execution.attempt}`);
      }
      addUnique(this.eventExecutionMap, copyExecution(execution), "eventExecution");
    }
    for (const action of seed.behaviorActions ?? []) {
      assertActionReferences(action, this.eventExecutionMap, this.characterMap);
      addUnique(this.behaviorActionMap, copyAction(action), "behaviorAction");
    }
    for (const draft of seed.momentDrafts ?? []) {
      assertMomentDraftReferences(
        draft,
        this.behaviorActionMap,
        this.eventExecutionMap,
        this.characterMap,
      );
      addUnique(this.momentDraftMap, copyMomentDraft(draft), "momentDraft");
    }
    for (const job of seed.imageJobs ?? []) {
      assertImageReferences(
        job,
        this.behaviorActionMap,
        this.eventExecutionMap,
        this.characterMap,
        this.momentDraftMap,
      );
      addUnique(this.imageJobMap, copyImageJob(job), "imageJob");
    }
    for (const moment of seed.moments ?? []) {
      assertMomentReferences(moment, this.worldMap, this.characterMap);
      addUnique(this.momentMap, copyMoment(moment), "moment");
    }
    for (const interaction of seed.momentInteractions ?? []) {
      assertMomentInteractionReferences(interaction, this.momentMap, this.characterMap);
      const duplicateKey = [...this.momentInteractionMap.values()].some(
        (candidate) =>
          candidate.momentId === interaction.momentId &&
          candidate.idempotencyKey === interaction.idempotencyKey,
      );
      if (duplicateKey) {
        throw new TypeError(`Duplicate moment interaction idempotency key: ${interaction.idempotencyKey}`);
      }
addUnique(this.momentInteractionMap, copyMomentInteraction(interaction), "momentInteraction");
}
for (const settings of seed.appearanceSettings ?? []) {
assertAppearanceSettings(settings);
if (this.findOwnerKeyConflict(settings)) {
throw new TypeError(`Duplicate appearance settings owner key: ${settings.ownerKey}`);
}

addUnique(this.appearanceSettingsMap, copyAppearanceSettings(settings), "appearanceSettings");
}
for (const profile of seed.llmProviderProfiles ?? []) {
assertLlmProviderProfile(profile);
if (profile.isActive && [...this.llmProviderProfileMap.values()].some((candidate) => candidate.isActive)) {
throw new TypeError("Only one LLM provider profile can be active");
}
addUnique(this.llmProviderProfileMap, copyLlmProviderProfile(profile), "llmProviderProfile");
}
if (seed.comfyUiSettings !== undefined) {
assertComfyUiSettings(seed.comfyUiSettings);
if (seed.comfyUiSettings.id !== "default") throw new TypeError("ComfyUI settings id must be default");
this.comfyUiSettingsMap.set("default", copyComfyUiSettings(seed.comfyUiSettings));
}

this.storyWorlds = {
      list: async () => [...this.worldMap.values()].map(copyWorld),
      getById: async (id) => {
        const world = this.worldMap.get(id);
        return world ? copyWorld(world) : undefined;
      },
      save: async (world) => {
        this.worldMap.set(world.id, copyWorld(world));
      },
    };

    this.characters = {
      listByStoryWorld: async (storyWorldId) =>
        [...this.characterMap.values()]
          .filter(
            (character) =>
              storyWorldId === undefined || character.storyWorldId === storyWorldId,
          )
          .map(copyCharacter),
      getById: async (id) => {
        const character = this.characterMap.get(id);
        return character ? copyCharacter(character) : undefined;
      },
      save: async (character) => {
        this.characterMap.set(character.id, copyCharacter(character));
      },
    };

    this.relationshipEdges = {
      listByStoryWorld: async (storyWorldId) =>
        [...this.relationshipEdgeMap.values()]
          .filter((edge) => edge.storyWorldId === storyWorldId)
          .map(copyEdge),
      getById: async (id) => {
        const edge = this.relationshipEdgeMap.get(id);
        return edge ? copyEdge(edge) : undefined;
      },
      save: async (edge) => {
        assertEdgeReferences(edge, this.worldMap, this.characterMap);
        this.relationshipEdgeMap.set(edge.id, copyEdge(edge));
      },
    };

    this.actorSessions = {
      getById: async (id) => {
        const session = this.actorSessionMap.get(id);
        return session ? copySession(session) : undefined;
      },
      save: async (session) => {
        assertSessionReferences(session, this.worldMap, this.characterMap);
        this.actorSessionMap.set(session.id, copySession(session));
      },
    };

    this.conversations = {
      listByCharacter: async (characterId) =>
        [...this.conversationMap.values()]
          .filter((aggregate) =>
            aggregate.members.some(
              (member) => member.characterId === characterId && member.leftAt === undefined,
            ),
          )
          .map(copyConversation),
      getById: async (id) => {
        const aggregate = this.conversationMap.get(id);
        return aggregate ? copyConversation(aggregate) : undefined;
      },
      save: async (conversation) => {
        assertConversationReferences(conversation, this.worldMap, this.characterMap);
        if (this.conversationMap.has(conversation.conversation.id)) {
          throw new TypeError(`Duplicate conversation id: ${conversation.conversation.id}`);
        }
        this.conversationMap.set(
          conversation.conversation.id,
          copyConversation(conversation),
        );
      },
    };

    this.messages = {
      listByConversation: async (conversationId) =>
        [...this.messageMap.values()]
          .filter((message) => message.conversationId === conversationId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(copyMessage),
      save: async (message) => this.saveMessage(message),
    };

    this.memories = {
      listForCharacter: async (storyWorldId, readerCharacterId) =>
        [...this.memoryMap.values()]
          .filter(
            (memory) =>
              memory.storyWorldId === storyWorldId &&
              isMemoryVisibleTo(memory, readerCharacterId),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .map(copyMemory),
      search: async (query: MemorySearchQuery) => {
        if (!Number.isSafeInteger(query.limit ?? 20) || (query.limit ?? 20) < 1) {
          throw new TypeError("memory search limit must be a positive integer");
        }
        if (query.queryText.trim().length === 0) {
          throw new TypeError("memory search queryText must be non-empty");
        }
        return [...this.memoryMap.values()]
          .filter(
            (memory) =>
              memory.storyWorldId === query.storyWorldId &&
              isMemoryVisibleTo(memory, query.readerCharacterId),
          )
          .map((memory) => ({ memory, score: scoreMemory(memory, query.queryText) }))
          .filter((result) => result.score > 0)
          .sort(
            (left, right) =>
              right.score - left.score ||
              right.memory.createdAt.localeCompare(left.memory.createdAt) ||
              left.memory.id.localeCompare(right.memory.id),
          )
          .slice(0, query.limit ?? 20)
          .map((result) => ({ memory: copyMemory(result.memory), score: result.score }));
      },
      save: async (memory) => {
        assertMemoryReferences(memory, this.worldMap, this.characterMap);
        addUnique(this.memoryMap, copyMemory(memory), "memory");
      },
    };

    this.worldEventDefinitions = {
      listByStoryWorld: async (storyWorldId) =>
        [...this.worldEventDefinitionMap.values()]
          .filter((definition) => definition.storyWorldId === storyWorldId)
          .sort((left, right) => left.id.localeCompare(right.id))
          .map(copyEventDefinition),
      getById: async (id) => {
        const definition = this.worldEventDefinitionMap.get(id);
        return definition ? copyEventDefinition(definition) : undefined;
      },
      save: async (definition) => {
        assertEventDefinitionReferences(definition, this.worldMap, this.characterMap);
        const existing = this.worldEventDefinitionMap.get(definition.id);
        if (existing && existing.eventKey !== definition.eventKey) {
          throw new TypeError(`Event definition id cannot change eventKey: ${definition.id}`);
        }
        this.worldEventDefinitionMap.set(definition.id, copyEventDefinition(definition));
      },
    };

    this.worldLoreEntries = {
      listByStoryWorld: async (storyWorldId) =>
        [...this.worldLoreEntryMap.values()]
          .filter((entry) => entry.storyWorldId === storyWorldId)
          .sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
          )
          .map(copyWorldLoreEntry),
      getById: async (id) => {
        const entry = this.worldLoreEntryMap.get(id);
        return entry ? copyWorldLoreEntry(entry) : undefined;
      },
      search: async (storyWorldId, queryText) => {
        if (queryText.trim().length === 0) {
          throw new TypeError("world lore search queryText must be non-empty");
        }
        const terms = queryText.toLocaleLowerCase().trim().split(/\s+/u);
        return [...this.worldLoreEntryMap.values()]
          .filter((entry) => entry.storyWorldId === storyWorldId && entry.isEnabled)
          .map((entry) => {
            const searchable = [entry.title, entry.content, ...entry.tags]
              .join(" ")
              .toLocaleLowerCase();
            const matchedTerms = terms.filter((term) => searchable.includes(term)).length;
            return { entry, matchedTerms };
          })
          .filter(({ matchedTerms }) => matchedTerms > 0)
          .sort((left, right) =>
            right.matchedTerms - left.matchedTerms ||
            right.entry.updatedAt.localeCompare(left.entry.updatedAt) ||
            left.entry.id.localeCompare(right.entry.id)
          )
          .map(({ entry }) => copyWorldLoreEntry(entry));
      },
      save: async (entry) => {
        assertWorldLoreEntryReferences(entry, this.worldMap);
        this.worldLoreEntryMap.set(entry.id, copyWorldLoreEntry(entry));
      },
      delete: async (id) => {
        this.worldLoreEntryMap.delete(id);
      },
    };

    this.scheduledOccurrences = {
      getById: async (id) => {
        const occurrence = this.scheduledOccurrenceMap.get(id);
        return occurrence ? copyOccurrence(occurrence) : undefined;
      },
      getByOccurrenceKey: async (storyWorldId, occurrenceKey) => {
        const occurrence = [...this.scheduledOccurrenceMap.values()].find(
          (candidate) =>
            candidate.storyWorldId === storyWorldId &&
            candidate.occurrenceKey === occurrenceKey,
        );
        return occurrence ? copyOccurrence(occurrence) : undefined;
      },
      listPending: async (storyWorldId, scheduledBefore, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        if (Number.isNaN(Date.parse(scheduledBefore))) {
          throw new TypeError("scheduledBefore must be a valid ISO timestamp");
        }
        return [...this.scheduledOccurrenceMap.values()]
          .filter(
            (occurrence) =>
              occurrence.storyWorldId === storyWorldId &&
              occurrence.status === "PENDING" &&
              Date.parse(occurrence.scheduledFor) <= Date.parse(scheduledBefore),
          )
          .sort(
            (left, right) =>
              left.scheduledFor.localeCompare(right.scheduledFor) ||
              left.id.localeCompare(right.id),
          )
          .slice(0, limit)
          .map(copyOccurrence);
      },
      listForCreatorScan: async (storyWorldId, horizonEnd, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        const horizonEndMs = Date.parse(horizonEnd);
        if (Number.isNaN(horizonEndMs)) {
          throw new TypeError("horizonEnd must be a valid ISO timestamp");
        }
        return [...this.scheduledOccurrenceMap.values()]
          .filter((occurrence) =>
            occurrence.storyWorldId === storyWorldId &&
            occurrence.status !== "COMPLETED" &&
            occurrence.status !== "CANCELLED" &&
            Date.parse(occurrence.scheduledFor) <= horizonEndMs
          )
          .sort((left, right) =>
            left.scheduledFor.localeCompare(right.scheduledFor) ||
            left.id.localeCompare(right.id)
          )
          .slice(0, limit)
          .map(copyOccurrence);
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
        return [...this.scheduledOccurrenceMap.values()]
          .filter((occurrence) => {
            const scheduledFor = Date.parse(occurrence.scheduledFor);
            return occurrence.storyWorldId === storyWorldId &&
              scheduledFor >= startsAtMs && scheduledFor < endsAtMs;
          })
          .sort(
            (left, right) =>
              left.scheduledFor.localeCompare(right.scheduledFor) ||
              left.id.localeCompare(right.id),
          )
          .slice(0, limit)
          .map(copyOccurrence);
      },
      save: async (occurrence): Promise<ScheduledOccurrenceWriteResult> => {
        assertScheduledOccurrence(occurrence);
        const definition = this.worldEventDefinitionMap.get(occurrence.definitionId);
        if (
          !definition ||
          definition.storyWorldId !== occurrence.storyWorldId ||
          definition.eventKey !== occurrence.eventKey ||
          definition.timezone !== occurrence.timezone
        ) {
          throw new TypeError(
            `Scheduled occurrence ${occurrence.id} references an invalid event definition`,
          );
        }
        const existingById = this.scheduledOccurrenceMap.get(occurrence.id);
        if (existingById && existingById.occurrenceKey !== occurrence.occurrenceKey) {
          throw new TypeError(`Scheduled occurrence id conflict: ${occurrence.id}`);
        }
        const existing = [...this.scheduledOccurrenceMap.values()].find(
          (candidate) =>
            candidate.storyWorldId === occurrence.storyWorldId &&
            candidate.occurrenceKey === occurrence.occurrenceKey,
        );
        if (existing) return { occurrence: copyOccurrence(existing), inserted: false };
        this.scheduledOccurrenceMap.set(occurrence.id, copyOccurrence(occurrence));
        return { occurrence: copyOccurrence(occurrence), inserted: true };
      },
      update: async (occurrence) => {
        assertScheduledOccurrence(occurrence);
        const existing = this.scheduledOccurrenceMap.get(occurrence.id);
        if (!existing) throw new TypeError(`Unknown scheduled occurrence: ${occurrence.id}`);
        const definition = this.worldEventDefinitionMap.get(occurrence.definitionId);
        if (
          !definition ||
          definition.storyWorldId !== occurrence.storyWorldId ||
          definition.eventKey !== occurrence.eventKey ||
          definition.timezone !== occurrence.timezone
        ) {
          throw new TypeError(
            `Scheduled occurrence ${occurrence.id} references an invalid event definition`,
          );
        }
        if (
          existing.definitionId !== occurrence.definitionId ||
          existing.storyWorldId !== occurrence.storyWorldId ||
          existing.occurrenceKey !== occurrence.occurrenceKey
        ) {
          throw new TypeError(`Scheduled occurrence identity cannot change: ${occurrence.id}`);
        }
        this.scheduledOccurrenceMap.set(occurrence.id, copyOccurrence(occurrence));
      },
    };

    this.characterPlans = {
      listActive: async (characterId, at) =>
        [...this.characterPlanMap.values()]
          .filter((plan) => plan.characterId === characterId && isPlanActiveAt(plan, at))
          .sort(
            (left, right) =>
              left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id),
          )
          .map(copyPlan),
      save: async (plan) => {
        assertPlanReferences(plan, this.worldMap, this.characterMap);
        this.characterPlanMap.set(plan.id, copyPlan(plan));
      },
    };

    this.proactiveMessageBudgets = {
      getActive: async (storyWorldId, characterId, at) => {
        const budget = [...this.proactiveMessageBudgetMap.values()].find(
          (candidate) =>
            candidate.storyWorldId === storyWorldId &&
            candidate.characterId === characterId &&
            isBudgetActiveAt(candidate, at),
        );
        return budget ? copyBudget(budget) : undefined;
      },
      save: async (budget) => {
        assertBudgetReferences(budget, this.worldMap, this.characterMap);
        this.proactiveMessageBudgetMap.set(budget.id, copyBudget(budget));
      },
    };

    this.eventExecutions = {
      getById: async (id) => {
        const execution = this.eventExecutionMap.get(id);
        return execution ? copyExecution(execution) : undefined;
      },
      getLatestByOccurrence: async (occurrenceId) => {
        const execution = [...this.eventExecutionMap.values()]
          .filter((candidate) => candidate.occurrenceId === occurrenceId)
          .sort((left, right) => right.attempt - left.attempt || right.id.localeCompare(left.id))[0];
        return execution ? copyExecution(execution) : undefined;
      },
      save: async (execution) => {
        assertExecutionReferences(
          execution,
          this.worldEventDefinitionMap,
          this.scheduledOccurrenceMap,
          this.worldMap,
          this.characterMap,
        );
        const duplicateAttempt = [...this.eventExecutionMap.values()].find(
          (candidate) =>
            candidate.occurrenceId === execution.occurrenceId &&
            candidate.attempt === execution.attempt &&
            candidate.id !== execution.id,
        );
        if (duplicateAttempt) {
          throw new TypeError(
            `Duplicate event execution attempt: ${execution.occurrenceId}:${execution.attempt}`,
          );
        }
        this.eventExecutionMap.set(execution.id, copyExecution(execution));
      },
    };

    this.behaviorActions = {
      getById: async (id) => {
        const action = this.behaviorActionMap.get(id);
        return action ? copyAction(action) : undefined;
      },
      listByExecution: async (executionId) =>
        [...this.behaviorActionMap.values()]
          .filter((action) => action.executionId === executionId)
          .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
          .map(copyAction),
      save: async (action) => {
        assertActionReferences(action, this.eventExecutionMap, this.characterMap);
        this.behaviorActionMap.set(action.id, copyAction(action));
      },
    };

    this.momentDrafts = {
      getById: async (id) => {
        const draft = this.momentDraftMap.get(id);
        return draft ? copyMomentDraft(draft) : undefined;
      },
      getByActionId: async (actionId) => {
        const draft = [...this.momentDraftMap.values()].find(
          (candidate) => candidate.actionId === actionId,
        );
        return draft ? copyMomentDraft(draft) : undefined;
      },
      save: async (draft) => {
        assertMomentDraftReferences(
          draft,
          this.behaviorActionMap,
          this.eventExecutionMap,
          this.characterMap,
        );
        const existing = [...this.momentDraftMap.values()].find(
          (candidate) => candidate.actionId === draft.actionId && candidate.id !== draft.id,
        );
        if (existing) throw new TypeError(`Duplicate moment draft action: ${draft.actionId}`);
        this.momentDraftMap.set(draft.id, copyMomentDraft(draft));
      },
    };

    this.imageJobs = {
      getById: async (id) => {
        const job = this.imageJobMap.get(id);
        return job ? copyImageJob(job) : undefined;
      },
      getByActionId: async (actionId) => {
        const job = [...this.imageJobMap.values()].find(
          (candidate) => candidate.actionId === actionId,
        );
        return job ? copyImageJob(job) : undefined;
      },
      listQueued: async (limit = 100) => {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
        return [...this.imageJobMap.values()]
          .filter((candidate) => candidate.status === "QUEUED")
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
          .slice(0, limit)
          .map(copyImageJob);
      },
      listSubmitted: async (limit = 100) => {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
        return [...this.imageJobMap.values()]
          .filter((candidate) => candidate.status === "SUBMITTED")
          .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
          .slice(0, limit)
          .map(copyImageJob);
      },
      save: async (job) => {
        assertImageReferences(
          job,
          this.behaviorActionMap,
          this.eventExecutionMap,
          this.characterMap,
          this.momentDraftMap,
        );
        const existing = [...this.imageJobMap.values()].find(
          (candidate) => candidate.actionId === job.actionId && candidate.id !== job.id,
        );
        if (existing) throw new TypeError(`Duplicate image job action: ${job.actionId}`);
        this.imageJobMap.set(job.id, copyImageJob(job));
      },
    };

    this.characterVisualIdentities = {
      getById: async (id) => {
        const identity = this.characterVisualIdentityMap.get(id);
        return identity ? copyCharacterVisualIdentity(identity) : undefined;
      },
      getByCharacterId: async (characterId) => {
        const identity = [...this.characterVisualIdentityMap.values()].find(
          (candidate) => candidate.characterId === characterId,
        );
        return identity ? copyCharacterVisualIdentity(identity) : undefined;
      },
      save: async (identity) => {
        assertVisualIdentityReferences(identity, this.worldMap, this.characterMap);
        const existing = [...this.characterVisualIdentityMap.values()].find(
          (candidate) => candidate.characterId === identity.characterId && candidate.id !== identity.id,
        );
        if (existing) throw new TypeError(`Duplicate visual identity character: ${identity.characterId}`);
        this.characterVisualIdentityMap.set(identity.id, copyCharacterVisualIdentity(identity));
      },
    };

    this.imageWorkflowTemplates = {
      getById: async (id, version) => {
        const template = this.imageWorkflowTemplateMap.get(`${id}@${version}`);
        return template ? copyImageWorkflowTemplate(template) : undefined;
      },
      list: async () => [...this.imageWorkflowTemplateMap.values()]
        .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
        .map(copyImageWorkflowTemplate),
      save: async (template) => {
        assertImageWorkflowTemplate(template);
        this.imageWorkflowTemplateMap.set(
          `${template.id}@${template.version}`,
          copyImageWorkflowTemplate(template),
        );
      },
    };

    this.stickerPacks = {
      listByStoryWorld: async (storyWorldId) => [...this.stickerPackMap.values()]
        .filter((pack) => pack.storyWorldId === storyWorldId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(copyStickerPack),
      getById: async (id) => {
        const pack = this.stickerPackMap.get(id);
        return pack ? copyStickerPack(pack) : undefined;
      },
      save: async (pack) => {
        assertStickerPack(pack);
        this.stickerPackMap.set(pack.id, copyStickerPack(pack));
      },
    };

    this.stickers = {
      listByPack: async (packId) => [...this.stickerMap.values()]
        .filter((sticker) => sticker.packId === packId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(copySticker),
      getById: async (id) => {
        const sticker = this.stickerMap.get(id);
        return sticker ? copySticker(sticker) : undefined;
      },
      save: async (sticker) => {
        assertSticker(sticker);
        const pack = this.stickerPackMap.get(sticker.packId);
        if (!pack || pack.storyWorldId !== sticker.storyWorldId) {
          throw new TypeError(`Sticker ${sticker.id} references an invalid pack`);
        }
        this.stickerMap.set(sticker.id, copySticker(sticker));
      },
    };

    this.moments = {
      getById: async (id) => {
        const moment = this.momentMap.get(id);
        return moment ? copyMoment(moment) : undefined;
      },
      listFeed: async (storyWorldId, readerCharacterId, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("moment feed limit must be a positive integer");
        }
        return [...this.momentMap.values()]
          .filter(
            (moment) =>
              moment.storyWorldId === storyWorldId &&
              isMomentVisibleTo(moment, readerCharacterId),
          )
          .sort(
            (left, right) =>
              right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id),
          )
          .slice(0, limit)
          .map(copyMoment);
      },
      save: async (moment) => {
        assertMomentReferences(moment, this.worldMap, this.characterMap);
        this.momentMap.set(moment.id, copyMoment(moment));
      },
    };

    this.momentInteractions = {
      listByMoment: async (momentId) =>
        [...this.momentInteractionMap.values()]
          .filter((interaction) => interaction.momentId === momentId)
          .sort(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
          .map(copyMomentInteraction),
      save: async (interaction): Promise<MomentInteractionWriteResult> => {
        assertMomentInteractionReferences(interaction, this.momentMap, this.characterMap);
        const existing = [...this.momentInteractionMap.values()].find(
          (candidate) =>
            candidate.momentId === interaction.momentId &&
            candidate.idempotencyKey === interaction.idempotencyKey,
        );
        if (existing) {
          if (
            existing.kind !== interaction.kind ||
            existing.actorCharacterId !== interaction.actorCharacterId ||
            existing.text !== interaction.text
          ) {
            throw new TypeError(
              `Moment interaction idempotency key conflict: ${interaction.idempotencyKey}`,
            );
          }
          return { interaction: copyMomentInteraction(existing), inserted: false };
        }
        if (
          interaction.kind === "LIKE" &&
          [...this.momentInteractionMap.values()].some(
            (candidate) =>
              candidate.momentId === interaction.momentId &&
              candidate.actorCharacterId === interaction.actorCharacterId &&
              candidate.kind === "LIKE",
          )
        ) {
          throw new TypeError("Character has already liked this moment");
        }
        if (this.momentInteractionMap.has(interaction.id)) {
          throw new TypeError(`Duplicate momentInteraction id: ${interaction.id}`);
        }
this.momentInteractionMap.set(interaction.id, copyMomentInteraction(interaction));
return { interaction: copyMomentInteraction(interaction), inserted: true };
},
};

this.appearanceSettings = {
getByOwnerKey: async (ownerKey) => {
const settings = [...this.appearanceSettingsMap.values()].find(
(candidate) => candidate.ownerKey === ownerKey,
);
return settings ? copyAppearanceSettings(settings) : undefined;
},
save: async (settings) => {
assertAppearanceSettings(settings);
const conflict = this.findOwnerKeyConflict(settings);
if (conflict) {
throw new TypeError(`Duplicate appearance settings owner key: ${settings.ownerKey}`);
}
this.appearanceSettingsMap.set(settings.id, copyAppearanceSettings(settings));
},
};

this.llmProviderProfiles = {
list: async () => [...this.llmProviderProfileMap.values()].sort((left, right) => left.id.localeCompare(right.id)).map(copyLlmProviderProfile),
getById: async (id) => {
const profile = this.llmProviderProfileMap.get(id);
return profile ? copyLlmProviderProfile(profile) : undefined;
},
getActive: async () => {
const profile = [...this.llmProviderProfileMap.values()].find((candidate) => candidate.isActive);
return profile ? copyLlmProviderProfile(profile) : undefined;
},
save: async (profile) => {
assertLlmProviderProfile(profile);
if (profile.isActive) {
for (const [id, candidate] of this.llmProviderProfileMap.entries()) {
if (id !== profile.id && candidate.isActive) {
this.llmProviderProfileMap.set(id, copyLlmProviderProfile({ ...candidate, isActive: false, updatedAt: profile.updatedAt }));
}
}
}
this.llmProviderProfileMap.set(profile.id, copyLlmProviderProfile(profile));
},
delete: async (id) => { this.llmProviderProfileMap.delete(id); },
};

this.comfyUiSettings = {
get: async () => {
const settings = this.comfyUiSettingsMap.get("default");
return settings ? copyComfyUiSettings(settings) : undefined;
},
save: async (settings) => {
assertComfyUiSettings(settings);
if (settings.id !== "default") throw new TypeError("ComfyUI settings id must be default");
this.comfyUiSettingsMap.set("default", copyComfyUiSettings(settings));
},
};
}

private findOwnerKeyConflict(settings: AppearanceSettings): boolean {
return [...this.appearanceSettingsMap.values()].some(
(candidate) => candidate.ownerKey === settings.ownerKey && candidate.id !== settings.id,
);
}

private saveMessageSeed(message: Message): void {
    this.saveMessage(message);
  }

  private saveMessage(message: Message): MessageWriteResult {
    const conversation = this.conversationMap.get(message.conversationId);
    if (!conversation) {
      throw new TypeError(`Message ${message.id} references an unknown conversation`);
    }
    const author = message.authorCharacterId === undefined
      ? undefined
      : this.characterMap.get(message.authorCharacterId);
    const validated = createMessage(messagePayloadInput(message, conversation, author));
    const existing = [...this.messageMap.values()].find(
      (candidate) =>
        candidate.conversationId === message.conversationId &&
        candidate.idempotencyKey === message.idempotencyKey,
    );
    if (existing) {
      if (!sameMessage(existing, validated)) {
        throw new TypeError(
          `Message idempotency key conflict: ${message.idempotencyKey}`,
        );
      }
      return { message: copyMessage(existing), inserted: false };
    }
    if (this.messageMap.has(message.id)) {
      throw new TypeError(`Duplicate message id: ${message.id}`);
    }
    this.messageMap.set(message.id, copyMessage(validated));
    return { message: copyMessage(validated), inserted: true };
  }
}

export function createInMemoryRepositories(
  seed: InMemoryRepositorySeed = {},
): DomainRepositories {
  return new InMemoryRepositories(seed);
}
