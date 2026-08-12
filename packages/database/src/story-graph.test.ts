import assert from "node:assert/strict";
import test from "node:test";

import {
  createStoryArc,
  createStoryNode,
  createStoryEdge,
  createPromptTemplate,
  createMemoryCandidate,
  createStoryWorld,
  createCharacter,
  createMemoryItem,
  StoryArcStatus,
  StoryEdgeType,
  StoryNodeType,
  PromptTemplateType,
  MemoryCandidateStatus,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
} from "@living-network/domain";
import type { Character, MemoryItem, StoryWorld } from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "sg-world",
  name: "Story Graph Test",
  timezone: "Asia/Shanghai",
  storyMode: "STATIC",
  relationshipDynamicsEnabled: false,
});

const char: Character = createCharacter({
  id: "sg-char",
  displayName: "Alice",
  role: "AI",
  storyWorldId: world.id,
  timezone: "Asia/Shanghai",
  birthDate: "2000-01-01",
});

const mem: MemoryItem = createMemoryItem({
  id: "sg-mem",
  storyWorld: world,
  content: "Alice likes tea",
  kind: MemoryKind.CONVERSATION_SUMMARY,
  visibility: MemoryVisibility.PRIVATE,
  source: MemorySource.USER_AUTHORED,
  subjectCharacter: char,
  audienceCharacters: [char],
  confidence: 0.9,
  createdAt: "2026-01-01T00:00:00.000Z",
});

function arc(id: string) {
  return createStoryArc({
    id,
    storyWorld: world,
    title: `Arc ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

function node(id: string, arcId: string) {
  return createStoryNode({
    id,
    storyWorld: world,
    arc: { ...arc("ref-arc"), id: arcId, storyWorldId: world.id },
    title: `Node ${id}`,
    nodeType: StoryNodeType.SCENE_SEED,
    timeMode: "FLOATING",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

test("in-memory story arc CRUD and cascade delete", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [char],
    memories: [mem],
  });

  const a = arc("arc-1");
  await repositories.storyArcs!.save(a);
  const n1 = node("n1", "arc-1");
  const n2 = node("n2", "arc-1");
  await repositories.storyNodes!.save(n1);
  await repositories.storyNodes!.save(n2);
  const e = createStoryEdge({
    id: "e1",
    storyWorld: world,
    arc: a,
    fromNode: n1,
    toNode: n2,
    edgeType: StoryEdgeType.LEADS_TO,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repositories.storyEdges!.save(e);

  assert.equal((await repositories.storyArcs!.listByStoryWorld(world.id)).length, 1);
  assert.ok(await repositories.storyArcs!.getById("arc-1"));
  assert.equal((await repositories.storyNodes!.listByArc("arc-1")).length, 2);
  assert.equal((await repositories.storyEdges!.listByArc("arc-1")).length, 1);

  await repositories.storyArcs!.delete("arc-1");
  assert.equal(await repositories.storyArcs!.getById("arc-1"), undefined);
  assert.equal((await repositories.storyNodes!.listByArc("arc-1")).length, 0);
  assert.equal((await repositories.storyEdges!.listByArc("arc-1")).length, 0);
});

test("in-memory story node cascade delete removes edges", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world] });
  const a = arc("arc-nd");
  await repositories.storyArcs!.save(a);
  const n1 = node("nd-from", "arc-nd");
  const n2 = node("nd-to", "arc-nd");
  await repositories.storyNodes!.save(n1);
  await repositories.storyNodes!.save(n2);
  const e = createStoryEdge({
    id: "nd-edge",
    storyWorld: world,
    arc: a,
    fromNode: n1,
    toNode: n2,
    edgeType: StoryEdgeType.BRANCHES_TO,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repositories.storyEdges!.save(e);

  await repositories.storyNodes!.delete("nd-from");
  assert.equal(await repositories.storyNodes!.getById("nd-from"), undefined);
  assert.equal(await repositories.storyEdges!.getById("nd-edge"), undefined);
});

test("in-memory story graph enforces reference integrity", async () => {
  const foreignWorld = createStoryWorld({
    id: "sg-foreign",
    name: "Foreign World",
    timezone: "Asia/Shanghai",
    storyMode: "STATIC",
    relationshipDynamicsEnabled: false,
  });
  const repositories = createInMemoryRepositories({ worlds: [world] });

  await assert.rejects(
    repositories.storyArcs!.save(createStoryArc({
      id: "bad-arc",
      storyWorld: foreignWorld,
      title: "Foreign Arc",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    /unknown story world/,
  );

  const a = arc("arc-ref");
  await repositories.storyArcs!.save(a);
  await assert.rejects(
    repositories.storyNodes!.save(createStoryNode({
      id: "bad-node",
      storyWorld: foreignWorld,
      arc: createStoryArc({
        id: "arc-ref-foreign",
        storyWorld: foreignWorld,
        title: "Foreign Arc",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      title: "Foreign Node",
      nodeType: StoryNodeType.SCENE_SEED,
      timeMode: "FLOATING",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    /unknown story world/,
  );
});

test("in-memory prompt template CRUD", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world] });
  const t = createPromptTemplate({
    id: "pt-1",
    storyWorld: world,
    type: PromptTemplateType.STORY_NODE,
    name: "Node Template",
    content: "Write a scene.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await repositories.promptTemplates!.save(t);
  assert.ok(await repositories.promptTemplates!.getById("pt-1"));
  assert.equal((await repositories.promptTemplates!.listByStoryWorld(world.id)).length, 1);
  await repositories.promptTemplates!.delete("pt-1");
  assert.equal(await repositories.promptTemplates!.getById("pt-1"), undefined);
});

test("in-memory memory candidate stores and lists by world", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [char], memories: [mem] });
  const mc = createMemoryCandidate({
    id: "mc-1",
    storyWorld: world,
    sourceRef: "node:n1",
    content: "Alice remembers the tea ceremony",
    confidence: 0.8,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await repositories.memoryCandidates!.save(mc);
  const read = await repositories.memoryCandidates!.getById("mc-1");
  assert.ok(read);
  assert.equal(read.status, MemoryCandidateStatus.PENDING);
  assert.equal((await repositories.memoryCandidates!.listByStoryWorld(world.id)).length, 1);
});
