import type { Character } from "./character.ts";
import type { MemoryItem } from "./memory.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export const StoryArcStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export type StoryArcStatus = (typeof StoryArcStatus)[keyof typeof StoryArcStatus];

export const StoryNodeType = {
  MILESTONE: "MILESTONE",
  TURNING_POINT: "TURNING_POINT",
  SCENE_SEED: "SCENE_SEED",
  CHECKPOINT: "CHECKPOINT",
  ENDING: "ENDING",
} as const;

export type StoryNodeType = (typeof StoryNodeType)[keyof typeof StoryNodeType];

export const StoryNodeStatus = {
  DRAFT: "DRAFT",
  PLANNED: "PLANNED",
  READY: "READY",
  GENERATED: "GENERATED",
  LOCKED: "LOCKED",
} as const;

export type StoryNodeStatus = (typeof StoryNodeStatus)[keyof typeof StoryNodeStatus];

export const StoryEdgeType = {
  LEADS_TO: "LEADS_TO",
  BRANCHES_TO: "BRANCHES_TO",
  BLOCKS: "BLOCKS",
  UNLOCKS: "UNLOCKS",
  PARALLEL: "PARALLEL",
} as const;

export type StoryEdgeType = (typeof StoryEdgeType)[keyof typeof StoryEdgeType];

export const PromptTemplateType = {
  WORLD: "WORLD",
  CHARACTER: "CHARACTER",
  RELATIONSHIP: "RELATIONSHIP",
  STORY_NODE: "STORY_NODE",
  MEMORY_RETRIEVAL: "MEMORY_RETRIEVAL",
  OUTPUT_FORMAT: "OUTPUT_FORMAT",
} as const;

export type PromptTemplateType = (typeof PromptTemplateType)[keyof typeof PromptTemplateType];

export const MemoryCandidateStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MERGED: "MERGED",
} as const;

export type MemoryCandidateStatus =
  (typeof MemoryCandidateStatus)[keyof typeof MemoryCandidateStatus];

