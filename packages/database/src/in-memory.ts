import type { DomainRepositories, InMemoryRepositorySeed } from "./repositories.ts";
import { createInMemoryDispatchRequestRepository, type DispatchRequestRepository } from "./dispatch.ts";
import { createWorldContextPolicyRepo, createStoryGenerationJobRepo, createStoryGenerationCandidateRepo } from "./in-memory/story-generation.ts";
import { createRelationshipChangeCandidateRepo, createRelationshipEventRepo } from "./in-memory/relationship-feedback.ts";
import { createSocialFeedEventRepo } from "./in-memory/social-feed.ts";
import { createAppearanceSettingsRepo, createLlmProviderProfileRepo, createComfyUiSettingsRepo } from "./in-memory/settings.ts";
import { createStoryWorldRepo, createCharacterRepo, createRelationshipEdgeRepo, createActorSessionRepo } from "./in-memory/core.ts";
import { createWorldLoreEntryRepo, createStoryArcRepo, createStoryNodeRepo, createStoryEdgeRepo, createPromptTemplateRepo, createMemoryCandidateRepo } from "./in-memory/story-content.ts";
import { createWorldEventDefinitionRepo, createScheduledOccurrenceRepo, createCharacterPlanRepo, createProactiveMessageBudgetRepo, createEventExecutionRepo, createBehaviorActionRepo } from "./in-memory/events.ts";
import { createMomentDraftRepo, createImageJobRepo, createCharacterVisualIdentityRepo, createImageWorkflowTemplateRepo, createStickerPackRepo, createStickerRepo, createMomentRepo, createMomentInteractionRepo } from "./in-memory/media.ts";
import { createConversationRepo, createMessageRepo, createMemoryRepo, saveMessageSeed } from "./in-memory/chat.ts";
import {
  seedWorlds, seedCharacters, seedVisualIdentities, seedImageWorkflowTemplates,
  seedStickerPacks, seedStickers, seedRelationshipEdges, seedActorSessions,
  seedConversations, seedMemories, seedStoryArcs, seedStoryNodes, seedStoryEdges,
  seedPromptTemplates, seedMemoryCandidates, seedWorldEventDefinitions, seedWorldLoreEntries,
  seedScheduledOccurrences, seedCharacterPlans, seedProactiveMessageBudgets,
  seedEventExecutions, seedBehaviorActions, seedMomentDrafts, seedImageJobs,
  seedMoments, seedMomentInteractions, seedAppearanceSettings, seedLlmProviderProfiles,
  seedComfyUiSettings,
} from "./in-memory/seeds.ts";

export class InMemoryRepositories implements DomainRepositories {
  public readonly storyWorlds: import("./repositories.ts").StoryWorldRepository;
  public readonly characters: import("./repositories.ts").CharacterRepository;
  public readonly relationshipEdges: import("./repositories.ts").RelationshipEdgeRepository;
  public readonly actorSessions: import("./repositories.ts").ActorSessionRepository;
  public readonly conversations: import("./repositories.ts").ConversationRepository;
  public readonly messages: import("./repositories.ts").MessageRepository;
  public readonly memories: import("./repositories.ts").MemoryRepository;
  public readonly worldEventDefinitions: import("./repositories.ts").WorldEventDefinitionRepository;
  public readonly worldLoreEntries: import("./repositories.ts").WorldLoreEntryRepository;
  public readonly storyArcs: import("./repositories.ts").StoryArcRepository;
  public readonly storyNodes: import("./repositories.ts").StoryNodeRepository;
  public readonly storyEdges: import("./repositories.ts").StoryEdgeRepository;
  public readonly promptTemplates: import("./repositories.ts").PromptTemplateRepository;
  public readonly memoryCandidates: import("./repositories.ts").MemoryCandidateRepository;
  public readonly scheduledOccurrences: import("./repositories.ts").ScheduledOccurrenceRepository;
  public readonly dispatchRequests: DispatchRequestRepository;
  public readonly characterPlans: import("./repositories.ts").CharacterPlanRepository;
  public readonly eventExecutions: import("./repositories.ts").EventExecutionRepository;
  public readonly proactiveMessageBudgets: import("./repositories.ts").ProactiveMessageBudgetRepository;
  public readonly behaviorActions: import("./repositories.ts").BehaviorActionRepository;
  public readonly momentDrafts: import("./repositories.ts").MomentDraftRepository;
  public readonly imageJobs: import("./repositories.ts").ImageJobRepository;
  public readonly characterVisualIdentities: import("./repositories.ts").CharacterVisualIdentityRepository;
  public readonly imageWorkflowTemplates: import("./repositories.ts").ImageWorkflowTemplateRepository;
  public readonly stickerPacks: import("./repositories.ts").StickerPackRepository;
  public readonly stickers: import("./repositories.ts").StickerRepository;
  public readonly moments: import("./repositories.ts").MomentRepository;
  public readonly momentInteractions: import("./repositories.ts").MomentInteractionRepository;
  public readonly appearanceSettings: import("./repositories.ts").AppearanceSettingsRepository;
  public readonly llmProviderProfiles: import("./repositories.ts").LlmProviderProfileRepository;
  public readonly comfyUiSettings: import("./repositories.ts").ComfyUiSettingsRepository;
  public readonly worldContextPolicies: import("@living-network/ports").WorldContextPolicyRepository;
  public readonly storyGenerationJobs: import("@living-network/ports").StoryGenerationJobRepository;
  public readonly storyGenerationCandidates: import("@living-network/ports").StoryGenerationCandidateRepository;
  public readonly relationshipChangeCandidates: import("@living-network/ports").RelationshipChangeCandidateRepository;
  public readonly relationshipEvents: import("@living-network/ports").RelationshipEventRepository;
  public readonly socialFeedEvents: import("@living-network/ports").SocialFeedEventRepository;

