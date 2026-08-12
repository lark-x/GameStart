import {
  assertBehaviorAction,
  assertCharacterPlan,
  assertEventExecution,
  assertProactiveMessageBudget,
  assertScheduledOccurrence,
  assertWorldEventDefinition,
  type BehaviorAction,
  type CharacterPlan,
  type EventExecution,
  type JsonObject,
  type ProactiveMessageBudget,
  type ScheduledOccurrence,
  type ScheduledOccurrenceStatus as ScheduledOccurrenceStatusValue,
  type WorldEventDefinition,
} from "@living-network/domain";
import type {
  BehaviorActionRepository,
  CharacterPlanRepository,
  EventExecutionRepository,
  ProactiveMessageBudgetRepository,
  ScheduledOccurrenceRepository,
  ScheduledOccurrenceWriteResult,
  WorldEventDefinitionRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  optionalString,
  optionalTimestamp,
  requiredLocalTime,
  stringArray,
  jsonObject,
} from "./utils.ts";

function mapWorldEventDefinitionRow(row: SqlRow): WorldEventDefinition {
  const recurrenceKind = requiredString(
    row.recurrence_kind,
    "world_event_definitions.recurrence_kind",
  );
  if (recurrenceKind !== "ONCE" && recurrenceKind !== "ANNUAL") {
    throw new TypeError(
      `Database row world_event_definitions.recurrence_kind has an unsupported value`,
    );
  }
  const recurrence = recurrenceKind === "ONCE"
    ? {
        kind: "ONCE" as const,
        runAt: requiredTimestamp(row.run_at, "world_event_definitions.run_at"),
      }
    : {
        kind: "ANNUAL" as const,
        month: requiredNumber(row.recurrence_month, "world_event_definitions.recurrence_month"),
        day: requiredNumber(row.recurrence_day, "world_event_definitions.recurrence_day"),
        localTime: requiredLocalTime(
          row.recurrence_local_time,
          "world_event_definitions.recurrence_local_time",
        ),
      };
  const definition: WorldEventDefinition = {
    id: requiredString(row.id, "world_event_definitions.id"),
    storyWorldId: requiredString(
      row.story_world_id,
      "world_event_definitions.story_world_id",
    ),
    eventKey: requiredString(row.event_key, "world_event_definitions.event_key"),
    name: requiredString(row.name, "world_event_definitions.name"),
    triggerSource: requiredString(
      row.trigger_source,
      "world_event_definitions.trigger_source",
    ) as WorldEventDefinition["triggerSource"],
    timezone: requiredString(row.timezone, "world_event_definitions.timezone"),
    recurrence,
    targetCharacterIds: stringArray(
      row.target_character_ids,
      "world_event_definitions.target_character_ids",
    ),
    recipientCharacterIds: stringArray(
      row.recipient_character_ids,
      "world_event_definitions.recipient_character_ids",
    ),
    outputs: {
      sendMessage: requiredBoolean(row.output_send_message, "world_event_definitions.output_send_message"),
      publishMoment: requiredBoolean(row.output_publish_moment, "world_event_definitions.output_publish_moment"),
      generateImage: requiredBoolean(row.output_generate_image, "world_event_definitions.output_generate_image"),
    },
    priority: requiredNumber(row.priority, "world_event_definitions.priority"),
    enabled: requiredBoolean(row.enabled, "world_event_definitions.enabled"),
    createdAt: requiredTimestamp(row.created_at, "world_event_definitions.created_at"),
  };
  const cooldownSeconds = row.cooldown_seconds === null || row.cooldown_seconds === undefined
    ? undefined
    : requiredNumber(row.cooldown_seconds, "world_event_definitions.cooldown_seconds");
  if (cooldownSeconds !== undefined) definition.cooldownSeconds = cooldownSeconds;
  assertWorldEventDefinition(definition);
  return definition;
}

