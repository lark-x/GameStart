import { createV2FactAssertion } from "@living-network/domain/v2";

export interface MemoryEvaluationCase {
  readonly caseId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly query: string;
  readonly expectedRequiredAssertionIds: readonly string[];
  readonly forbiddenAssertionIds?: readonly string[];
  readonly category:
    | "stable_fact"
    | "preference_change"
    | "relationship"
    | "episodic"
    | "long_range"
    | "scope"
    | "contradiction"
    | "historical";
}

export const EVALUATION_WORLD_ID = "world:eval";
export const EVALUATION_CONVERSATION_ID = "conversation:eval";

export const EVALUATION_FIXTURE_ASSERTIONS = [
  createV2FactAssertion({
    assertionId: "eval:birthday",
    batchId: "eval:batch:1",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local", label: "用户" },
    predicate: "birthday",
    object: { type: "text", value: "3 月 12 日" },
    kind: "profile",
    text: "用户的生日是 3 月 12 日",
    changeHint: "new",
    confidence: 0.98,
    importanceHint: 0.9,
    sourceMessageIds: ["eval:msg:20"],
    observedAt: "2026-08-01T00:00:00.000Z",
    extractorVersion: "fact.extract:v1",
  }),
  createV2FactAssertion({
    assertionId: "eval:coffee-latte",
    batchId: "eval:batch:2",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local" },
    predicate: "preferred_drink",
    object: { type: "text", value: "latte" },
    kind: "preference",
    text: "用户喜欢拿铁",
    changeHint: "new",
    confidence: 0.9,
    importanceHint: 0.6,
    sourceMessageIds: ["eval:msg:30"],
    observedAt: "2026-08-02T00:00:00.000Z",
    extractorVersion: "fact.extract:v1",
  }),
  createV2FactAssertion({
    assertionId: "eval:coffee-pour",
    batchId: "eval:batch:3",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    scopeType: "user",
    scopeId: "user:local",
    subject: { entityType: "user", entityId: "user:local" },
    predicate: "preferred_drink",
    object: { type: "text", value: "pour_over" },
    kind: "preference",
    text: "用户最近更喜欢手冲咖啡",
    changeHint: "replaces_previous",
    confidence: 0.95,
    importanceHint: 0.8,
    sourceMessageIds: ["eval:msg:240"],
    observedAt: "2026-08-10T00:00:00.000Z",
    extractorVersion: "fact.extract:v1",
  }),
  createV2FactAssertion({
    assertionId: "eval:scarf",
    batchId: "eval:batch:4",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    scopeType: "character",
    scopeId: "character:alice",
    subject: { entityType: "character", entityId: "character:alice", label: "Alice" },
    predicate: "received_gift",
    object: { type: "text", value: "蓝色围巾" },
    kind: "episodic",
    text: "用户送 Alice 一条蓝色围巾",
    changeHint: "new",
    confidence: 0.9,
    importanceHint: 0.6,
    sourceMessageIds: ["eval:msg:100"],
    observedAt: "2026-08-05T00:00:00.000Z",
    extractorVersion: "fact.extract:v1",
  }),
] as const;

export const EVALUATION_CASES: readonly MemoryEvaluationCase[] = [
  {
    caseId: "stable_fact_birthday",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    query: "我的生日是什么时候？",
    expectedRequiredAssertionIds: ["eval:birthday"],
    category: "stable_fact",
  },
  {
    caseId: "preference_change_current",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    query: "我现在更喜欢什么咖啡？",
    expectedRequiredAssertionIds: ["eval:coffee-pour"],
    forbiddenAssertionIds: ["eval:coffee-latte"],
    category: "preference_change",
  },
  {
    caseId: "episodic_gift",
    storyWorldId: EVALUATION_WORLD_ID,
    conversationId: EVALUATION_CONVERSATION_ID,
    query: "我以前送过 Alice 什么？",
    expectedRequiredAssertionIds: ["eval:scarf"],
    category: "episodic",
  },
];