  private readonly worldMap = new Map<string, import("@living-network/domain").StoryWorld>();
  private readonly characterMap = new Map<string, import("@living-network/domain").Character>();
  private readonly relationshipEdgeMap = new Map<string, import("@living-network/domain").RelationshipEdge>();
  private readonly actorSessionMap = new Map<string, import("@living-network/domain").ActorSession>();
  private readonly conversationMap = new Map<string, import("@living-network/domain").ConversationAggregate>();
  private readonly messageMap = new Map<string, import("@living-network/domain").Message>();
  private readonly memoryMap = new Map<string, import("@living-network/domain").MemoryItem>();
  private readonly worldEventDefinitionMap = new Map<string, import("@living-network/domain").WorldEventDefinition>();
  private readonly worldLoreEntryMap = new Map<string, import("@living-network/domain").WorldLoreEntry>();
  private readonly storyArcMap = new Map<string, import("@living-network/domain").StoryArc>();
  private readonly storyNodeMap = new Map<string, import("@living-network/domain").StoryNode>();
  private readonly storyEdgeMap = new Map<string, import("@living-network/domain").StoryEdge>();
  private readonly promptTemplateMap = new Map<string, import("@living-network/domain").PromptTemplate>();
  private readonly memoryCandidateMap = new Map<string, import("@living-network/domain").MemoryCandidate>();
  private readonly scheduledOccurrenceMap = new Map<string, import("@living-network/domain").ScheduledOccurrence>();
  private readonly characterPlanMap = new Map<string, import("@living-network/domain").CharacterPlan>();
  private readonly eventExecutionMap = new Map<string, import("@living-network/domain").EventExecution>();
  private readonly proactiveMessageBudgetMap = new Map<string, import("@living-network/domain").ProactiveMessageBudget>();
  private readonly behaviorActionMap = new Map<string, import("@living-network/domain").BehaviorAction>();
  private readonly momentDraftMap = new Map<string, import("@living-network/domain").MomentDraft>();
  private readonly imageJobMap = new Map<string, import("@living-network/domain").ImageJob>();
  private readonly characterVisualIdentityMap = new Map<string, import("@living-network/domain").CharacterVisualIdentity>();
  private readonly imageWorkflowTemplateMap = new Map<string, import("@living-network/domain").ImageWorkflowTemplate>();
  private readonly stickerPackMap = new Map<string, import("@living-network/domain").StickerPack>();
  private readonly stickerMap = new Map<string, import("@living-network/domain").Sticker>();
  private readonly momentMap = new Map<string, import("@living-network/domain").Moment>();
  private readonly momentInteractionMap = new Map<string, import("@living-network/domain").MomentInteraction>();
  private readonly appearanceSettingsMap = new Map<string, import("@living-network/domain").AppearanceSettings>();
  private readonly llmProviderProfileMap = new Map<string, import("@living-network/domain").LlmProviderProfile>();
  private readonly comfyUiSettingsMap = new Map<string, import("@living-network/domain").ComfyUiSettings>();
  private readonly worldContextPolicyMap = new Map<string, import("@living-network/domain").WorldContextPolicy>();
  private readonly storyGenerationJobMap = new Map<string, import("@living-network/domain").StoryGenerationJob>();
  private readonly storyGenerationCandidateMap = new Map<string, import("@living-network/domain").StoryGenerationCandidate>();
  private readonly relationshipChangeCandidateMap = new Map<string, import("@living-network/domain").RelationshipChangeCandidate>();
  private readonly relationshipEventMap = new Map<string, import("@living-network/domain").RelationshipEvent>();
  private readonly socialFeedEventMap = new Map<string, import("@living-network/domain").SocialFeedEvent>();