function mapScheduledOccurrenceRow(row: SqlRow): ScheduledOccurrence {
  const occurrence: ScheduledOccurrence = {
    id: requiredString(row.id, "scheduled_occurrences.id"),
    definitionId: requiredString(
      row.definition_id,
      "scheduled_occurrences.definition_id",
    ),
    storyWorldId: requiredString(
      row.story_world_id,
      "scheduled_occurrences.story_world_id",
    ),
    eventKey: requiredString(row.event_key, "scheduled_occurrences.event_key"),
    scheduledFor: requiredTimestamp(row.scheduled_for, "scheduled_occurrences.scheduled_for"),
    timezone: requiredString(row.timezone, "scheduled_occurrences.timezone"),
    occurrenceKey: requiredString(
      row.occurrence_key,
      "scheduled_occurrences.occurrence_key",
    ),
    status: requiredString(
      row.status,
      "scheduled_occurrences.status",
    ) as ScheduledOccurrenceStatusValue,
    createdAt: requiredTimestamp(row.created_at, "scheduled_occurrences.created_at"),
  };
  assertScheduledOccurrence(occurrence);
  return occurrence;
}

function mapCharacterPlanRow(row: SqlRow): CharacterPlan {
  const plan: CharacterPlan = {
    id: requiredString(row.id, "character_plans.id"),
    storyWorldId: requiredString(row.story_world_id, "character_plans.story_world_id"),
    characterId: requiredString(row.character_id, "character_plans.character_id"),
    startsAt: requiredTimestamp(row.starts_at, "character_plans.starts_at"),
    endsAt: requiredTimestamp(row.ends_at, "character_plans.ends_at"),
    timezone: requiredString(row.timezone, "character_plans.timezone"),
    activity: requiredString(row.activity, "character_plans.activity"),
    interruptibility: requiredString(
      row.interruptibility,
      "character_plans.interruptibility",
    ) as CharacterPlan["interruptibility"],
    createdAt: requiredTimestamp(row.created_at, "character_plans.created_at"),
  };
  const location = optionalString(row.location, "character_plans.location");
  if (location !== undefined) plan.location = location;
  assertCharacterPlan(plan);
  return plan;
}

function mapEventExecutionRow(row: SqlRow): EventExecution {
  const execution: EventExecution = {
    id: requiredString(row.id, "event_executions.id"),
    occurrenceId: requiredString(row.occurrence_id, "event_executions.occurrence_id"),
    definitionId: requiredString(row.definition_id, "event_executions.definition_id"),
    storyWorldId: requiredString(row.story_world_id, "event_executions.story_world_id"),
    eventKey: requiredString(row.event_key, "event_executions.event_key"),
    targetCharacterIds: stringArray(
      row.target_character_ids,
      "event_executions.target_character_ids",
    ),
    attempt: requiredNumber(row.attempt, "event_executions.attempt"),
    ruleVersion: requiredString(row.rule_version, "event_executions.rule_version"),
    inputSnapshot: jsonObject(row.input_snapshot, "event_executions.input_snapshot") as JsonObject,
    status: requiredString(row.status, "event_executions.status") as EventExecution["status"],
    startedAt: requiredTimestamp(row.started_at, "event_executions.started_at"),
  };
  const finishedAt = optionalTimestamp(row.finished_at, "event_executions.finished_at");
  const outputSnapshot = row.output_snapshot === null || row.output_snapshot === undefined
    ? undefined
    : jsonObject(row.output_snapshot, "event_executions.output_snapshot") as JsonObject;
  const failureReason = optionalString(row.failure_reason, "event_executions.failure_reason");
  if (finishedAt !== undefined) execution.finishedAt = finishedAt;
  if (outputSnapshot !== undefined) execution.outputSnapshot = outputSnapshot;
  if (failureReason !== undefined) execution.failureReason = failureReason;
  assertEventExecution(execution);
  return execution;
}

