import assert from "node:assert/strict";
import test from "node:test";
import {
  EventDispatchAction,
  EventExecutionStatus,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  TriggerSource,
} from "../../../packages/contracts/src/index.ts";
import type {
  EventExecutionDto,
  EventRecurrenceDto,
  ScheduledOccurrenceDto,
  WorldEventDefinitionDto,
} from "../../../packages/contracts/src/index.ts";
import {
  previewCreatorEventDispatch,
  scanCreatorEventCandidates,
} from "./creator-events.ts";

const NOW = "2026-08-09T00:00:00.000Z";

const definition = (
  id: string,
  options: {
    triggerSource?: WorldEventDefinitionDto["triggerSource"];
    recurrence?: EventRecurrenceDto;
    recipients?: readonly string[];
    generateImage?: boolean;
    enabled?: boolean;
  } = {},
): WorldEventDefinitionDto => ({
  id,
  storyWorldId: "world",
  eventKey: id,
  name: id,
  triggerSource: options.triggerSource ?? TriggerSource.STORY_NODE,
  timezone: "Asia/Shanghai",
  recurrence: options.recurrence ?? { kind: EventRecurrenceKind.ONCE, runAt: NOW },
  targetCharacterIds: ["actor"],
  recipientCharacterIds: options.recipients ?? ["recipient"],
  outputs: {
    sendMessage: true,
    publishMoment: true,
    generateImage: options.generateImage ?? false,
  },
  priority: 1,
  enabled: options.enabled ?? true,
  createdAt: NOW,
});

const occurrence = (
  id: string,
  definitionId: string,
  scheduledFor: string,
  status: ScheduledOccurrenceDto["status"],
  occurrenceKey = id,
): ScheduledOccurrenceDto => ({
  id,
  definitionId,
  storyWorldId: "world",
  eventKey: definitionId,
  scheduledFor,
  timezone: "Asia/Shanghai",
  occurrenceKey,
  status,
  createdAt: NOW,
});

const execution = (
  id: string,
  occurrenceId: string,
  status: EventExecutionDto["status"],
  startedAt: string,
): EventExecutionDto => ({
  id,
  occurrenceId,
  definitionId: occurrenceId,
  storyWorldId: "world",
  eventKey: occurrenceId,
  targetCharacterIds: ["actor"],
  attempt: 1,
  ruleVersion: "1",
  inputSnapshot: {},
  status,
  startedAt,
});

test("扫描已有 occurrence，并保持输入无副作用", () => {
  const definitions = [
    definition("overdue"),
    definition("upcoming"),
    definition("failed"),
    definition("stalled"),
    definition("disabled", { enabled: false }),
  ];
  const occurrences = [
    occurrence("overdue-o", "overdue", "2026-08-08T00:00:00Z", ScheduledOccurrenceStatus.PENDING),
    occurrence("upcoming-o", "upcoming", "2026-08-10T00:00:00Z", ScheduledOccurrenceStatus.PENDING),
    occurrence("failed-o", "failed", NOW, ScheduledOccurrenceStatus.FAILED),
    occurrence("stalled-o", "stalled", NOW, ScheduledOccurrenceStatus.RUNNING),
  ];
  const executions = [
    execution("failed-e", "failed-o", EventExecutionStatus.FAILED, NOW),
    execution("stalled-e", "stalled-o", EventExecutionStatus.RUNNING, "2026-08-08T23:45:00Z"),
  ];
  const before = JSON.stringify({ definitions, occurrences, executions });
  const found = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions,
    occurrences,
    executions,
  });

  assert.deepEqual(new Set(found.map((item) => item.category)), new Set(["OVERDUE", "UPCOMING", "FAILED", "STALLED"]));
  assert.equal(found.some((item) => item.definition.id === "disabled"), false);
  assert.equal(JSON.stringify({ definitions, occurrences, executions }), before);
});

