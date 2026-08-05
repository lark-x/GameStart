import type {
  ActorSession,
  CharacterPlan,
  Character,
  ConversationAggregate,
  BehaviorAction,
  EventExecution,
  ImageJob,
  MomentDraft,
  Moment,
  MomentInteraction,
  CharacterVisualIdentity,
  ImageWorkflowTemplate,
  Sticker,
  StickerPack,
  ProactiveMessageBudget,
  ScheduledOccurrence,
  MemoryItem,
  MemorySearchQuery,
  MemorySearchResult,
  Message,
  RelationshipEdge,
  StoryWorld,
  WorldEventDefinition,
} from "../../domain/src/index.ts";
import type { OutboxEventRepository } from "./outbox.ts";

export interface StoryWorldRepository {
  list(): Promise<readonly StoryWorld[]>;
  getById(id: string): Promise<StoryWorld | undefined>;
}

export interface CharacterRepository {
  listByStoryWorld(storyWorldId?: string): Promise<readonly Character[]>;
  getById(id: string): Promise<Character | undefined>;
}

export interface RelationshipEdgeRepository {
  listByStoryWorld(storyWorldId: string): Promise<readonly RelationshipEdge[]>;
  getById(id: string): Promise<RelationshipEdge | undefined>;
  save(edge: RelationshipEdge): Promise<void>;
}

export interface ActorSessionRepository {
  getById(id: string): Promise<ActorSession | undefined>;
  save(session: ActorSession): Promise<void>;
}

export interface ConversationRepository {
  listByCharacter(characterId: string): Promise<readonly ConversationAggregate[]>;
  getById(id: string): Promise<ConversationAggregate | undefined>;
  save(conversation: ConversationAggregate): Promise<void>;
}

export interface MessageWriteResult {
  message: Message;
  inserted: boolean;
}

export interface MessageRepository {
  listByConversation(conversationId: string): Promise<readonly Message[]>;
  save(message: Message): Promise<MessageWriteResult>;
}

export interface MemoryRepository {
  listForCharacter(
    storyWorldId: string,
    readerCharacterId: string,
  ): Promise<readonly MemoryItem[]>;
  search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]>;
  save(memory: MemoryItem): Promise<void>;
}

export interface WorldEventDefinitionRepository {
  listByStoryWorld(storyWorldId: string): Promise<readonly WorldEventDefinition[]>;
  getById(id: string): Promise<WorldEventDefinition | undefined>;
  save(definition: WorldEventDefinition): Promise<void>;
}

export interface ScheduledOccurrenceWriteResult {
  occurrence: ScheduledOccurrence;
  inserted: boolean;
}

export interface ScheduledOccurrenceRepository {
  getById(id: string): Promise<ScheduledOccurrence | undefined>;
  getByOccurrenceKey(
    storyWorldId: string,
    occurrenceKey: string,
  ): Promise<ScheduledOccurrence | undefined>;
  listPending(
    storyWorldId: string,
    scheduledBefore: string,
    limit: number,
  ): Promise<readonly ScheduledOccurrence[]>;
  listByWindow(
    storyWorldId: string,
    startsAt: string,
    endsAt: string,
    limit: number,
  ): Promise<readonly ScheduledOccurrence[]>;
  save(occurrence: ScheduledOccurrence): Promise<ScheduledOccurrenceWriteResult>;
  update(occurrence: ScheduledOccurrence): Promise<void>;
}

export interface CharacterPlanRepository {
  listActive(characterId: string, at: string): Promise<readonly CharacterPlan[]>;
  save(plan: CharacterPlan): Promise<void>;
}

export interface EventExecutionRepository {
  getById(id: string): Promise<EventExecution | undefined>;
  getLatestByOccurrence(occurrenceId: string): Promise<EventExecution | undefined>;
  save(execution: EventExecution): Promise<void>;
}

export interface ProactiveMessageBudgetRepository {
  getActive(
    storyWorldId: string,
    characterId: string,
    at: string,
  ): Promise<ProactiveMessageBudget | undefined>;
  save(budget: ProactiveMessageBudget): Promise<void>;
}

export interface BehaviorActionRepository {
  getById(id: string): Promise<BehaviorAction | undefined>;
  listByExecution(executionId: string): Promise<readonly BehaviorAction[]>;
  save(action: BehaviorAction): Promise<void>;
}