function mapProactiveMessageBudgetRow(row: SqlRow): ProactiveMessageBudget {
  const budget: ProactiveMessageBudget = {
    id: requiredString(row.id, "proactive_message_budgets.id"),
    storyWorldId: requiredString(
      row.story_world_id,
      "proactive_message_budgets.story_world_id",
    ),
    characterId: requiredString(row.character_id, "proactive_message_budgets.character_id"),
    windowStartsAt: requiredTimestamp(
      row.window_starts_at,
      "proactive_message_budgets.window_starts_at",
    ),
    windowEndsAt: requiredTimestamp(
      row.window_ends_at,
      "proactive_message_budgets.window_ends_at",
    ),
    limit: requiredNumber(row.limit_count, "proactive_message_budgets.limit_count"),
    consumed: requiredNumber(row.consumed, "proactive_message_budgets.consumed"),
    updatedAt: requiredTimestamp(row.updated_at, "proactive_message_budgets.updated_at"),
  };
  assertProactiveMessageBudget(budget);
  return budget;
}

function mapBehaviorActionRow(row: SqlRow): BehaviorAction {
  const action: BehaviorAction = {
    id: requiredString(row.id, "behavior_actions.id"),
    executionId: requiredString(row.execution_id, "behavior_actions.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "behavior_actions.story_world_id"),
    actorCharacterId: requiredString(
      row.actor_character_id,
      "behavior_actions.actor_character_id",
    ),
    kind: requiredString(row.kind, "behavior_actions.kind") as BehaviorAction["kind"],
    status: requiredString(row.status, "behavior_actions.status") as BehaviorAction["status"],
    priority: requiredNumber(row.priority, "behavior_actions.priority"),
    payload: jsonObject(row.payload, "behavior_actions.payload") as JsonObject,
    createdAt: requiredTimestamp(row.created_at, "behavior_actions.created_at"),
  };
  assertBehaviorAction(action);
  return action;
}

const EVENT_DEFINITION_SELECT = `
  SELECT id, story_world_id, event_key, name, trigger_source, timezone,
         recurrence_kind, run_at, recurrence_month, recurrence_day,
         recurrence_local_time, target_character_ids, priority,
         recipient_character_ids, output_send_message, output_publish_moment, output_generate_image,
         cooldown_seconds, enabled, created_at
  FROM world_event_definitions`;

const OCCURRENCE_SELECT = `
  SELECT id, definition_id, story_world_id, event_key, scheduled_for,
         timezone, occurrence_key, status, created_at
  FROM scheduled_occurrences`;

const CHARACTER_PLAN_SELECT = `
  SELECT id, story_world_id, character_id, starts_at, ends_at, timezone,
         location, activity, interruptibility, created_at
  FROM character_plans`;

const EVENT_EXECUTION_SELECT = `
  SELECT id, occurrence_id, definition_id, story_world_id, event_key,
         target_character_ids, attempt, rule_version, input_snapshot,
         status, started_at, finished_at, output_snapshot, failure_reason
  FROM event_executions`;

const PROACTIVE_MESSAGE_BUDGET_SELECT = `
  SELECT id, story_world_id, character_id, window_starts_at, window_ends_at,
         limit_count, consumed, updated_at
  FROM proactive_message_budgets`;

const BEHAVIOR_ACTION_SELECT = `
  SELECT id, execution_id, story_world_id, actor_character_id, kind,
         status, priority, payload, created_at
  FROM behavior_actions`;

export function createEventsExecutionRepositories(client: SqlClient): {
  worldEventDefinitions: WorldEventDefinitionRepository;
  scheduledOccurrences: ScheduledOccurrenceRepository;
  characterPlans: CharacterPlanRepository;
  proactiveMessageBudgets: ProactiveMessageBudgetRepository;
  eventExecutions: EventExecutionRepository;
  behaviorActions: BehaviorActionRepository;
} {
  const worldEventDefinitions: WorldEventDefinitionRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${EVENT_DEFINITION_SELECT}
           WHERE story_world_id = $1
           ORDER BY id`,
          [storyWorldId],
        );
        return result.rows.map(mapWorldEventDefinitionRow);
      },
      getById: async (id) => {
        const result = await client.query(
          `${EVENT_DEFINITION_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapWorldEventDefinitionRow(row) : undefined;
      },
      save: async (definition) => {
        assertWorldEventDefinition(definition);
        const runAt = definition.recurrence.kind === "ONCE"
          ? definition.recurrence.runAt
          : null;
        const month = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.month
          : null;
        const day = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.day
          : null;
        const localTime = definition.recurrence.kind === "ANNUAL"
          ? definition.recurrence.localTime
          : null;
        await client.query(
          `INSERT INTO world_event_definitions (
             id, story_world_id, event_key, name, trigger_source, timezone,
             recurrence_kind, run_at, recurrence_month, recurrence_day,
             recurrence_local_time, target_character_ids, recipient_character_ids,
             output_send_message, output_publish_moment, output_generate_image, priority,
             cooldown_seconds, enabled, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             event_key = EXCLUDED.event_key,
             name = EXCLUDED.name,
             trigger_source = EXCLUDED.trigger_source,
             timezone = EXCLUDED.timezone,
             recurrence_kind = EXCLUDED.recurrence_kind,
             run_at = EXCLUDED.run_at,
             recurrence_month = EXCLUDED.recurrence_month,
             recurrence_day = EXCLUDED.recurrence_day,
             recurrence_local_time = EXCLUDED.recurrence_local_time,
             target_character_ids = EXCLUDED.target_character_ids,
             recipient_character_ids = EXCLUDED.recipient_character_ids,
             output_send_message = EXCLUDED.output_send_message,
             output_publish_moment = EXCLUDED.output_publish_moment,
             output_generate_image = EXCLUDED.output_generate_image,
             priority = EXCLUDED.priority,
             cooldown_seconds = EXCLUDED.cooldown_seconds,
             enabled = EXCLUDED.enabled,
             created_at = EXCLUDED.created_at`,
          [
            definition.id,
            definition.storyWorldId,
            definition.eventKey,
            definition.name,
            definition.triggerSource,
            definition.timezone,
            definition.recurrence.kind,
            runAt,
            month,
            day,
            localTime,
            [...definition.targetCharacterIds],
            [...definition.recipientCharacterIds],
            definition.outputs.sendMessage,
            definition.outputs.publishMoment,
            definition.outputs.generateImage,
            definition.priority,
            definition.cooldownSeconds ?? null,
            definition.enabled,
            definition.createdAt,
          ],
        );
      },
    };

  const scheduledOccurrences: ScheduledOccurrenceRepository = {
      getById: async (id) => {
        const result = await client.query(
          `${OCCURRENCE_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapScheduledOccurrenceRow(row) : undefined;
      },
      getByOccurrenceKey: async (storyWorldId, occurrenceKey) => {
        const result = await client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1 AND occurrence_key = $2`,
          [storyWorldId, occurrenceKey],
        );
        const row = result.rows[0];
        return row ? mapScheduledOccurrenceRow(row) : undefined;
      },
      listPending: async (storyWorldId, scheduledBefore, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        if (Number.isNaN(Date.parse(scheduledBefore))) {
          throw new TypeError("scheduledBefore must be a valid ISO timestamp");
        }
        const result = await client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1
             AND status = 'PENDING'
             AND scheduled_for <= $2
           ORDER BY scheduled_for, id
           LIMIT $3`,
          [storyWorldId, scheduledBefore, limit],
        );
        return result.rows.map(mapScheduledOccurrenceRow);
      },
      listForCreatorScan: async (storyWorldId, horizonEnd, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("scheduled occurrence limit must be a positive integer");
        }
        if (Number.isNaN(Date.parse(horizonEnd))) {
          throw new TypeError("horizonEnd must be a valid ISO timestamp");
        }
        const result = await client.query(
          `${OCCURRENCE_SELECT}` +
          " WHERE story_world_id = $1" +
          " AND status NOT IN ('COMPLETED', 'CANCELLED')" +
          " AND scheduled_for <= $2" +
          " ORDER BY scheduled_for, id LIMIT $3",
          [storyWorldId, horizonEnd, limit],
        );
        return result.rows.map(mapScheduledOccurrenceRow);
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
        const result = await client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1
             AND scheduled_for >= $2
             AND scheduled_for < $3
           ORDER BY scheduled_for, id
           LIMIT $4`,
          [storyWorldId, startsAt, endsAt, limit],
        );
        return result.rows.map(mapScheduledOccurrenceRow);
      },
      save: async (occurrence): Promise<ScheduledOccurrenceWriteResult> => {
        assertScheduledOccurrence(occurrence);
        const inserted = await client.query(
          `INSERT INTO scheduled_occurrences (
             id, definition_id, story_world_id, event_key, scheduled_for,
             timezone, occurrence_key, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (story_world_id, occurrence_key) DO NOTHING
           RETURNING id, definition_id, story_world_id, event_key, scheduled_for,
                     timezone, occurrence_key, status, created_at`,
          [
            occurrence.id,
            occurrence.definitionId,
            occurrence.storyWorldId,
            occurrence.eventKey,
            occurrence.scheduledFor,
            occurrence.timezone,
            occurrence.occurrenceKey,
            occurrence.status,
            occurrence.createdAt,
          ],
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { occurrence: mapScheduledOccurrenceRow(insertedRow), inserted: true };
        }
        const existing = await client.query(
          `${OCCURRENCE_SELECT}
           WHERE story_world_id = $1 AND occurrence_key = $2`,
          [occurrence.storyWorldId, occurrence.occurrenceKey],
        );
        const existingRow = existing.rows[0];
        if (!existingRow) {
          throw new TypeError("Scheduled occurrence id or key conflict could not be resolved");
        }
        return { occurrence: mapScheduledOccurrenceRow(existingRow), inserted: false };
      },
      update: async (occurrence) => {
        assertScheduledOccurrence(occurrence);
        const result = await client.query(
          `UPDATE scheduled_occurrences
           SET status = $1
           WHERE id = $2
           RETURNING id, definition_id, story_world_id, event_key, scheduled_for,
                     timezone, occurrence_key, status, created_at`,
          [occurrence.status, occurrence.id],
        );
        const row = result.rows[0];
        if (!row) throw new TypeError(`Unknown scheduled occurrence: ${occurrence.id}`);
        const updated = mapScheduledOccurrenceRow(row);
        if (
          updated.definitionId !== occurrence.definitionId ||
          updated.storyWorldId !== occurrence.storyWorldId ||
          updated.occurrenceKey !== occurrence.occurrenceKey
        ) {
          throw new TypeError(`Scheduled occurrence identity cannot change: ${occurrence.id}`);
        }
      },
    };

  const characterPlans: CharacterPlanRepository = {
      listActive: async (characterId, at) => {
        const result = await client.query(
          `${CHARACTER_PLAN_SELECT}
           WHERE character_id = $1
             AND starts_at <= $2
             AND ends_at > $2
           ORDER BY starts_at, id`,
          [characterId, at],
        );
        return result.rows.map(mapCharacterPlanRow);
      },
      save: async (plan) => {
        assertCharacterPlan(plan);
        await client.query(
          `INSERT INTO character_plans (
             id, story_world_id, character_id, starts_at, ends_at, timezone,
             location, activity, interruptibility, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             character_id = EXCLUDED.character_id,
             starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at,
             timezone = EXCLUDED.timezone,
             location = EXCLUDED.location,
             activity = EXCLUDED.activity,
             interruptibility = EXCLUDED.interruptibility,
             created_at = EXCLUDED.created_at`,
          [
            plan.id,
            plan.storyWorldId,
            plan.characterId,
            plan.startsAt,
            plan.endsAt,
            plan.timezone,
            plan.location ?? null,
            plan.activity,
            plan.interruptibility,
            plan.createdAt,
          ],
        );
      },
    };

  const proactiveMessageBudgets: ProactiveMessageBudgetRepository = {
      getActive: async (storyWorldId, characterId, at) => {
        const result = await client.query(
          `${PROACTIVE_MESSAGE_BUDGET_SELECT}
           WHERE story_world_id = $1
             AND character_id = $2
             AND window_starts_at <= $3
             AND window_ends_at > $3
           ORDER BY window_starts_at DESC, id
           LIMIT 1`,
          [storyWorldId, characterId, at],
        );
        const row = result.rows[0];
        return row ? mapProactiveMessageBudgetRow(row) : undefined;
      },
      save: async (budget) => {
        assertProactiveMessageBudget(budget);
        await client.query(
          `INSERT INTO proactive_message_budgets (
             id, story_world_id, character_id, window_starts_at, window_ends_at,
             limit_count, consumed, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             character_id = EXCLUDED.character_id,
             window_starts_at = EXCLUDED.window_starts_at,
             window_ends_at = EXCLUDED.window_ends_at,
             limit_count = EXCLUDED.limit_count,
             consumed = EXCLUDED.consumed,
             updated_at = EXCLUDED.updated_at`,
          [
            budget.id,
            budget.storyWorldId,
            budget.characterId,
            budget.windowStartsAt,
            budget.windowEndsAt,
            budget.limit,
            budget.consumed,
            budget.updatedAt,
          ],
        );
      },
    };

  const eventExecutions: EventExecutionRepository = {
      getById: async (id) => {
        const result = await client.query(
          `${EVENT_EXECUTION_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapEventExecutionRow(row) : undefined;
      },
      getLatestByOccurrence: async (occurrenceId) => {
        const result = await client.query(
          `${EVENT_EXECUTION_SELECT}
           WHERE occurrence_id = $1
           ORDER BY attempt DESC, id DESC
           LIMIT 1`,
          [occurrenceId],
        );
        const row = result.rows[0];
        return row ? mapEventExecutionRow(row) : undefined;
      },
      save: async (execution) => {
        assertEventExecution(execution);
        await client.query(
          `INSERT INTO event_executions (
             id, occurrence_id, definition_id, story_world_id, event_key,
             target_character_ids, attempt, rule_version, input_snapshot,
             status, started_at, finished_at, output_snapshot, failure_reason
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             occurrence_id = EXCLUDED.occurrence_id,
             definition_id = EXCLUDED.definition_id,
             story_world_id = EXCLUDED.story_world_id,
             event_key = EXCLUDED.event_key,
             target_character_ids = EXCLUDED.target_character_ids,
             attempt = EXCLUDED.attempt,
             rule_version = EXCLUDED.rule_version,
             input_snapshot = EXCLUDED.input_snapshot,
             status = EXCLUDED.status,
             started_at = EXCLUDED.started_at,
             finished_at = EXCLUDED.finished_at,
             output_snapshot = EXCLUDED.output_snapshot,
             failure_reason = EXCLUDED.failure_reason`,
          [
            execution.id,
            execution.occurrenceId,
            execution.definitionId,
            execution.storyWorldId,
            execution.eventKey,
            [...execution.targetCharacterIds],
            execution.attempt,
            execution.ruleVersion,
            execution.inputSnapshot,
            execution.status,
            execution.startedAt,
            execution.finishedAt ?? null,
            execution.outputSnapshot ?? null,
            execution.failureReason ?? null,
          ],
        );
      },
    };

  const behaviorActions: BehaviorActionRepository = {
      getById: async (id) => {
        const result = await client.query(`${BEHAVIOR_ACTION_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapBehaviorActionRow(row) : undefined;
      },
      listByExecution: async (executionId) => {
        const result = await client.query(
          `${BEHAVIOR_ACTION_SELECT}
           WHERE execution_id = $1
           ORDER BY priority, id`,
          [executionId],
        );
        return result.rows.map(mapBehaviorActionRow);
      },
      save: async (action) => {
        assertBehaviorAction(action);
        await client.query(
          `INSERT INTO behavior_actions (
             id, execution_id, story_world_id, actor_character_id, kind,
             status, priority, payload, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             actor_character_id = EXCLUDED.actor_character_id,
             kind = EXCLUDED.kind,
             status = EXCLUDED.status,
             priority = EXCLUDED.priority,
             payload = EXCLUDED.payload,
             created_at = EXCLUDED.created_at`,
          [
            action.id,
            action.executionId,
            action.storyWorldId,
            action.actorCharacterId,
            action.kind,
            action.status,
            action.priority,
            action.payload,
            action.createdAt,
          ],
        );
      },
    };

  return {
    worldEventDefinitions, scheduledOccurrences, characterPlans,
    proactiveMessageBudgets, eventExecutions, behaviorActions,
  };
}