test("投影未物化 ONCE，并按 definition.id:runAt 去重", () => {
  const runAt = "2026-08-08T20:00:00+08:00";
  const item = definition("once", {
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt },
  });
  const projected = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [item],
    occurrences: [],
  });

  assert.equal(projected.length, 1);
  assert.equal(projected[0]!.category, "OVERDUE");
  assert.equal(projected[0]!.projected, true);
  assert.equal(projected[0]!.occurrence!.status, ScheduledOccurrenceStatus.PENDING);
  assert.equal(projected[0]!.occurrence!.occurrenceKey, `once:${runAt}`);

  const materialized = occurrence("real", "once", runAt, ScheduledOccurrenceStatus.PENDING, `once:${runAt}`);
  const deduplicated = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [item],
    occurrences: [materialized],
  });
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0]!.occurrence!.id, "real");
  assert.equal(deduplicated[0]!.projected, undefined);
});

test("ANNUAL 使用世界时区当前年份并把本地时间换算为 UTC", () => {
  const annual = definition("annual", {
    recurrence: {
      kind: EventRecurrenceKind.ANNUAL,
      month: 1,
      day: 2,
      localTime: "08:30",
    },
  });
  const found = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: "2026-12-31T16:30:00.000Z",
    definitions: [annual],
    occurrences: [],
  });

  assert.equal(found.length, 1);
  assert.equal(found[0]!.category, "UPCOMING");
  assert.equal(found[0]!.occurrence!.occurrenceKey, "annual:2027-01-02");
  assert.equal(found[0]!.scheduledFor, "2027-01-02T00:30:00.000Z");
  assert.equal(found[0]!.projected, true);
});

test("未来窗口包含终点，排除终点之后，并校验 horizonDays", () => {
  const atBoundary = definition("boundary", {
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-16T00:00:00.000Z" },
  });
  const outside = definition("outside", {
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-16T00:00:00.001Z" },
  });
  const found = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [atBoundary, outside],
    occurrences: [],
  });
  assert.deepEqual(found.map((item) => item.definition.id), ["boundary"]);

  for (const horizonDays of [0, 32, 1.5]) {
    assert.throws(() => scanCreatorEventCandidates({
      worldId: "world",
      worldTimezone: "Asia/Shanghai",
      now: NOW,
      horizonDays,
      definitions: [],
      occurrences: [],
    }), /horizonDays/);
  }
});

test("MANUAL 使用传入 now，且不会生成 occurrence", () => {
  const found = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [definition("manual", { triggerSource: TriggerSource.MANUAL })],
    occurrences: [],
  });
  assert.equal(found[0]!.category, "MANUAL");
  assert.equal(found[0]!.scheduledFor, NOW);
  assert.equal(found[0]!.occurrence, undefined);
});

test("业务风险仅为警告，投影补执行仍可确认", () => {
  const risky = definition("risky", {
    recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-08T00:00:00Z" },
    recipients: [],
    generateImage: true,
  });
  const [candidate] = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [risky],
    occurrences: [],
  });
  const preview = previewCreatorEventDispatch({
    worldId: "world",
    candidates: [candidate!],
    selections: [{
      candidateId: candidate!.id,
      action: EventDispatchAction.EXECUTE_EXISTING,
    }],
  });

  assert.equal(preview.canDispatch, true);
  assert.equal(preview.items.length, 1);
  assert.match(preview.items[0]!.effect, /物化投影排期/);
  assert.deepEqual(preview.risks, ["未配置消息接收者", "需要已配置的图片工作流"]);
});

test("候选不存在或动作非法会阻止确认", () => {
  const [candidate] = scanCreatorEventCandidates({
    worldId: "world",
    worldTimezone: "Asia/Shanghai",
    now: NOW,
    definitions: [definition("manual", { triggerSource: TriggerSource.MANUAL })],
    occurrences: [],
  });
  const preview = previewCreatorEventDispatch({
    worldId: "world",
    candidates: [candidate!],
    selections: [
      { candidateId: candidate!.id, action: EventDispatchAction.EXECUTE_EXISTING },
      { candidateId: "missing", action: EventDispatchAction.RUN_TRIAL },
    ],
  });
  assert.equal(preview.canDispatch, false);
  assert.equal(preview.items.length, 0);
});
