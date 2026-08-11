import type {
  CreatorEventCandidateCategory, CreatorEventCandidateDto, EventDispatchAction,
  EventDispatchPreviewDto, EventDispatchPreviewItemDto, EventExecutionDto,
  ScheduledOccurrenceDto, StoryWorldId, WorldEventDefinitionDto,
} from "@living-network/contracts";
import {
  CreatorEventCandidateCategory as Category, EventDispatchAction as Action,
  EventExecutionStatus, ScheduledOccurrenceStatus, TriggerSource,
} from "@living-network/contracts";

export interface CreatorEventScanInput {
  worldId: StoryWorldId;
  worldTimezone: string;
  definitions: readonly WorldEventDefinitionDto[];
  occurrences: readonly ScheduledOccurrenceDto[];
  executions?: readonly EventExecutionDto[];
  now?: string | Date;
  horizonDays?: number;
}
export interface EventDispatchPreviewInput {
  worldId: StoryWorldId;
  candidates: readonly CreatorEventCandidateDto[];
  selections: readonly { candidateId: string; action: EventDispatchAction }[];
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatter = (timezone: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const zonedParts = (time: number, timezone: string): LocalParts => {
  const values = Object.fromEntries(formatter(timezone).formatToParts(new Date(time))
    .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year!, month: values.month!, day: values.day!, hour: values.hour!, minute: values.minute!, second: values.second! };
};
const localToUtc = (local: LocalParts, timezone: string): number => {
  const desired = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  let guess = desired;
  for (let count = 0; count < 4; count += 1) {
    const actual = zonedParts(guess, timezone);
    const correction = desired - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += correction;
    if (correction === 0) break;
  }
  const resolved = zonedParts(guess, timezone);
  if ((Object.keys(local) as (keyof LocalParts)[]).some((key) => resolved[key] !== local[key])) {
    throw new RangeError("事件本地时间在指定时区中不存在或不唯一");
  }
  return guess;
};
const instant = (value: string | Date): number => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(time)) throw new RangeError(`无效时间: ${String(value)}`);
  return time;
};
const summaries = (definition: WorldEventDefinitionDto): readonly string[] => {
  const values: string[] = [];
  if (definition.outputs.sendMessage) values.push("发送角色消息");
  if (definition.outputs.publishMoment) values.push("发布朋友圈动态");
  if (definition.outputs.generateImage) values.push("生成图片");
  return values.length ? values : ["无输出"];
};
const risks = (definition: WorldEventDefinitionDto): readonly string[] => {
  const values: string[] = [];
  if (definition.outputs.sendMessage && !definition.recipientCharacterIds.length) values.push("未配置消息接收者");
  if (definition.outputs.generateImage) values.push("需要已配置的图片工作流");
  if (!definition.targetCharacterIds.length) values.push("未配置目标角色");
  return values;
};
const actions = (category: CreatorEventCandidateCategory): readonly EventDispatchAction[] =>
  category === Category.FAILED ? [Action.RETRY_FAILED] :
  category === Category.STALLED ? [] :
  category === Category.UPCOMING || category === Category.MANUAL ? [Action.RUN_TRIAL] :
  [Action.EXECUTE_EXISTING];

const makeCandidate = (
  category: CreatorEventCandidateCategory,
  definition: WorldEventDefinitionDto,
  scheduledFor: string,
  options: { occurrence?: ScheduledOccurrenceDto; execution?: EventExecutionDto; projected?: boolean } = {},
): CreatorEventCandidateDto => ({
  id: options.occurrence ? `${category}:${options.occurrence.id}` : `${category}:definition:${definition.id}`,
  category, worldId: definition.storyWorldId, definition,
  ...(options.occurrence ? { occurrence: options.occurrence } : {}),
  ...(options.execution ? { execution: options.execution } : {}),
  ...(options.projected === undefined ? {} : { projected: options.projected }),
  scheduledFor,
  targetCharacterIds: definition.targetCharacterIds,
  recipientCharacterIds: definition.recipientCharacterIds,
  outputSummary: summaries(definition),
  risks: risks(definition),
  allowedActions: actions(category),
});
const project = (
  definition: WorldEventDefinitionDto, occurrenceKey: string,
  scheduledFor: string, timezone: string, createdAt: string,
): ScheduledOccurrenceDto => ({
  id: `projected:${occurrenceKey}`, definitionId: definition.id,
  storyWorldId: definition.storyWorldId, eventKey: definition.eventKey,
  scheduledFor, timezone, occurrenceKey,
  status: ScheduledOccurrenceStatus.PENDING, createdAt,
});
const annualProject = (
  definition: WorldEventDefinitionDto, year: number, timezone: string, createdAt: string,
): ScheduledOccurrenceDto => {
  if (definition.recurrence.kind !== "ANNUAL") throw new TypeError("年度投影只接受 ANNUAL 事件");
  const date = `${year}-${String(definition.recurrence.month).padStart(2, "0")}-${String(definition.recurrence.day).padStart(2, "0")}`;
  const [hour, minute] = definition.recurrence.localTime.split(":").map(Number);
  const time = localToUtc({ year, month: definition.recurrence.month, day: definition.recurrence.day, hour: hour!, minute: minute!, second: 0 }, timezone);
  return project(definition, `${definition.id}:${date}`, new Date(time).toISOString(), timezone, createdAt);
};

