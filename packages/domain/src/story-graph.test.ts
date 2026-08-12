import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryArcStatus,
  StoryEdgeType,
  StoryNodeStatus,
  StoryNodeType,
  PromptTemplateType,
  MemoryCandidateStatus,
  CharacterRole,
  createStoryArc,
  createStoryNode,
  createStoryEdge,
  createPromptTemplate,
  createMemoryCandidate,
} from "./index.ts";
import type { StoryWorld } from "./index.ts";
const world: StoryWorld = {
  id: "w1",
  name: "Test World",
  timezone: "Asia/Shanghai",
  storyMode: "STATIC",
  relationshipDynamicsEnabled: false,
};

const otherWorld: StoryWorld = {
  ...world,
  id: "w2",
};

const arc = createStoryArc({
  id: "arc-1",
  storyWorld: world,
  title: "Act I",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function node(id: string, overrides?: Partial<Parameters<typeof createStoryNode>[0]>) {
  return createStoryNode({
    id,
    storyWorld: world,
    arc,
    title: `Node ${id}`,
    nodeType: StoryNodeType.SCENE_SEED,
    timeMode: "FLOATING",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

const char = {
  id: "c1",
  displayName: "Alice",
  role: CharacterRole.AI,
  storyWorldId: "w1",
  timezone: "Asia/Shanghai",
  birthDate: "2000-01-01",
};

const memory = {
  id: "m1",
  storyWorldId: "w1",
  content: "Alice likes tea",
  kind: "EVENT_FACT" as const,
  visibility: "PRIVATE" as const,
  source: "USER_AUTHORED" as const,
  sourceRef: "msg-1",
  audienceCharacterIds: ["c1"],
  confidence: 0.9,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// --- StoryArc ---

test("creates story arc with defaults", () => {
  assert.equal(arc.id, "arc-1");
  assert.equal(arc.storyWorldId, "w1");
  assert.equal(arc.status, StoryArcStatus.DRAFT);
  assert.equal(arc.summary, "");
  assert.equal(arc.startAt, undefined);
  assert.equal(arc.endAt, undefined);
});

test("creates story arc with explicit status and dates", () => {
  const result = createStoryArc({
    id: "arc-2",
    storyWorld: world,
    title: "Act II",
    status: StoryArcStatus.ACTIVE,
    summary: "The rising action",
    startAt: "2026-02-01T00:00:00.000Z",
    endAt: "2026-03-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.summary, "The rising action");
  assert.equal(result.startAt, "2026-02-01T00:00:00.000Z");
});

test("rejects story arc with empty title", () => {
  assert.throws(
    () => createStoryArc({ id: "a", storyWorld: world, title: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
    { name: "TypeError" },
  );
});

test("rejects story arc with invalid status", () => {
  assert.throws(
    () => createStoryArc({ id: "a", storyWorld: world, title: "X", status: "INVALID" as StoryArcStatus, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
    { name: "TypeError" },
  );
});

// --- StoryNode ---

test("creates story node with defaults", () => {
  const n = node("n1");
  assert.equal(n.status, StoryNodeStatus.DRAFT);
  assert.equal(n.summary, "");
  assert.equal(n.generationGoal, "");
  assert.deepEqual(n.requiredFacts, []);
  assert.deepEqual(n.involvedCharacterIds, []);
  assert.deepEqual(n.referencedMemoryIds, []);
  assert.equal(n.priority, 0);
  assert.equal(n.locked, false);
});

test("creates story node with characters and memories from same world", () => {
  const n = node("n2", {
    involvedCharacters: [char],
    referencedMemories: [memory],
    creatorNotes: "Important node",
    priority: 5,
    locked: true,
  });
  assert.deepEqual(n.involvedCharacterIds, ["c1"]);
  assert.deepEqual(n.referencedMemoryIds, ["m1"]);
  assert.equal(n.creatorNotes, "Important node");
  assert.equal(n.priority, 5);
  assert.equal(n.locked, true);
});

test("rejects story node with arc from different world", () => {
  const foreignArc = { ...arc, storyWorldId: "w2" };
  assert.throws(
    () => createStoryNode({
      id: "n-bad",
      storyWorld: world,
      arc: foreignArc,
      title: "Bad",
      nodeType: StoryNodeType.MILESTONE,
      timeMode: "FLOATING",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError", message: /storyWorld/ },
  );
});

test("rejects story node with character from different world", () => {
  const foreignChar = { ...char, storyWorldId: "w2" };
  assert.throws(
    () => node("n-bad", { involvedCharacters: [foreignChar] }),
    { name: "TypeError", message: /storyWorld/ },
  );
});

test("rejects story node with duplicate characters", () => {
  assert.throws(
    () => node("n-dup", { involvedCharacters: [char, char] }),
    { name: "TypeError", message: /duplicate/ },
  );
});

test("rejects story node with negative priority", () => {
  assert.throws(
    () => node("n-pri", { priority: -1 }),
    { name: "RangeError" },
  );
});

test("rejects story node with invalid time mode", () => {
  assert.throws(
    () => node("n-tm", { timeMode: "INVALID" as "FLOATING" }),
    { name: "TypeError" },
  );
});

// --- StoryEdge ---

test("creates story edge with defaults", () => {
  const n1 = node("e-from");
  const n2 = node("e-to");
  const e = createStoryEdge({
    id: "e1",
    storyWorld: world,
    arc,
    fromNode: n1,
    toNode: n2,
    edgeType: StoryEdgeType.LEADS_TO,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(e.edgeType, "LEADS_TO");
  assert.equal(e.condition, "");
  assert.equal(e.weight, 1);
});

test("rejects story edge self-loop", () => {
  const n = node("self");
  assert.throws(
    () => createStoryEdge({
      id: "e-self",
      storyWorld: world,
      arc,
      fromNode: n,
      toNode: n,
      edgeType: StoryEdgeType.LEADS_TO,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError", message: /itself/ },
  );
});

test("rejects story edge with nodes from different world", () => {
  const n1 = node("ew1");
  const foreignNode = { ...node("ew2"), storyWorldId: "w2" };
  assert.throws(
    () => createStoryEdge({
      id: "e-cross",
      storyWorld: world,
      arc,
      fromNode: n1,
      toNode: foreignNode,
      edgeType: StoryEdgeType.LEADS_TO,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError", message: /storyWorld/ },
  );
});

test("rejects story edge with out-of-range weight", () => {
  const n1 = node("wfrom");
  const n2 = node("wto");
  assert.throws(
    () => createStoryEdge({
      id: "e-w",
      storyWorld: world,
      arc,
      fromNode: n1,
      toNode: n2,
      edgeType: StoryEdgeType.BRANCHES_TO,
      weight: 1.5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "RangeError", message: /weight/ },
  );
});

test("rejects story edge with negative weight", () => {
  const n1 = node("wnfrom");
  const n2 = node("wnto");
  assert.throws(
    () => createStoryEdge({
      id: "e-nw",
      storyWorld: world,
      arc,
      fromNode: n1,
      toNode: n2,
      edgeType: StoryEdgeType.BRANCHES_TO,
      weight: -0.1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "RangeError", message: /weight/ },
  );
});

test("rejects story edge with invalid edge type", () => {
  const n1 = node("etfrom");
  const n2 = node("etto");
  assert.throws(
    () => createStoryEdge({
      id: "e-et",
      storyWorld: world,
      arc,
      fromNode: n1,
      toNode: n2,
      edgeType: "INVALID" as StoryEdgeType,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError" },
  );
});

// --- PromptTemplate ---

test("creates prompt template with defaults", () => {
  const t = createPromptTemplate({
    id: "pt-1",
    storyWorld: world,
    type: PromptTemplateType.STORY_NODE,
    name: "Node Template",
    content: "Write a scene about {{character}}.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(t.isDefault, false);
  assert.equal(t.type, "STORY_NODE");
});

test("rejects prompt template with empty content", () => {
  assert.throws(
    () => createPromptTemplate({
      id: "pt-e",
      storyWorld: world,
      type: PromptTemplateType.WORLD,
      name: "Empty",
      content: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError" },
  );
});

test("rejects prompt template with invalid type", () => {
  assert.throws(
    () => createPromptTemplate({
      id: "pt-inv",
      storyWorld: world,
      type: "INVALID" as PromptTemplateType,
      name: "Bad",
      content: "content",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError" },
  );
});

// --- MemoryCandidate ---

test("creates memory candidate with defaults", () => {
  const mc = createMemoryCandidate({
    id: "mc-1",
    storyWorld: world,
    sourceRef: "node:n1",
    content: "Alice remembers the tea ceremony",
    confidence: 0.8,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(mc.status, MemoryCandidateStatus.PENDING);
  assert.equal(mc.rationale, "");
  assert.equal(mc.reviewedAt, undefined);
  assert.equal(mc.reviewerCharacterId, undefined);
  assert.equal(mc.mergedIntoMemoryId, undefined);
});

test("creates memory candidate with reviewer and merged memory", () => {
  const mc = createMemoryCandidate({
    id: "mc-2",
    storyWorld: world,
    sourceRef: "node:n2",
    content: "The secret garden",
    confidence: 0.6,
    status: MemoryCandidateStatus.APPROVED,
    rationale: "Strong evidence",
    reviewerCharacter: char,
    mergedIntoMemory: memory,
    reviewedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(mc.status, "APPROVED");
  assert.equal(mc.reviewerCharacterId, "c1");
  assert.equal(mc.mergedIntoMemoryId, "m1");
  assert.equal(mc.reviewedAt, "2026-01-02T00:00:00.000Z");
});

test("rejects memory candidate with confidence > 1", () => {
  assert.throws(
    () => createMemoryCandidate({
      id: "mc-hi",
      storyWorld: world,
      sourceRef: "ref",
      content: "content",
      confidence: 1.5,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "RangeError", message: /confidence/ },
  );
});

test("rejects memory candidate with negative confidence", () => {
  assert.throws(
    () => createMemoryCandidate({
      id: "mc-lo",
      storyWorld: world,
      sourceRef: "ref",
      content: "content",
      confidence: -0.1,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "RangeError", message: /confidence/ },
  );
});

test("rejects memory candidate with reviewer from different world", () => {
  const foreignChar = { ...char, storyWorldId: "w2" };
  assert.throws(
    () => createMemoryCandidate({
      id: "mc-fc",
      storyWorld: world,
      sourceRef: "ref",
      content: "content",
      confidence: 0.5,
      reviewerCharacter: foreignChar,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError", message: /storyWorld/ },
  );
});

test("rejects memory candidate with merged memory from different world", () => {
  const foreignMemory = { ...memory, storyWorldId: "w2" };
  assert.throws(
    () => createMemoryCandidate({
      id: "mc-fm",
      storyWorld: world,
      sourceRef: "ref",
      content: "content",
      confidence: 0.5,
      mergedIntoMemory: foreignMemory,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    { name: "TypeError", message: /storyWorld/ },
  );
});