export interface StoryArc {
  id: string;
  storyWorldId: string;
  title: string;
  summary: string;
  status: StoryArcStatus;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryArcInput {
  id: string;
  storyWorld: StoryWorld;
  title: string;
  summary?: string;
  status?: StoryArcStatus;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryNode {
  id: string;
  storyWorldId: string;
  arcId: string;
  title: string;
  nodeType: StoryNodeType;
  status: StoryNodeStatus;
  timeMode: "ABSOLUTE" | "RELATIVE" | "FLOATING";
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
  summary: string;
  generationGoal: string;
  requiredFacts: readonly string[];
  involvedCharacterIds: readonly string[];
  referencedMemoryIds: readonly string[];
  creatorNotes?: string;
  priority: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoryNodeInput {
  id: string;
  storyWorld: StoryWorld;
  arc: StoryArc;
  title: string;
  nodeType: StoryNodeType;
  status?: StoryNodeStatus;
  timeMode: StoryNode["timeMode"];
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
  summary?: string;
  generationGoal?: string;
  requiredFacts?: readonly string[];
  involvedCharacters?: readonly Character[];
  referencedMemories?: readonly MemoryItem[];
  creatorNotes?: string;
  priority?: number;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoryEdge {
  id: string;
  storyWorldId: string;
  arcId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: StoryEdgeType;
  condition: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryEdgeInput {
  id: string;
  storyWorld: StoryWorld;
  arc: StoryArc;
  fromNode: StoryNode;
  toNode: StoryNode;
  edgeType: StoryEdgeType;
  condition?: string;
  weight?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplate {
  id: string;
  storyWorldId: string;
  type: PromptTemplateType;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateInput {
  id: string;
  storyWorld: StoryWorld;
  type: PromptTemplateType;
  name: string;
  content: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCandidate {
  id: string;
  storyWorldId: string;
  proposedMemoryId?: string;
  sourceRef: string;
  content: string;
  rationale: string;
  confidence: number;
  status: MemoryCandidateStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerCharacterId?: string;
  mergedIntoMemoryId?: string;
}

export interface MemoryCandidateInput {
  id: string;
  storyWorld: StoryWorld;
  proposedMemoryId?: string;
  sourceRef: string;
  content: string;
  rationale?: string;
  confidence: number;
  status?: MemoryCandidateStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerCharacter?: Character;
  mergedIntoMemory?: MemoryItem;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function assertOptionalTimestamp(value: string | undefined, field: string): void {
  if (value !== undefined) assertIsoTimestamp(value, field);
}

function assertStringList(values: readonly string[], field: string): readonly string[] {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmptyString(value, field);
    if (seen.has(value)) throw new TypeError(`${field} contains duplicate value`);
    seen.add(value);
  }
  return [...values];
}

function assertCharactersBelongToWorld(
  characters: readonly Character[],
  storyWorldId: string,
  field: string,
): readonly string[] {
  const ids = new Set<string>();
  for (const character of characters) {
    if (character.storyWorldId !== storyWorldId) {
      throw new TypeError(`${field} must belong to storyWorld`);
    }
    if (ids.has(character.id)) throw new TypeError(`${field} contains duplicate character`);
    ids.add(character.id);
  }
  return [...ids];
}

function assertMemoriesBelongToWorld(
  memories: readonly MemoryItem[],
  storyWorldId: string,
  field: string,
): readonly string[] {
  const ids = new Set<string>();
  for (const memory of memories) {
    if (memory.storyWorldId !== storyWorldId) {
      throw new TypeError(`${field} must belong to storyWorld`);
    }
    if (ids.has(memory.id)) throw new TypeError(`${field} contains duplicate memory`);
    ids.add(memory.id);
  }
  return [...ids];
}

function assertFiniteWeight(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be between 0 and 1`);
  }
}

export function createStoryArc(input: StoryArcInput): StoryArc {
  assertNonEmptyString(input.id, "storyArc.id");
  assertNonEmptyString(input.storyWorld.id, "storyArc.storyWorld.id");
  assertNonEmptyString(input.title, "storyArc.title");
  assertIsoTimestamp(input.createdAt, "storyArc.createdAt");
  assertIsoTimestamp(input.updatedAt, "storyArc.updatedAt");
  assertOptionalTimestamp(input.startAt, "storyArc.startAt");
  assertOptionalTimestamp(input.endAt, "storyArc.endAt");
  const status = input.status ?? StoryArcStatus.DRAFT;
  assertEnum(status, Object.values(StoryArcStatus), "storyArc.status");
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    title: input.title,
    summary: input.summary ?? "",
    status,
    ...(input.startAt === undefined ? {} : { startAt: input.startAt }),
    ...(input.endAt === undefined ? {} : { endAt: input.endAt }),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createStoryNode(input: StoryNodeInput): StoryNode {
  assertNonEmptyString(input.id, "storyNode.id");
  assertNonEmptyString(input.title, "storyNode.title");
  if (input.arc.storyWorldId !== input.storyWorld.id) throw new TypeError("storyNode.arc must belong to storyWorld");
  assertEnum(input.nodeType, Object.values(StoryNodeType), "storyNode.nodeType");
  assertEnum(input.timeMode, ["ABSOLUTE", "RELATIVE", "FLOATING"], "storyNode.timeMode");
  const status = input.status ?? StoryNodeStatus.DRAFT;
  assertEnum(status, Object.values(StoryNodeStatus), "storyNode.status");
  assertOptionalTimestamp(input.scheduledAt, "storyNode.scheduledAt");
  assertOptionalTimestamp(input.windowStart, "storyNode.windowStart");
  assertOptionalTimestamp(input.windowEnd, "storyNode.windowEnd");
  assertIsoTimestamp(input.createdAt, "storyNode.createdAt");
  assertIsoTimestamp(input.updatedAt, "storyNode.updatedAt");
  const priority = input.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0) throw new RangeError("storyNode.priority must be a non-negative integer");
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    arcId: input.arc.id,
    title: input.title,
    nodeType: input.nodeType,
    status,
    timeMode: input.timeMode,
    ...(input.scheduledAt === undefined ? {} : { scheduledAt: input.scheduledAt }),
    ...(input.windowStart === undefined ? {} : { windowStart: input.windowStart }),
    ...(input.windowEnd === undefined ? {} : { windowEnd: input.windowEnd }),
    summary: input.summary ?? "",
    generationGoal: input.generationGoal ?? "",
    requiredFacts: assertStringList(input.requiredFacts ?? [], "storyNode.requiredFacts"),
    involvedCharacterIds: assertCharactersBelongToWorld(input.involvedCharacters ?? [], input.storyWorld.id, "storyNode.involvedCharacters"),
    referencedMemoryIds: assertMemoriesBelongToWorld(input.referencedMemories ?? [], input.storyWorld.id, "storyNode.referencedMemories"),
    ...(input.creatorNotes === undefined ? {} : { creatorNotes: input.creatorNotes }),
    priority,
    locked: input.locked ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createStoryEdge(input: StoryEdgeInput): StoryEdge {
  assertNonEmptyString(input.id, "storyEdge.id");
  if (input.arc.storyWorldId !== input.storyWorld.id) throw new TypeError("storyEdge.arc must belong to storyWorld");
  for (const node of [input.fromNode, input.toNode]) {
    if (node.storyWorldId !== input.storyWorld.id || node.arcId !== input.arc.id) {
      throw new TypeError("storyEdge nodes must belong to the same storyWorld and arc");
    }
  }
  if (input.fromNode.id === input.toNode.id) throw new TypeError("storyEdge cannot connect a node to itself");
  assertEnum(input.edgeType, Object.values(StoryEdgeType), "storyEdge.edgeType");
  const weight = input.weight ?? 1;
  assertFiniteWeight(weight, "storyEdge.weight");
  assertIsoTimestamp(input.createdAt, "storyEdge.createdAt");
  assertIsoTimestamp(input.updatedAt, "storyEdge.updatedAt");
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    arcId: input.arc.id,
    fromNodeId: input.fromNode.id,
    toNodeId: input.toNode.id,
    edgeType: input.edgeType,
    condition: input.condition ?? "",
    weight,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createPromptTemplate(input: PromptTemplateInput): PromptTemplate {
  assertNonEmptyString(input.id, "promptTemplate.id");
  assertNonEmptyString(input.name, "promptTemplate.name");
  assertNonEmptyString(input.content, "promptTemplate.content");
  assertEnum(input.type, Object.values(PromptTemplateType), "promptTemplate.type");
  assertIsoTimestamp(input.createdAt, "promptTemplate.createdAt");
  assertIsoTimestamp(input.updatedAt, "promptTemplate.updatedAt");
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    type: input.type,
    name: input.name,
    content: input.content,
    isDefault: input.isDefault ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function createMemoryCandidate(input: MemoryCandidateInput): MemoryCandidate {
  assertNonEmptyString(input.id, "memoryCandidate.id");
  assertNonEmptyString(input.sourceRef, "memoryCandidate.sourceRef");
  assertNonEmptyString(input.content, "memoryCandidate.content");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new RangeError("memoryCandidate.confidence must be between 0 and 1");
  }
  const status = input.status ?? MemoryCandidateStatus.PENDING;
  assertEnum(status, Object.values(MemoryCandidateStatus), "memoryCandidate.status");
  assertIsoTimestamp(input.createdAt, "memoryCandidate.createdAt");
  assertOptionalTimestamp(input.reviewedAt, "memoryCandidate.reviewedAt");
  if (input.reviewerCharacter && input.reviewerCharacter.storyWorldId !== input.storyWorld.id) {
    throw new TypeError("memoryCandidate.reviewerCharacter must belong to storyWorld");
  }
  if (input.mergedIntoMemory && input.mergedIntoMemory.storyWorldId !== input.storyWorld.id) {
    throw new TypeError("memoryCandidate.mergedIntoMemory must belong to storyWorld");
  }
  return {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    ...(input.proposedMemoryId === undefined ? {} : { proposedMemoryId: input.proposedMemoryId }),
    sourceRef: input.sourceRef,
    content: input.content,
    rationale: input.rationale ?? "",
    confidence: input.confidence,
    status,
    createdAt: input.createdAt,
    ...(input.reviewedAt === undefined ? {} : { reviewedAt: input.reviewedAt }),
    ...(input.reviewerCharacter === undefined ? {} : { reviewerCharacterId: input.reviewerCharacter.id }),
    ...(input.mergedIntoMemory === undefined ? {} : { mergedIntoMemoryId: input.mergedIntoMemory.id }),
  };
}
