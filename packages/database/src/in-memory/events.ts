import {
  isPlanActiveAt,
  isBudgetActiveAt,
  assertScheduledOccurrence,
  assertWorldEventDefinition,
  assertCharacterPlan,
  assertProactiveMessageBudget,
  assertEventExecution,
  assertBehaviorAction,
  type StoryWorld,
  type Character,
  type WorldEventDefinition,
  type ScheduledOccurrence,
  type CharacterPlan,
  type ProactiveMessageBudget,
  type EventExecution,
  type BehaviorAction,
  type JsonObject,
} from "@living-network/domain";
import type {
  WorldEventDefinitionRepository,
  ScheduledOccurrenceRepository,
  ScheduledOccurrenceWriteResult,
  CharacterPlanRepository,
  ProactiveMessageBudgetRepository,
  EventExecutionRepository,
  BehaviorActionRepository,
} from "../repositories.ts";

// ── Copy helpers ──

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

// ── Repository factories ──

export function createWorldEventDefinitionRepo(
  map: Map<string, WorldEventDefinition>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): WorldEventDefinitionRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter((def) => def.storyWorldId === storyWorldId)
        .sort((left, right) => left.eventKey.localeCompare(right.eventKey) || left.id.localeCompare(right.id))
        .map(copyEventDefinition),
    getById: async (id) => {
      const def = map.get(id);
      return def ? copyEventDefinition(def) : undefined;
    },
    save: async (def) => {
      assertWorldEventDefinition(def);
      if (!worldMap.has(def.storyWorldId)) {
        throw new TypeError(`Event definition ${def.id} references an unknown story world`);
      }
      for (const characterId of def.targetCharacterIds) {
        const character = characterMap.get(characterId);
        if (!character || character.storyWorldId !== def.storyWorldId) {
          throw new TypeError(`Event definition ${def.id} references an invalid character`);
        }
      }
      const existing = map.get(def.id);
      if (existing && existing.eventKey !== def.eventKey) {
        throw new TypeError(`Event definition id cannot change eventKey: ${def.id}`);
      }
      map.set(def.id, copyEventDefinition(def));
    },
  };
}

export function createScheduledOccurrenceRepo(
  map: Map<string, ScheduledOccurrence>,
  definitionMap: Map<string, WorldEventDefinition>,
): ScheduledOccurrenceRepository {
  return {
    getById: async (id) => {
      const occurrence = map.get(id);
      return occurrence ? copyOccurrence(occurrence) : undefined;
    },
    getByOccurrenceKey: async (storyWorldId, occurrenceKey) => {
      const occurrence = [...map.values()].find(
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
      return [...map.values()]
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
      return [...map.values()]
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
      return [...map.values()]
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
      const definition = definitionMap.get(occurrence.definitionId);
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
      const existingById = map.get(occurrence.id);
      if (existingById && existingById.occurrenceKey !== occurrence.occurrenceKey) {
        throw new TypeError(`Scheduled occurrence id conflict: ${occurrence.id}`);
      }
      const existing = [...map.values()].find(
        (candidate) =>
          candidate.storyWorldId === occurrence.storyWorldId &&
          candidate.occurrenceKey === occurrence.occurrenceKey,
      );
      if (existing) return { occurrence: copyOccurrence(existing), inserted: false };
      map.set(occurrence.id, copyOccurrence(occurrence));
      return { occurrence: copyOccurrence(occurrence), inserted: true };
    },
    update: async (occurrence) => {
      assertScheduledOccurrence(occurrence);
      const existing = map.get(occurrence.id);
      if (!existing) throw new TypeError(`Unknown scheduled occurrence: ${occurrence.id}`);
      const definition = definitionMap.get(occurrence.definitionId);
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
      map.set(occurrence.id, copyOccurrence(occurrence));
    },
  };
}

export function createCharacterPlanRepo(
  map: Map<string, CharacterPlan>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): CharacterPlanRepository {
  return {
    listActive: async (characterId, at) =>
      [...map.values()]
        .filter((plan) => plan.characterId === characterId && isPlanActiveAt(plan, at))
        .sort(
          (left, right) =>
            left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id),
        )
        .map(copyPlan),
    save: async (plan) => {
      assertCharacterPlan(plan);
      if (!worldMap.has(plan.storyWorldId)) {
        throw new TypeError(`Character plan ${plan.id} references an unknown story world`);
      }
      if (!characterMap.has(plan.characterId)) {
        throw new TypeError(`Character plan ${plan.id} references an unknown character`);
      }
      map.set(plan.id, copyPlan(plan));
    },
  };
}

export function createProactiveMessageBudgetRepo(
  map: Map<string, ProactiveMessageBudget>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): ProactiveMessageBudgetRepository {
  return {
    getActive: async (storyWorldId, characterId, at) => {
      const budget = [...map.values()].find(
        (candidate) => candidate.characterId === characterId && candidate.storyWorldId === storyWorldId && isBudgetActiveAt(candidate, at),
      );
      return budget ? copyBudget(budget) : undefined;
    },
    save: async (budget) => {
      assertProactiveMessageBudget(budget);
      if (!worldMap.has(budget.storyWorldId)) {
        throw new TypeError(`Proactive message budget ${budget.id} references an unknown story world`);
      }
      if (!characterMap.has(budget.characterId)) {
        throw new TypeError(`Proactive message budget ${budget.id} references an unknown character`);
      }
      map.set(budget.id, copyBudget(budget));
    },
  };
}

export function createEventExecutionRepo(
  map: Map<string, EventExecution>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  definitionMap: Map<string, WorldEventDefinition>,
): EventExecutionRepository {
  return {
    getById: async (id) => {
      const execution = map.get(id);
      return execution ? copyExecution(execution) : undefined;
    },
    getLatestByOccurrence: async (occurrenceId) => {
      const executions = [...map.values()]
        .filter((execution) => execution.occurrenceId === occurrenceId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
      return executions[0] ? copyExecution(executions[0]) : undefined;
    },
    save: async (execution) => {
      assertEventExecution(execution);
      if (!worldMap.has(execution.storyWorldId)) {
        throw new TypeError(`Event execution ${execution.id} references an unknown story world`);
      }
      if (!definitionMap.has(execution.definitionId)) {
        throw new TypeError(`Event execution ${execution.id} references an unknown event definition`);
      }
      for (const characterId of execution.targetCharacterIds) {
        if (!characterMap.has(characterId)) {
          throw new TypeError(`Event execution ${execution.id} references an unknown character`);
        }
      }
      const duplicateAttempt = [...map.values()].find(
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
      map.set(execution.id, copyExecution(execution));
    },
  };
}

export function createBehaviorActionRepo(
  map: Map<string, BehaviorAction>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): BehaviorActionRepository {
  return {
    getById: async (id) => {
      const action = map.get(id);
      return action ? copyAction(action) : undefined;
    },
    listByExecution: async (executionId) =>
      [...map.values()]
        .filter((action) => action.executionId === executionId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
        .map(copyAction),
    save: async (action) => {
      assertBehaviorAction(action);
      if (!worldMap.has(action.storyWorldId)) {
        throw new TypeError(`Behavior action ${action.id} references an unknown story world`);
      }
      if (!characterMap.has(action.actorCharacterId)) {
        throw new TypeError(`Behavior action ${action.id} references an unknown character`);
      }
      map.set(action.id, copyAction(action));
    },
  };
}
