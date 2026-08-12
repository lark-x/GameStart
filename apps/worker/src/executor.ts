import {
  cancelEventExecution,
  canConsumeProactiveMessages,
  consumeProactiveMessages,
  createEventExecution,
  EventExecutionStatus,
  failEventExecution,
  PlanInterruptibility,
  transitionOccurrence,
  type EventExecution,
  type CharacterPlan,
  type JsonObject,
  type ProactiveMessageBudget,
  type ScheduledOccurrence,
} from "@living-network/domain";
import { assertIsoTimestamp } from "@living-network/domain";
import type {
  CharacterPlanRepository,
  DomainRepositories,
  EventExecutionRepository,
  ProactiveMessageBudgetRepository,
  ScheduledOccurrenceRepository,
  WorldEventDefinitionRepository,
} from "@living-network/ports";

export type ExecutionCoordinatorRepositories = DomainRepositories & {
  readonly worldEventDefinitions: WorldEventDefinitionRepository;
  readonly scheduledOccurrences: ScheduledOccurrenceRepository;
  readonly characterPlans: CharacterPlanRepository;
  readonly eventExecutions: EventExecutionRepository;
  readonly proactiveMessageBudgets: ProactiveMessageBudgetRepository;
};

export interface StartEventExecutionInput {
  ruleVersion: string;
  inputSnapshot?: JsonObject;
  proactiveMessageUnits?: number;
}

export const ExecutionStartResultKind = {
  STARTED: "STARTED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  ALREADY_FINISHED: "ALREADY_FINISHED",
} as const;

export type ExecutionStartResultKind =
  (typeof ExecutionStartResultKind)[keyof typeof ExecutionStartResultKind];

export interface StartEventExecutionResult {
  kind: ExecutionStartResultKind;
  occurrence: ScheduledOccurrence;
  execution: EventExecution;
}

export type ExecutionCoordinatorClock = () => Date;

function requireRepositories(repositories: DomainRepositories): ExecutionCoordinatorRepositories {
  if (
    !repositories.worldEventDefinitions ||
    !repositories.scheduledOccurrences ||
    !repositories.characterPlans ||
    !repositories.eventExecutions ||
    !repositories.proactiveMessageBudgets
  ) {
    throw new TypeError("Event execution repositories are not configured");
  }
  return repositories as ExecutionCoordinatorRepositories;
}

function nowIso(clock: ExecutionCoordinatorClock): string {
  const value = clock().toISOString();
  assertIsoTimestamp(value, "execution.clock");
  return value;
}

function assertUnits(units: number): void {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new RangeError("proactiveMessageUnits must be a non-negative integer");
  }
}

function copySnapshot(snapshot: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(snapshot)) as JsonObject;
}

function buildSnapshot(
  inputSnapshot: JsonObject,
  occurrence: ScheduledOccurrence,
  plans: readonly CharacterPlan[],
  budgets: readonly ProactiveMessageBudget[],
): JsonObject {
  // The explicit cast keeps the snapshot boundary structural; all values were
  // already validated by their domain constructors/repositories.
  return {
    ...copySnapshot(inputSnapshot),
    occurrence: {
      id: occurrence.id,
      definitionId: occurrence.definitionId,
      storyWorldId: occurrence.storyWorldId,
      eventKey: occurrence.eventKey,
      scheduledFor: occurrence.scheduledFor,
      timezone: occurrence.timezone,
      occurrenceKey: occurrence.occurrenceKey,
    },
    characterPlans: plans.map((plan) => ({ ...plan })),
    proactiveMessageBudgets: budgets.map((budget) => ({ ...budget })),
  } as JsonObject;
}

export class EventExecutionCoordinator {
  private readonly repositories: ExecutionCoordinatorRepositories;
  private readonly clock: ExecutionCoordinatorClock;

  public constructor(
    repositories: DomainRepositories,
    clock: ExecutionCoordinatorClock = () => new Date(),
  ) {
    this.repositories = requireRepositories(repositories);
    this.clock = clock;
  }