  public constructor(seed: InMemoryRepositorySeed = {}) {
    this.dispatchRequests = createInMemoryDispatchRequestRepository(seed.dispatchRequests);

    // Seed data
    seedWorlds(this.worldMap, seed.worlds ?? []);
    seedCharacters(this.characterMap, this.worldMap, seed.characters ?? []);
    seedVisualIdentities(this.characterVisualIdentityMap, this.worldMap, this.characterMap, seed.characterVisualIdentities ?? []);
    seedImageWorkflowTemplates(this.imageWorkflowTemplateMap, seed.imageWorkflowTemplates ?? []);
    seedStickerPacks(this.stickerPackMap, this.worldMap, seed.stickerPacks ?? []);
    seedStickers(this.stickerMap, this.stickerPackMap, seed.stickers ?? []);
    seedRelationshipEdges(this.relationshipEdgeMap, this.worldMap, this.characterMap, seed.relationshipEdges ?? []);
    seedActorSessions(this.actorSessionMap, this.worldMap, this.characterMap, seed.actorSessions ?? []);
    seedConversations(this.conversationMap, this.worldMap, this.characterMap, seed.conversations ?? []);
    for (const message of seed.messages ?? []) {
      saveMessageSeed(message, this.messageMap, this.conversationMap, this.characterMap);
    }
    seedMemories(this.memoryMap, this.worldMap, this.characterMap, seed.memories ?? []);
    seedStoryArcs(this.storyArcMap, this.worldMap, seed.storyArcs ?? []);
    seedStoryNodes(this.storyNodeMap, this.worldMap, this.storyArcMap, this.characterMap, this.memoryMap, seed.storyNodes ?? []);
    seedStoryEdges(this.storyEdgeMap, this.worldMap, this.storyArcMap, this.storyNodeMap, seed.storyEdges ?? []);
    seedPromptTemplates(this.promptTemplateMap, this.worldMap, seed.promptTemplates ?? []);
    seedMemoryCandidates(this.memoryCandidateMap, this.worldMap, this.characterMap, this.memoryMap, seed.memoryCandidates ?? []);
    seedWorldEventDefinitions(this.worldEventDefinitionMap, this.worldMap, this.characterMap, seed.worldEventDefinitions ?? []);
    seedWorldLoreEntries(this.worldLoreEntryMap, this.worldMap, seed.worldLoreEntries ?? []);
    seedScheduledOccurrences(this.scheduledOccurrenceMap, this.worldEventDefinitionMap, seed.scheduledOccurrences ?? []);
    seedCharacterPlans(this.characterPlanMap, this.worldMap, this.characterMap, seed.characterPlans ?? []);
    seedProactiveMessageBudgets(this.proactiveMessageBudgetMap, this.worldMap, this.characterMap, seed.proactiveMessageBudgets ?? []);
    seedEventExecutions(this.eventExecutionMap, this.worldEventDefinitionMap, this.scheduledOccurrenceMap, this.worldMap, this.characterMap, seed.eventExecutions ?? []);
    seedBehaviorActions(this.behaviorActionMap, this.eventExecutionMap, this.characterMap, seed.behaviorActions ?? []);
    seedMomentDrafts(this.momentDraftMap, this.behaviorActionMap, this.eventExecutionMap, this.characterMap, seed.momentDrafts ?? []);
    seedImageJobs(this.imageJobMap, this.behaviorActionMap, this.eventExecutionMap, this.characterMap, this.momentDraftMap, seed.imageJobs ?? []);
    seedMoments(this.momentMap, this.worldMap, this.characterMap, seed.moments ?? []);
    seedMomentInteractions(this.momentInteractionMap, this.momentMap, this.characterMap, seed.momentInteractions ?? []);
    seedAppearanceSettings(this.appearanceSettingsMap, seed.appearanceSettings ?? []);
    seedLlmProviderProfiles(this.llmProviderProfileMap, seed.llmProviderProfiles ?? []);
    if (seed.comfyUiSettings !== undefined) {
      seedComfyUiSettings(this.comfyUiSettingsMap, seed.comfyUiSettings);
    }

    // Create repositories
    this.storyWorlds = createStoryWorldRepo(this.worldMap);
    this.characters = createCharacterRepo(this.characterMap);
    this.relationshipEdges = createRelationshipEdgeRepo(this.relationshipEdgeMap, this.worldMap, this.characterMap);
    this.actorSessions = createActorSessionRepo(this.actorSessionMap, this.worldMap, this.characterMap);
    this.conversations = createConversationRepo(this.conversationMap, this.worldMap, this.characterMap);
    this.messages = createMessageRepo(this.messageMap, this.conversationMap, this.characterMap);
    this.memories = createMemoryRepo(this.memoryMap, this.worldMap, this.characterMap);
    this.worldLoreEntries = createWorldLoreEntryRepo(this.worldLoreEntryMap, this.worldMap);
    this.storyArcs = createStoryArcRepo(this.storyArcMap, this.storyNodeMap, this.storyEdgeMap, this.worldMap);
    this.storyNodes = createStoryNodeRepo(this.storyNodeMap, this.storyEdgeMap, this.worldMap, this.storyArcMap, this.characterMap, this.memoryMap);
    this.storyEdges = createStoryEdgeRepo(this.storyEdgeMap, this.worldMap, this.storyArcMap, this.storyNodeMap);
    this.promptTemplates = createPromptTemplateRepo(this.promptTemplateMap, this.worldMap);
    this.memoryCandidates = createMemoryCandidateRepo(this.memoryCandidateMap, this.worldMap, this.characterMap, this.memoryMap);
    this.worldEventDefinitions = createWorldEventDefinitionRepo(this.worldEventDefinitionMap, this.worldMap, this.characterMap);
    this.scheduledOccurrences = createScheduledOccurrenceRepo(this.scheduledOccurrenceMap, this.worldEventDefinitionMap);
    this.characterPlans = createCharacterPlanRepo(this.characterPlanMap, this.worldMap, this.characterMap);
    this.proactiveMessageBudgets = createProactiveMessageBudgetRepo(this.proactiveMessageBudgetMap, this.worldMap, this.characterMap);
    this.eventExecutions = createEventExecutionRepo(this.eventExecutionMap, this.worldMap, this.characterMap, this.worldEventDefinitionMap);
    this.behaviorActions = createBehaviorActionRepo(this.behaviorActionMap, this.worldMap, this.characterMap);
    this.momentDrafts = createMomentDraftRepo(this.momentDraftMap, this.behaviorActionMap, this.eventExecutionMap, this.characterMap);
    this.imageJobs = createImageJobRepo(this.imageJobMap, this.behaviorActionMap, this.eventExecutionMap, this.characterMap, this.momentDraftMap);
    this.characterVisualIdentities = createCharacterVisualIdentityRepo(this.characterVisualIdentityMap, this.worldMap, this.characterMap);
    this.imageWorkflowTemplates = createImageWorkflowTemplateRepo(this.imageWorkflowTemplateMap);
    this.stickerPacks = createStickerPackRepo(this.stickerPackMap, this.worldMap);
    this.stickers = createStickerRepo(this.stickerMap, this.stickerPackMap);
    this.moments = createMomentRepo(this.momentMap, this.worldMap, this.characterMap);
    this.momentInteractions = createMomentInteractionRepo(this.momentInteractionMap, this.momentMap, this.characterMap);
    this.appearanceSettings = createAppearanceSettingsRepo(this.appearanceSettingsMap);
    this.llmProviderProfiles = createLlmProviderProfileRepo(this.llmProviderProfileMap);
    this.comfyUiSettings = createComfyUiSettingsRepo(this.comfyUiSettingsMap);
    this.worldContextPolicies = createWorldContextPolicyRepo(this.worldContextPolicyMap);
    this.storyGenerationJobs = createStoryGenerationJobRepo(this.storyGenerationJobMap);
    this.storyGenerationCandidates = createStoryGenerationCandidateRepo(this.storyGenerationCandidateMap);
    this.relationshipChangeCandidates = createRelationshipChangeCandidateRepo(this.relationshipChangeCandidateMap);
    this.relationshipEvents = createRelationshipEventRepo(this.relationshipEventMap);
    this.socialFeedEvents = createSocialFeedEventRepo(this.socialFeedEventMap);
  }
}

export function createInMemoryRepositories(
  seed: InMemoryRepositorySeed = {},
): DomainRepositories {
  return new InMemoryRepositories(seed);
}
