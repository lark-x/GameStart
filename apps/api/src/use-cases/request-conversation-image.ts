import {
  createWorldEventDefinition,
  createScheduledOccurrence,
  createEventExecution,
  createBehaviorAction,
  createImageJob,
  ActionKind,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  TriggerSource,
  type ImageJob,
} from "../../../../packages/domain/src/index.ts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import type { RequestConversationImageRequest } from "../../../../packages/contracts/src/index.ts";

export interface ConversationImageStore {
  conversations: NonNullable<ApiStore["conversations"]>;
  characters: NonNullable<ApiStore["characters"]>;
  storyWorlds: NonNullable<ApiStore["storyWorlds"]>;
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
  behaviorActions: NonNullable<ApiStore["behaviorActions"]>;
  eventExecutions: NonNullable<ApiStore["eventExecutions"]>;
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
}

export function requireConversationImageStore(store: ApiStore): ConversationImageStore {
  if (!store.conversations || !store.characters || !store.storyWorlds ||
      !store.imageJobs || !store.behaviorActions || !store.eventExecutions ||
      !store.worldEventDefinitions || !store.scheduledOccurrences) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image request repositories are not configured");
  }
  return store as ConversationImageStore;
}

/**
 * Shared use-case: creates an idempotent conversation image request.
 * Used by both the HTTP route handler and the auto-image afterReplySaved hook.
 */
export async function requestConversationImage(
  store: ConversationImageStore,
  conversationId: string,
  input: RequestConversationImageRequest,
): Promise<ImageJob> {
  const conversation = await store.conversations.getById(conversationId);
  if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  if (conversation.conversation.type !== "PRIVATE") {
    throw new ApiError(400, "BAD_REQUEST", "Image requests are only supported in private conversations");
  }
  if (conversation.conversation.storyWorldId === "") {
    throw new ApiError(400, "BAD_REQUEST", "Conversation story world is invalid");
  }
  const activeMembers = conversation.members.filter((m) => m.leftAt === undefined);
  const memberIds = new Set(activeMembers.map((m) => m.characterId));
  if (activeMembers.length !== 2 || input.actorCharacterId === input.recipientCharacterId ||
      !memberIds.has(input.actorCharacterId) || !memberIds.has(input.recipientCharacterId)) {
    throw new ApiError(403, "FORBIDDEN", "Actor and recipient must be the two active private-conversation members");
  }

  const actor = await store.characters.getById(input.actorCharacterId);
  const recipient = await store.characters.getById(input.recipientCharacterId);
  const storyWorld = await store.storyWorlds.getById(conversation.conversation.storyWorldId);
  if (!actor || !recipient || !storyWorld) {
    throw new ApiError(404, "NOT_FOUND", "Conversation participants or story world not found");
  }
  if (actor.storyWorldId !== storyWorld.id || recipient.storyWorldId !== storyWorld.id) {
    throw new ApiError(403, "FORBIDDEN", "Conversation participants must belong to its story world");
  }

  const requestKey = encodeURIComponent(input.idempotencyKey);
  const prefix = `chat-image:${conversationId}:${requestKey}`;
  const actionId = `${prefix}:action`;
  const jobId = `${prefix}:job`;

  const existing = await store.imageJobs.getByActionId(actionId);
  if (existing) {
    if (existing.ownerCharacterId !== input.actorCharacterId ||
        existing.workflowVersion !== input.workflowVersion ||
        existing.prompt !== input.prompt) {
      throw new ApiError(409, "CONFLICT", "Image request idempotency key was already used with different content");
    }
    return existing;
  }

  const conflictingJob = await store.imageJobs.getById(jobId);
  if (conflictingJob) {
    throw new ApiError(409, "CONFLICT", "Image request idempotency key conflicts with an existing job");
  }

  const eventKey = `${prefix}:request`;
  const definitionId = `${prefix}:definition`;
  const occurrenceId = `${prefix}:occurrence`;
  const executionId = `${prefix}:execution`;

  let definition = await store.worldEventDefinitions.getById(definitionId);
  if (!definition) {
    definition = createWorldEventDefinition({
      id: definitionId, storyWorld, eventKey, name: "Private chat image request",
      triggerSource: TriggerSource.USER_INTERACTION,
      recurrence: { kind: EventRecurrenceKind.ONCE, runAt: input.createdAt },
      targetCharacters: [actor], recipientCharacters: [recipient],
      outputs: { sendMessage: false, publishMoment: false, generateImage: true },
      enabled: false, createdAt: input.createdAt,
    });
    await store.worldEventDefinitions.save(definition);
  }

  let occurrence = await store.scheduledOccurrences.getById(occurrenceId);
  if (!occurrence) {
    occurrence = createScheduledOccurrence({
      id: occurrenceId, definition, scheduledFor: input.createdAt,
      occurrenceKey: occurrenceId, status: ScheduledOccurrenceStatus.RUNNING,
      createdAt: input.createdAt,
    });
    await store.scheduledOccurrences.save(occurrence);
  }

  let execution = await store.eventExecutions.getById(executionId);
  if (!execution) {
    execution = createEventExecution({
      id: executionId, occurrence, definition, ruleVersion: "chat-image-v1",
      inputSnapshot: {
        conversationId, actorCharacterId: input.actorCharacterId,
        recipientCharacterId: input.recipientCharacterId,
        idempotencyKey: input.idempotencyKey,
      },
      startedAt: input.createdAt,
    });
    await store.eventExecutions.save(execution);
  }

  let action = await store.behaviorActions.getById(actionId);
  if (!action) {
    action = createBehaviorAction({
      id: actionId, execution, actorCharacterId: input.actorCharacterId,
      kind: ActionKind.REQUEST_IMAGE,
      payload: {
        conversationId, recipientCharacterId: input.recipientCharacterId,
        prompt: input.prompt, workflowVersion: input.workflowVersion,
        ...(input.negativePrompt === undefined ? {} : { negativePrompt: input.negativePrompt }),
        ...(input.seed === undefined ? {} : { seed: input.seed }),
      },
      createdAt: input.createdAt,
    });
    await store.behaviorActions.save(action);
  } else if (
    action.actorCharacterId !== input.actorCharacterId ||
    action.payload.conversationId !== conversationId ||
    action.payload.recipientCharacterId !== input.recipientCharacterId ||
    action.payload.prompt !== input.prompt ||
    action.payload.workflowVersion !== input.workflowVersion
  ) {
    throw new ApiError(409, "CONFLICT", "Image request idempotency key was already used with different content");
  }

  const job = createImageJob({ id: jobId, action, createdAt: input.createdAt });
  await store.imageJobs.save(job);
  return job;
}
