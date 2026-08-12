import type {
  CharacterId,
  MemoryCandidateId,
  MemoryId,
  PromptTemplateId,
  StoryArcId,
  StoryEdgeId,
  StoryNodeId,
  StoryWorldId,
} from "./ids.ts";

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

export interface StoryArcDto {
  id: StoryArcId;
  storyWorldId: StoryWorldId;
  title: string;
  summary: string;
  status: StoryArcStatus;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoryArcRequest {
  id: StoryArcId;
  storyWorldId: StoryWorldId;
  title: string;
  summary?: string;
  status?: StoryArcStatus;
  startAt?: string;
  endAt?: string;
}

export interface UpdateStoryArcRequest {
  title?: string;
  summary?: string;
  status?: StoryArcStatus;
  startAt?: string;
  endAt?: string;
}

export interface StoryNodeDto {
  id: StoryNodeId;
  storyWorldId: StoryWorldId;
  arcId: StoryArcId;
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
  involvedCharacterIds: readonly CharacterId[];
  referencedMemoryIds: readonly MemoryId[];
  creatorNotes?: string;
  priority: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoryNodeRequest {
  id: StoryNodeId;
  storyWorldId: StoryWorldId;
  arcId: StoryArcId;
  title: string;
  nodeType: StoryNodeType;
  status?: StoryNodeStatus;
  timeMode: "ABSOLUTE" | "RELATIVE" | "FLOATING";
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
  summary?: string;
  generationGoal?: string;
  requiredFacts?: readonly string[];
  involvedCharacterIds?: readonly CharacterId[];
  referencedMemoryIds?: readonly MemoryId[];
  creatorNotes?: string;
  priority?: number;
  locked?: boolean;
}

export interface UpdateStoryNodeRequest {
  title?: string;
  nodeType?: StoryNodeType;
  status?: StoryNodeStatus;
  timeMode?: "ABSOLUTE" | "RELATIVE" | "FLOATING";
  scheduledAt?: string;
  windowStart?: string;
  windowEnd?: string;
  summary?: string;
  generationGoal?: string;
  requiredFacts?: readonly string[];
  involvedCharacterIds?: readonly CharacterId[];
  referencedMemoryIds?: readonly MemoryId[];
  creatorNotes?: string;
  priority?: number;
  locked?: boolean;
}

export interface StoryEdgeDto {
  id: StoryEdgeId;
  storyWorldId: StoryWorldId;
  arcId: StoryArcId;
  fromNodeId: StoryNodeId;
  toNodeId: StoryNodeId;
  edgeType: StoryEdgeType;
  condition: string;
  weight: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoryEdgeRequest {
  id: StoryEdgeId;
  storyWorldId: StoryWorldId;
  arcId: StoryArcId;
  fromNodeId: StoryNodeId;
  toNodeId: StoryNodeId;
  edgeType: StoryEdgeType;
  condition?: string;
  weight?: number;
}

export interface UpdateStoryEdgeRequest {
  edgeType?: StoryEdgeType;
  condition?: string;
  weight?: number;
}

export interface PromptTemplateDto {
  id: PromptTemplateId;
  storyWorldId: StoryWorldId;
  type: PromptTemplateType;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptTemplateRequest {
  id: PromptTemplateId;
  storyWorldId: StoryWorldId;
  type: PromptTemplateType;
  name: string;
  content: string;
  isDefault?: boolean;
}

export interface UpdatePromptTemplateRequest {
  type?: PromptTemplateType;
  name?: string;
  content?: string;
  isDefault?: boolean;
}

export interface PromptPreviewDto {
  storyWorldId: StoryWorldId;
  arcId?: StoryArcId;
  nodeId?: StoryNodeId;
  sections: readonly { title: string; content: string }[];
  finalPrompt: string;
}

export interface MemoryCandidateDto {
  id: MemoryCandidateId;
  storyWorldId: StoryWorldId;
  proposedMemoryId?: MemoryId;
  sourceRef: string;
  content: string;
  rationale: string;
  confidence: number;
  status: MemoryCandidateStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerCharacterId?: CharacterId;
  mergedIntoMemoryId?: MemoryId;
}

export interface CreateMemoryCandidateRequest {
  id: MemoryCandidateId;
  storyWorldId: StoryWorldId;
  sourceRef: string;
  content: string;
  rationale?: string;
  confidence: number;
}

export interface ReviewMemoryCandidateRequest {
  reviewerCharacterId?: CharacterId;
  content?: string;
  status: Extract<MemoryCandidateStatus, "APPROVED" | "REJECTED" | "MERGED">;
  mergedIntoMemoryId?: MemoryId;
}