export function scanCreatorEventCandidates(input: CreatorEventScanInput): readonly CreatorEventCandidateDto[] {
  formatter(input.worldTimezone).format();
  const horizonDays = input.horizonDays ?? 7;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
    throw new RangeError("horizonDays 必须是 1 到 31 之间的整数");
  }
  const now = instant(input.now ?? new Date());
  const nowIso = new Date(now).toISOString();
  const horizon = now + horizonDays * 86_400_000;
  const year = zonedParts(now, input.worldTimezone).year;
  const definitions = input.definitions.filter((item) => item.enabled && item.storyWorldId === input.worldId);
  const byId = new Map(definitions.map((item) => [item.id, item]));
  const executions = input.executions ?? [];
  const result: CreatorEventCandidateDto[] = [];

  for (const occurrence of input.occurrences) {
    const definition = byId.get(occurrence.definitionId);
    if (!definition || definition.triggerSource === TriggerSource.MANUAL ||
      occurrence.status === ScheduledOccurrenceStatus.COMPLETED ||
      occurrence.status === ScheduledOccurrenceStatus.CANCELLED) continue;
    const execution = executions.filter((item) => item.occurrenceId === occurrence.id)
      .sort((left, right) => right.attempt - left.attempt)[0];
    const scheduled = instant(occurrence.scheduledFor);
    if (occurrence.status === ScheduledOccurrenceStatus.FAILED || execution?.status === EventExecutionStatus.FAILED) {
      result.push(makeCandidate(Category.FAILED, definition, occurrence.scheduledFor, { occurrence, ...(execution ? { execution } : {}) }));
    } else if (occurrence.status === ScheduledOccurrenceStatus.RUNNING && execution &&
      now - instant(execution.startedAt) >= 900_000) {
      result.push(makeCandidate(Category.STALLED, definition, occurrence.scheduledFor, { occurrence, execution }));
    } else if (occurrence.status === ScheduledOccurrenceStatus.PENDING && scheduled <= now) {
      result.push(makeCandidate(Category.OVERDUE, definition, occurrence.scheduledFor, { occurrence }));
    } else if (occurrence.status === ScheduledOccurrenceStatus.PENDING && scheduled <= horizon) {
      result.push(makeCandidate(Category.UPCOMING, definition, occurrence.scheduledFor, { occurrence }));
    }
  }

  const existingKeys = new Set(input.occurrences
    .filter((item) => item.storyWorldId === input.worldId).map((item) => item.occurrenceKey));
  for (const definition of definitions) {
    if (definition.triggerSource === TriggerSource.MANUAL) {
      result.push(makeCandidate(Category.MANUAL, definition, nowIso));
      continue;
    }
    const occurrence = definition.recurrence.kind === "ONCE"
      ? project(definition, `${definition.id}:${definition.recurrence.runAt}`,
          new Date(instant(definition.recurrence.runAt)).toISOString(), input.worldTimezone, nowIso)
      : annualProject(definition, year, input.worldTimezone, nowIso);
    if (existingKeys.has(occurrence.occurrenceKey)) continue;
    const scheduled = instant(occurrence.scheduledFor);
    if (scheduled <= now) {
      result.push(makeCandidate(Category.OVERDUE, definition, occurrence.scheduledFor, { occurrence, projected: true }));
    } else if (scheduled <= horizon) {
      result.push(makeCandidate(Category.UPCOMING, definition, occurrence.scheduledFor, { occurrence, projected: true }));
    }
  }
  return result.sort((left, right) => instant(left.scheduledFor) - instant(right.scheduledFor) || left.id.localeCompare(right.id));
}

export function previewCreatorEventDispatch(input: EventDispatchPreviewInput): EventDispatchPreviewDto {
  const byId = new Map(input.candidates.filter((item) => item.worldId === input.worldId).map((item) => [item.id, item]));
  const items: EventDispatchPreviewItemDto[] = [];
  const warnings: string[] = [];
  let invalid = false;
  for (const selection of input.selections) {
    const candidate = byId.get(selection.candidateId);
    if (!candidate) {
      warnings.push(`候选项不存在: ${selection.candidateId}`);
      invalid = true;
      continue;
    }
    if (!candidate.allowedActions.includes(selection.action)) {
      warnings.push(`动作不可用: ${selection.candidateId}`);
      invalid = true;
      continue;
    }
    const itemRisks = [...candidate.risks];
    if (selection.action === Action.RETRY_FAILED && !candidate.execution) itemRisks.push("缺少失败执行记录");
    warnings.push(...itemRisks);
    const effect = selection.action === Action.RUN_TRIAL
      ? `试演“${candidate.definition.name}”，不改变正式排期`
      : selection.action === Action.RETRY_FAILED
        ? `重试“${candidate.definition.name}”的失败执行`
        : candidate.projected
          ? `补执行“${candidate.definition.name}”并物化投影排期`
          : `补执行“${candidate.definition.name}”的既有排期`;
    items.push({ candidateId: candidate.id, action: selection.action, effect, risks: itemRisks });
  }
  return { worldId: input.worldId, items, risks: [...new Set(warnings)], canDispatch: input.selections.length > 0 && !invalid };
}
