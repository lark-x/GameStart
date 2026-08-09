import {
  ActionKind,
  CharacterRole,
  EventExecutionStatus,
  MessageKind,
  MomentDraftStatus,
  MomentVisibility,
  completeEventExecution,
  createBehaviorAction,
  createMessage,
  transitionMomentDraft,
  transitionOccurrence,
  type Character,
  type EventExecution,
  type JsonObject,
  type ScheduledOccurrence,
  type WorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import type { ChatProvider } from "../../../packages/ai/src/index.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";
import { BehaviorMediaCoordinator, type ComfyUiClient } from "./media.ts";
import { MomentPublicationCoordinator } from "./publication.ts";
import { ProactiveMessageCoordinator } from "./proactive.ts";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export type EventOutputExecutorClock = () => Date;

export interface EventOutputExecutorOptions {
  /**
   * When supplied, an AI event actor can generate a contextual proactive
   * reply.  The deterministic system notification remains the safe fallback
   * when no provider is configured or that call fails.
   */
  readonly messageProvider?: ChatProvider;
  readonly clock?: EventOutputExecutorClock;
  readonly logger?: WorkerLogger | undefined;
}

export interface EventOutputExecutionResult {
  readonly execution: EventExecution;
  readonly occurrence: ScheduledOccurrence;
  readonly alreadyCompleted: boolean;
}

type OutputStatus = "CREATED" | "SKIPPED" | "PARTIAL" | "FAILED";

type OutputDetail = {
  readonly status: OutputStatus;
  readonly ids?: readonly string[];
  readonly diagnostics?: readonly string[];
};

const inertComfyUiClient: ComfyUiClient = {
  async submit() {
    throw new Error("Event output planning does not submit ComfyUI jobs");
  },
  async getResult() {
    throw new Error("Event output planning does not retrieve ComfyUI jobs");
  },
};

function nowIso(clock: EventOutputExecutorClock): string {
  return clock().toISOString();
}

function conciseError(error: unknown): string {
  const text = error instanceof Error ? error.message : "Unknown output failure";
  return text.replace(/\s+/g, " ").slice(0, 512);
}

function outputDetail(
  status: OutputStatus,
  ids: readonly string[] = [],
  diagnostics: readonly string[] = [],
): OutputDetail {
  return {
    status,
    ...(ids.length === 0 ? {} : { ids }),
    ...(diagnostics.length === 0 ? {} : { diagnostics }),
  };
}

function toJsonDetail(detail: OutputDetail): JsonObject {
  return {
    status: detail.status,
    ...(detail.ids === undefined ? {} : { ids: [...detail.ids] }),
    ...(detail.diagnostics === undefined ? {} : { diagnostics: [...detail.diagnostics] }),
  };
}

function deterministicText(definition: WorldEventDefinition): string {
  return `World event: ${definition.name}.`;
}

function deterministicImagePrompt(definition: WorldEventDefinition): string {
  return `A cinematic in-world moment for: ${definition.name}.`;
}

function activeMemberIds(conversation: { members: readonly { characterId: string; leftAt?: string }[] }): Set<string> {
  return new Set(conversation.members.filter((member) => member.leftAt === undefined).map((member) => member.characterId));
}

export class EventOutputExecutor {
  private readonly repositories: DomainRepositories;
  private readonly provider: ChatProvider | undefined;
  private readonly clock: EventOutputExecutorClock;
  private readonly logger: WorkerLogger | undefined;

  public constructor(repositories: DomainRepositories, options: EventOutputExecutorOptions = {}) {
    if (!repositories.eventExecutions || !repositories.scheduledOccurrences || !repositories.worldEventDefinitions) {
      throw new TypeError("Event output execution repositories are not configured");
    }
    this.repositories = repositories;
    this.provider = options.messageProvider;
    this.clock = options.clock ?? (() => new Date());
    this.logger = options.logger;
  }

  public async execute(executionId: string): Promise<EventOutputExecutionResult> {
    await bestEffortLog(this.logger, { action: "event_output.execute", outcome: "STARTED", correlationId: "worker:event_execution:" + executionId, entityType: "event_execution", entityId: executionId });
    const execution = await this.repositories.eventExecutions!.getById(executionId);
    if (!execution) throw new TypeError(`Unknown event execution: ${executionId}`);
    const occurrence = await this.repositories.scheduledOccurrences!.getById(execution.occurrenceId);
    if (!occurrence) throw new TypeError(`Unknown scheduled occurrence: ${execution.occurrenceId}`);
    if (execution.status === EventExecutionStatus.COMPLETED) {
      return { execution, occurrence, alreadyCompleted: true };
    }
    if (execution.status !== EventExecutionStatus.RUNNING) {
      throw new Error(`Cannot create outputs for ${execution.status} execution ${execution.id}`);
    }
    const definition = await this.repositories.worldEventDefinitions!.getById(execution.definitionId);
    if (!definition) throw new TypeError(`Unknown event definition: ${execution.definitionId}`);

    const snapshot = await this.executeOutputs(execution, definition);
    const completedAt = nowIso(this.clock);
    const completed = completeEventExecution(execution, snapshot, completedAt);
    await this.repositories.eventExecutions!.save(completed);
    const completedOccurrence = occurrence.status === "COMPLETED"
      ? occurrence
      : transitionOccurrence(occurrence, "COMPLETED");
    if (completedOccurrence !== occurrence) {
      await this.repositories.scheduledOccurrences!.update(completedOccurrence);
    }
    await bestEffortLog(this.logger, { action: "event_output.execute", outcome: "COMPLETED", correlationId: "worker:event_execution:" + executionId, entityType: "event_execution", entityId: executionId, worldId: definition.storyWorldId, details: snapshot });
    return { execution: completed, occurrence: completedOccurrence, alreadyCompleted: false };
  }

  private async executeOutputs(
    execution: EventExecution,
    definition: WorldEventDefinition,
  ): Promise<JsonObject> {
    const actor = await this.resolveActor(execution, definition);
    const outputEntries: Record<string, JsonObject> = {};
    const diagnostics: string[] = [];

    if (definition.outputs.sendMessage) {
      const result = await this.safely("sendMessage", execution, definition, () => this.sendMessages(execution, definition, actor));
      outputEntries.sendMessage = toJsonDetail(result.detail);
      diagnostics.push(...result.diagnostics);
    } else {
      outputEntries.sendMessage = toJsonDetail(outputDetail("SKIPPED", [], ["Disabled by event output policy"]));
    }

    if (definition.outputs.publishMoment) {
      const result = await this.safely("publishMoment", execution, definition, () => this.publishMoment(execution, definition, actor));
      outputEntries.publishMoment = toJsonDetail(result.detail);
      diagnostics.push(...result.diagnostics);
    } else {
      outputEntries.publishMoment = toJsonDetail(outputDetail("SKIPPED", [], ["Disabled by event output policy"]));
    }

    if (definition.outputs.generateImage) {
      const result = await this.safely("generateImage", execution, definition, () => this.queueImage(execution, definition, actor));
      outputEntries.generateImage = toJsonDetail(result.detail);
      diagnostics.push(...result.diagnostics);
    } else {
      outputEntries.generateImage = toJsonDetail(outputDetail("SKIPPED", [], ["Disabled by event output policy"]));
    }

    return {
      definitionId: definition.id,
      outputs: outputEntries,
      ...(diagnostics.length === 0 ? {} : { diagnostics }),
    };
  }

  private async safely(
    name: string,
    execution: EventExecution,
    definition: WorldEventDefinition,
    operation: () => Promise<OutputDetail>,
  ): Promise<{ detail: OutputDetail; diagnostics: readonly string[] }> {
    try {
      const detail = await operation();
      await bestEffortLog(this.logger, { action: "event_output." + name, outcome: detail.status, correlationId: "worker:event_execution:" + execution.id, entityType: "event_execution", entityId: execution.id, worldId: definition.storyWorldId, details: detail });
      return { detail, diagnostics: detail.diagnostics ?? [] };
    } catch (error) {
      await bestEffortLog(this.logger, { action: "event_output." + name, outcome: "FAILED", correlationId: "worker:event_execution:" + execution.id, entityType: "event_execution", entityId: execution.id, worldId: definition.storyWorldId, message: error });
      const diagnostic = `${name}: ${conciseError(error)}`;
      return {
        detail: outputDetail("FAILED", [], [diagnostic]),
        diagnostics: [diagnostic],
      };
    }
  }

  private async resolveActor(
    execution: EventExecution,
    definition: WorldEventDefinition,
  ): Promise<Character | undefined> {
    for (const id of execution.targetCharacterIds) {
      const character = await this.repositories.characters.getById(id);
      if (character?.storyWorldId === definition.storyWorldId) return character;
    }
    return undefined;
  }

  private async recipientConversations(
    definition: WorldEventDefinition,
    actor: Character | undefined,
  ): Promise<readonly { id: string; recipientId: string }[]> {
    if (!this.repositories.conversations) {
      throw new TypeError("Conversation repository is not configured");
    }
    const results: Array<{ id: string; recipientId: string }> = [];
    const seen = new Set<string>();
    for (const recipientId of definition.recipientCharacterIds) {
      const candidates = await this.repositories.conversations.listByCharacter(recipientId);
      const matching = candidates
        .filter((candidate) => candidate.conversation.storyWorldId === definition.storyWorldId)
        .filter((candidate) => {
          const members = activeMemberIds(candidate);
          return members.has(recipientId) && (actor === undefined || actor.id === recipientId || members.has(actor.id));
        })
        .sort((left, right) => {
          const leftPrivate = left.conversation.type === "PRIVATE" ? 0 : 1;
          const rightPrivate = right.conversation.type === "PRIVATE" ? 0 : 1;
          return leftPrivate - rightPrivate || left.conversation.id.localeCompare(right.conversation.id);
        });
      const selected = matching[0];
      if (!selected) {
        results.push({ id: "", recipientId });
      } else if (!seen.has(selected.conversation.id)) {
        seen.add(selected.conversation.id);
        results.push({ id: selected.conversation.id, recipientId });
      }
    }
    return results;
  }

  private async ensureSendAction(
    execution: EventExecution,
    actor: Character | undefined,
    conversationId: string,
    text: string,
  ): Promise<string | undefined> {
    if (!actor || !this.repositories.behaviorActions) return undefined;
    const id = `event-output:${execution.id}:message:${conversationId}`;
    const existing = await this.repositories.behaviorActions.getById(id);
    if (existing) return existing.id;
    const action = createBehaviorAction({
      id,
      execution,
      actorCharacterId: actor.id,
      kind: ActionKind.SEND_MESSAGE,
      payload: { text },
      createdAt: nowIso(this.clock),
    });
    await this.repositories.behaviorActions.save(action);
    return action.id;
  }

  private async appendMessageOutbox(
    messageId: string,
    execution: EventExecution,
    conversationId: string,
  ): Promise<string | undefined> {
    if (!this.repositories.outboxEvents) return undefined;
    const key = `event-output:${execution.id}:message:${conversationId}`;
    const result = await this.repositories.outboxEvents.append({
      id: `outbox:${key}`,
      aggregateType: "message",
      aggregateId: messageId,
      eventType: "message.created",
      payload: { messageId, executionId: execution.id, conversationId },
      idempotencyKey: key,
      createdAt: nowIso(this.clock),
    });
    return result.event.id;
  }

  private async sendMessages(
    execution: EventExecution,
    definition: WorldEventDefinition,
    actor: Character | undefined,
  ): Promise<OutputDetail> {
    if (!this.repositories.messages || !this.repositories.conversations) {
      throw new TypeError("Message repositories are not configured");
    }
    const text = deterministicText(definition);
    const destinations = await this.recipientConversations(definition, actor);
    const ids: string[] = [];
    const diagnostics: string[] = [];
    for (const destination of destinations) {
      if (destination.id.length === 0) {
        diagnostics.push(`sendMessage: no active conversation for recipient ${destination.recipientId}`);
        continue;
      }
      try {
        const conversation = await this.repositories.conversations.getById(destination.id);
        if (!conversation) throw new TypeError(`Unknown conversation: ${destination.id}`);
        await this.ensureSendAction(execution, actor, destination.id, text);
        let messageId: string;
        if (this.provider && actor?.role === CharacterRole.AI) {
          try {
            const generated = await new ProactiveMessageCoordinator(this.repositories, this.provider).generate({
              executionId: execution.id,
              conversationId: destination.id,
              actorCharacterId: actor.id,
              createdAt: nowIso(this.clock),
            });
            messageId = generated.message.id;
          } catch (error) {
            diagnostics.push(`sendMessage: proactive fallback for ${destination.id}: ${conciseError(error)}`);
            messageId = await this.saveSystemMessage(execution, conversation, destination.id, text);
          }
        } else {
          messageId = await this.saveSystemMessage(execution, conversation, destination.id, text);
        }
        ids.push(messageId);
        try {
          await this.appendMessageOutbox(messageId, execution, destination.id);
        } catch (error) {
          diagnostics.push(`sendMessage: outbox for ${destination.id}: ${conciseError(error)}`);
        }
      } catch (error) {
        diagnostics.push(`sendMessage: ${destination.id}: ${conciseError(error)}`);
      }
    }
    if (ids.length === 0) return outputDetail("FAILED", [], diagnostics.length === 0 ? ["No message destinations"] : diagnostics);
    return outputDetail(diagnostics.length === 0 ? "CREATED" : "PARTIAL", ids, diagnostics);
  }

  private async saveSystemMessage(
    execution: EventExecution,
    conversation: Awaited<ReturnType<NonNullable<DomainRepositories["conversations"]>["getById"]>>,
    conversationId: string,
    text: string,
  ): Promise<string> {
    if (!conversation || !this.repositories.messages) throw new TypeError(`Unknown conversation: ${conversationId}`);
    const key = `event-output:${execution.id}:message:${conversationId}`;
    const result = await this.repositories.messages.save(createMessage({
      id: key,
      conversation,
      kind: MessageKind.SYSTEM,
      text,
      createdAt: nowIso(this.clock),
      idempotencyKey: key,
    }));
    return result.message.id;
  }

  private mediaCoordinator(): BehaviorMediaCoordinator {
    if (!this.repositories.behaviorActions || !this.repositories.momentDrafts || !this.repositories.imageJobs) {
      throw new TypeError("Behavior/media repositories are not configured");
    }
    return new BehaviorMediaCoordinator(this.repositories, inertComfyUiClient, this.clock);
  }

  private async publishMoment(
    execution: EventExecution,
    definition: WorldEventDefinition,
    actor: Character | undefined,
  ): Promise<OutputDetail> {
    if (!actor) throw new TypeError("publishMoment requires an event target character");
    if (!this.repositories.momentDrafts || !this.repositories.moments) {
      throw new TypeError("Moment repositories are not configured");
    }
    const coordinator = this.mediaCoordinator();
    const action = await coordinator.planAction({
      id: `event-output:${execution.id}:moment:${actor.id}`,
      executionId: execution.id,
      actorCharacterId: actor.id,
      kind: ActionKind.CREATE_MOMENT,
      payload: { body: deterministicText(definition) },
      priority: definition.priority,
      momentVisibility: MomentVisibility.GROUP,
    });
    const draft = await this.repositories.momentDrafts.getByActionId(action.id);
    if (!draft) throw new TypeError(`Moment draft was not created for action ${action.id}`);
    const ready = draft.status === MomentDraftStatus.DRAFT
      ? transitionMomentDraft(draft, MomentDraftStatus.READY, nowIso(this.clock))
      : draft;
    if (ready !== draft) await this.repositories.momentDrafts.save(ready);
    const moment = await new MomentPublicationCoordinator(this.repositories).publish({
      id: `event-output:${execution.id}:published-moment:${actor.id}`,
      draftId: ready.id,
      publishedAt: nowIso(this.clock),
      audienceCharacterIds: definition.recipientCharacterIds,
    });
    return outputDetail("CREATED", [action.id, moment.id]);
  }

  private async queueImage(
    execution: EventExecution,
    definition: WorldEventDefinition,
    actor: Character | undefined,
  ): Promise<OutputDetail> {
    if (!actor) throw new TypeError("generateImage requires an event target character");
    const settings = await this.repositories.comfyUiSettings?.get();
    const workflowVersion = settings?.defaultWorkflowVersion;
    if (!workflowVersion) {
      return outputDetail("SKIPPED", [], ["No default ComfyUI workflow is configured"]);
    }
    const action = await this.mediaCoordinator().planAction({
      id: `event-output:${execution.id}:image:${actor.id}`,
      executionId: execution.id,
      actorCharacterId: actor.id,
      kind: ActionKind.REQUEST_IMAGE,
      payload: {
        prompt: deterministicImagePrompt(definition),
        workflowVersion,
      },
      priority: definition.priority,
    });
    const job = await this.repositories.imageJobs!.getByActionId(action.id);
    if (!job) throw new TypeError(`Image job was not created for action ${action.id}`);
    return outputDetail("CREATED", [action.id, job.id]);
  }
}

export function createEventOutputExecutor(
  repositories: DomainRepositories,
  options?: EventOutputExecutorOptions,
): EventOutputExecutor {
  return new EventOutputExecutor(repositories, options);
}