  public async start(
    occurrenceId: string,
    input: StartEventExecutionInput,
  ): Promise<StartEventExecutionResult> {
    const occurrence = await this.repositories.scheduledOccurrences.getById(occurrenceId);
    if (!occurrence) throw new TypeError(`Unknown scheduled occurrence: ${occurrenceId}`);
    const definition = await this.repositories.worldEventDefinitions.getById(occurrence.definitionId);
    if (!definition) {
      throw new TypeError(`Unknown event definition: ${occurrence.definitionId}`);
    }

    const latest = await this.repositories.eventExecutions.getLatestByOccurrence(occurrence.id);
    if (latest?.status === EventExecutionStatus.RUNNING) {
      return { kind: ExecutionStartResultKind.STARTED, occurrence, execution: latest };
    }
    if (
      latest?.status === EventExecutionStatus.COMPLETED ||
      latest?.status === EventExecutionStatus.CANCELLED
    ) {
      return { kind: ExecutionStartResultKind.ALREADY_FINISHED, occurrence, execution: latest };
    }

    const units = input.proactiveMessageUnits ?? 1;
    assertUnits(units);
    const ruleVersion = input.ruleVersion;
    if (typeof ruleVersion !== "string" || ruleVersion.trim().length === 0) {
      throw new TypeError("ruleVersion must be a non-empty string");
    }
    const inputSnapshot = input.inputSnapshot ?? {};
    const startedAt = nowIso(this.clock);
    const attempt = (latest?.attempt ?? 0) + 1;

    let currentOccurrence = occurrence;
    if (currentOccurrence.status === "PENDING" || currentOccurrence.status === "FAILED") {
      currentOccurrence = transitionOccurrence(currentOccurrence, "ENQUEUED");
      await this.repositories.scheduledOccurrences.update(currentOccurrence);
    }
    if (currentOccurrence.status === "ENQUEUED") {
      currentOccurrence = transitionOccurrence(currentOccurrence, "RUNNING");
      await this.repositories.scheduledOccurrences.update(currentOccurrence);
    }
    if (currentOccurrence.status !== "RUNNING") {
      throw new Error(`occurrence ${currentOccurrence.id} is not runnable from ${currentOccurrence.status}`);
    }

    const plans = (
      await Promise.all(
        definition.targetCharacterIds.map((characterId) =>
          this.repositories.characterPlans.listActive(characterId, occurrence.scheduledFor),
        ),
      )
    ).flat();
    const budgets = (
      await Promise.all(
        definition.targetCharacterIds.map((characterId) =>
          this.repositories.proactiveMessageBudgets.getActive(
            occurrence.storyWorldId,
            characterId,
            occurrence.scheduledFor,
          ),
        ),
      )
    ).filter((budget): budget is ProactiveMessageBudget => budget !== undefined);

    const snapshot = buildSnapshot(inputSnapshot, occurrence, plans, budgets);
    const execution = createEventExecution({
      id: `execution:${occurrence.id}:${attempt}`,
      occurrence: currentOccurrence,
      definition,
      attempt,
      ruleVersion,
      inputSnapshot: snapshot,
      startedAt,
    });
    await this.repositories.eventExecutions.save(execution);

    const blockingPlan = plans.find(
      (plan) => plan.interruptibility === PlanInterruptibility.BLOCKED,
    );
    const exhaustedBudget = units > 0
      ? budgets.find((budget) => !canConsumeProactiveMessages(budget, units))
      : undefined;
    if (blockingPlan || exhaustedBudget) {
      const reason = blockingPlan
        ? `blocked by character plan ${blockingPlan.id}`
        : `proactive message budget exhausted for ${exhaustedBudget?.characterId ?? "target"}`;
      const cancelled = cancelEventExecution(execution, reason, nowIso(this.clock));
      await this.repositories.eventExecutions.save(cancelled);
      const cancelledOccurrence = transitionOccurrence(
        currentOccurrence,
        "CANCELLED",
      );
      await this.repositories.scheduledOccurrences.update(cancelledOccurrence);
      return {
        kind: ExecutionStartResultKind.CANCELLED,
        occurrence: cancelledOccurrence,
        execution: cancelled,
      };
    }

    try {
      if (units > 0) {
        const updatedAt = nowIso(this.clock);
        for (const budget of budgets) {
          await this.repositories.proactiveMessageBudgets.save(
            consumeProactiveMessages(budget, units, updatedAt),
          );
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "budget persistence failed";
      const failed = failEventExecution(execution, reason, nowIso(this.clock));
      await this.repositories.eventExecutions.save(failed);
      const failedOccurrence = transitionOccurrence(currentOccurrence, "FAILED");
      await this.repositories.scheduledOccurrences.update(failedOccurrence);
      return { kind: ExecutionStartResultKind.FAILED, occurrence: failedOccurrence, execution: failed };
    }

    return { kind: ExecutionStartResultKind.STARTED, occurrence: currentOccurrence, execution };
  }
}

export function createEventExecutionCoordinator(
  repositories: DomainRepositories,
  clock?: ExecutionCoordinatorClock,
): EventExecutionCoordinator {
  return new EventExecutionCoordinator(repositories, clock);
}