export interface MomentDraftRepository {
  getById(id: string): Promise<MomentDraft | undefined>;
  getByActionId(actionId: string): Promise<MomentDraft | undefined>;
  save(draft: MomentDraft): Promise<void>;
}

export interface ImageJobRepository {
  getById(id: string): Promise<ImageJob | undefined>;
  getByActionId(actionId: string): Promise<ImageJob | undefined>;
  save(job: ImageJob): Promise<void>;
}

export interface CharacterVisualIdentityRepository {
  getById(id: string): Promise<CharacterVisualIdentity | undefined>;
  getByCharacterId(characterId: string): Promise<CharacterVisualIdentity | undefined>;
  save(identity: CharacterVisualIdentity): Promise<void>;
}

export interface ImageWorkflowTemplateRepository {
  getById(id: string, version: string): Promise<ImageWorkflowTemplate | undefined>;
  list(): Promise<readonly ImageWorkflowTemplate[]>;
  save(template: ImageWorkflowTemplate): Promise<void>;
}

export interface StickerPackRepository {
  listByStoryWorld(storyWorldId: string): Promise<readonly StickerPack[]>;
  getById(id: string): Promise<StickerPack | undefined>;
  save(pack: StickerPack): Promise<void>;
}

export interface StickerRepository {
  listByPack(packId: string): Promise<readonly Sticker[]>;
  getById(id: string): Promise<Sticker | undefined>;
  save(sticker: Sticker): Promise<void>;
}

export interface MomentRepository {
  getById(id: string): Promise<Moment | undefined>;
  listFeed(
    storyWorldId: string,
    readerCharacterId: string,
    limit: number,
  ): Promise<readonly Moment[]>;
  save(moment: Moment): Promise<void>;
}

export interface MomentInteractionWriteResult {
  interaction: MomentInteraction;
  inserted: boolean;
}

export interface MomentInteractionRepository {
  listByMoment(momentId: string): Promise<readonly MomentInteraction[]>;
  save(interaction: MomentInteraction): Promise<MomentInteractionWriteResult>;
}

export interface DomainRepositories {
  readonly storyWorlds: StoryWorldRepository;
  readonly characters: CharacterRepository;
  readonly relationshipEdges: RelationshipEdgeRepository;
  readonly actorSessions: ActorSessionRepository;
  readonly conversations?: ConversationRepository;
  readonly messages?: MessageRepository;
  readonly memories?: MemoryRepository;
  readonly worldEventDefinitions?: WorldEventDefinitionRepository;
  readonly scheduledOccurrences?: ScheduledOccurrenceRepository;
  readonly characterPlans?: CharacterPlanRepository;
  readonly eventExecutions?: EventExecutionRepository;
  readonly proactiveMessageBudgets?: ProactiveMessageBudgetRepository;
  readonly behaviorActions?: BehaviorActionRepository;
  readonly momentDrafts?: MomentDraftRepository;
  readonly imageJobs?: ImageJobRepository;
  readonly characterVisualIdentities?: CharacterVisualIdentityRepository;
  readonly imageWorkflowTemplates?: ImageWorkflowTemplateRepository;
  readonly stickerPacks?: StickerPackRepository;
  readonly stickers?: StickerRepository;
  readonly moments?: MomentRepository;
  readonly momentInteractions?: MomentInteractionRepository;
  readonly outboxEvents?: OutboxEventRepository;
}

export interface InMemoryRepositorySeed {
  worlds?: readonly StoryWorld[];
  characters?: readonly Character[];
  relationshipEdges?: readonly RelationshipEdge[];
  actorSessions?: readonly ActorSession[];
  conversations?: readonly ConversationAggregate[];
  messages?: readonly Message[];
  memories?: readonly MemoryItem[];
  worldEventDefinitions?: readonly WorldEventDefinition[];
  scheduledOccurrences?: readonly ScheduledOccurrence[];
  characterPlans?: readonly CharacterPlan[];
  eventExecutions?: readonly EventExecution[];
  proactiveMessageBudgets?: readonly ProactiveMessageBudget[];
  behaviorActions?: readonly BehaviorAction[];
  momentDrafts?: readonly MomentDraft[];
  imageJobs?: readonly ImageJob[];
  characterVisualIdentities?: readonly CharacterVisualIdentity[];
  imageWorkflowTemplates?: readonly ImageWorkflowTemplate[];
  stickerPacks?: readonly StickerPack[];
  stickers?: readonly Sticker[];
  moments?: readonly Moment[];
  momentInteractions?: readonly MomentInteraction[];
}
