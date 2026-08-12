import type {
  DomainRepositories,
} from "./repositories.ts";
import { SqlOutboxEventRepository } from "./outbox.ts";
import { createSqlDispatchRequestRepository, type DispatchRequestRepository } from "./dispatch.ts";
import type { MigrationDatabase } from "./migrations.ts";
import type { SqlClient } from "./sql/utils.ts";
import { createCoreIdentityRepositories } from "./sql/core-identity.ts";
import { createChatMemoryRepositories } from "./sql/chat-memory.ts";
import { createEventsExecutionRepositories } from "./sql/events-execution.ts";
import { createMediaSocialRepositories } from "./sql/media-social.ts";
import { createStoryContentRepositories } from "./sql/story-content.ts";
import { createSettingsRepositories } from "./sql/settings.ts";

import { createStoryGenerationRepositories } from "./sql/story-generation.ts";
import { createRelationshipFeedbackRepositories } from "./sql/relationship-feedback.ts";
import { createSocialFeedEventRepositories } from "./sql/social-feed.ts";

export type { SqlRow, SqlQueryResult, SqlClient } from "./sql/utils.ts";

export class SqlRepositories implements DomainRepositories {
  public readonly worldContextPolicies;
  public readonly storyGenerationJobs;
  public readonly storyGenerationCandidates;
  public readonly storyWorlds;
  public readonly characters;
  public readonly relationshipEdges;
  public readonly actorSessions;
  public readonly conversations;
  public readonly messages;
  public readonly memories;
  public readonly worldEventDefinitions;
  public readonly worldLoreEntries;
  public readonly storyArcs;
  public readonly storyNodes;
  public readonly storyEdges;
  public readonly promptTemplates;
  public readonly memoryCandidates;
  public readonly scheduledOccurrences;
  public readonly characterPlans;
  public readonly eventExecutions;
  public readonly proactiveMessageBudgets;
  public readonly behaviorActions;
  public readonly momentDrafts;
  public readonly imageJobs;
  public readonly characterVisualIdentities;
  public readonly imageWorkflowTemplates;
  public readonly stickerPacks;
  public readonly stickers;
  public readonly moments;
  public readonly momentInteractions;
  public readonly appearanceSettings;
  public readonly llmProviderProfiles;
  public readonly comfyUiSettings;
  public readonly outboxEvents;
  public readonly dispatchRequests;

  private readonly client: SqlClient;

  public constructor(client: SqlClient) {
    this.client = client;
    this.outboxEvents = new SqlOutboxEventRepository(client);
    this.dispatchRequests = createSqlDispatchRequestRepository(client);

    const core = createCoreIdentityRepositories(client);
    this.storyWorlds = core.storyWorlds;
    this.characters = core.characters;
    this.relationshipEdges = core.relationshipEdges;
    this.actorSessions = core.actorSessions;

    const chat = createChatMemoryRepositories(client);
    this.conversations = chat.conversations;
    this.messages = chat.messages;
    this.memories = chat.memories;
    this.worldLoreEntries = chat.worldLoreEntries;

    const events = createEventsExecutionRepositories(client);
    this.worldEventDefinitions = events.worldEventDefinitions;
    this.scheduledOccurrences = events.scheduledOccurrences;
    this.characterPlans = events.characterPlans;
    this.proactiveMessageBudgets = events.proactiveMessageBudgets;
    this.eventExecutions = events.eventExecutions;
    this.behaviorActions = events.behaviorActions;

    const media = createMediaSocialRepositories(client);
    this.momentDrafts = media.momentDrafts;
    this.imageJobs = media.imageJobs;
    this.characterVisualIdentities = media.characterVisualIdentities;
    this.imageWorkflowTemplates = media.imageWorkflowTemplates;
    this.stickerPacks = media.stickerPacks;
    this.stickers = media.stickers;
    this.moments = media.moments;
    this.momentInteractions = media.momentInteractions;

    const story = createStoryContentRepositories(client);
    this.storyArcs = story.storyArcs;
    this.storyNodes = story.storyNodes;
    this.storyEdges = story.storyEdges;
    this.promptTemplates = story.promptTemplates;
    this.memoryCandidates = story.memoryCandidates;

    const settings = createSettingsRepositories(client);
    this.appearanceSettings = settings.appearanceSettings;
    this.llmProviderProfiles = settings.llmProviderProfiles;
    this.comfyUiSettings = settings.comfyUiSettings;

    const storyGen = createStoryGenerationRepositories(client);
    const relFeedback = createRelationshipFeedbackRepositories(client);
    const socialFeed = createSocialFeedEventRepositories(client);
    this.worldContextPolicies = storyGen.worldContextPolicies;
    this.storyGenerationJobs = storyGen.storyGenerationJobs;
    this.storyGenerationCandidates = storyGen.storyGenerationCandidates;
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
