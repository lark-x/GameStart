import { MemoryCandidateStatus, PromptTemplateType, StoryArcStatus, StoryEdgeType, StoryNodeStatus, StoryNodeType } from "../story-graph.ts";
import type { CreateMemoryCandidateRequest, CreatePromptTemplateRequest, CreateStoryArcRequest, CreateStoryEdgeRequest, CreateStoryNodeRequest, ReviewMemoryCandidateRequest, UpdateStoryArcRequest, UpdateStoryEdgeRequest, UpdateStoryNodeRequest, UpdatePromptTemplateRequest } from "../story-graph.ts";
import { type JsonSchema, idSchema, nonEmptyStringSchema, timestampSchema, stringListSchema, workflowObjectSchema } from "./shared.ts";

export const storyArcSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:story-arc",
  title: "StoryArc",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    title: nonEmptyStringSchema,
    summary: { type: "string" },
    status: { type: "string", enum: Object.values(StoryArcStatus) },
    startAt: timestampSchema,
    endAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "title", "summary", "status", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createStoryArcRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-story-arc-request",
  title: "CreateStoryArcRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    title: nonEmptyStringSchema,
    summary: { type: "string" },
    status: { type: "string", enum: Object.values(StoryArcStatus) },
    startAt: timestampSchema,
    endAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "title"],
} as const satisfies JsonSchema;

export const updateStoryArcRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-story-arc-request",
  title: "UpdateStoryArcRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    title: nonEmptyStringSchema,
    summary: { type: "string" },
    status: { type: "string", enum: Object.values(StoryArcStatus) },
    startAt: timestampSchema,
    endAt: timestampSchema,
  },
} as const satisfies JsonSchema;

export const storyNodeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:story-node",
  title: "StoryNode",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    arcId: idSchema,
    title: nonEmptyStringSchema,
    nodeType: { type: "string", enum: Object.values(StoryNodeType) },
    status: { type: "string", enum: Object.values(StoryNodeStatus) },
    timeMode: { type: "string", enum: ["ABSOLUTE", "RELATIVE", "FLOATING"] },
    scheduledAt: timestampSchema,
    windowStart: timestampSchema,
    windowEnd: timestampSchema,
    summary: { type: "string" },
    generationGoal: { type: "string" },
    requiredFacts: stringListSchema,
    involvedCharacterIds: stringListSchema,
    referencedMemoryIds: stringListSchema,
    creatorNotes: nonEmptyStringSchema,
    priority: { type: "number", minimum: 0 },
    locked: { type: "boolean" },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "arcId", "title", "nodeType", "status", "timeMode", "summary", "generationGoal", "requiredFacts", "involvedCharacterIds", "referencedMemoryIds", "priority", "locked", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createStoryNodeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-story-node-request",
  title: "CreateStoryNodeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    arcId: idSchema,
    title: nonEmptyStringSchema,
    nodeType: { type: "string", enum: Object.values(StoryNodeType) },
    status: { type: "string", enum: Object.values(StoryNodeStatus) },
    timeMode: { type: "string", enum: ["ABSOLUTE", "RELATIVE", "FLOATING"] },
    scheduledAt: timestampSchema,
    windowStart: timestampSchema,
    windowEnd: timestampSchema,
    summary: { type: "string" },
    generationGoal: { type: "string" },
    requiredFacts: stringListSchema,
    involvedCharacterIds: stringListSchema,
    referencedMemoryIds: stringListSchema,
    creatorNotes: nonEmptyStringSchema,
    priority: { type: "number", minimum: 0 },
    locked: { type: "boolean" },
  },
  required: ["id", "storyWorldId", "arcId", "title", "nodeType", "timeMode"],
} as const satisfies JsonSchema;

export const updateStoryNodeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-story-node-request",
  title: "UpdateStoryNodeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    title: nonEmptyStringSchema,
    nodeType: { type: "string", enum: Object.values(StoryNodeType) },
    status: { type: "string", enum: Object.values(StoryNodeStatus) },
    timeMode: { type: "string", enum: ["ABSOLUTE", "RELATIVE", "FLOATING"] },
    scheduledAt: timestampSchema,
    windowStart: timestampSchema,
    windowEnd: timestampSchema,
    summary: { type: "string" },
    generationGoal: { type: "string" },
    requiredFacts: stringListSchema,
    involvedCharacterIds: stringListSchema,
    referencedMemoryIds: stringListSchema,
    creatorNotes: nonEmptyStringSchema,
    priority: { type: "number", minimum: 0 },
    locked: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const storyEdgeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:story-edge",
  title: "StoryEdge",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    arcId: idSchema,
    fromNodeId: idSchema,
    toNodeId: idSchema,
    edgeType: { type: "string", enum: Object.values(StoryEdgeType) },
    condition: { type: "string" },
    weight: { type: "number", minimum: 0, maximum: 1 },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "arcId", "fromNodeId", "toNodeId", "edgeType", "condition", "weight", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createStoryEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-story-edge-request",
  title: "CreateStoryEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    arcId: idSchema,
    fromNodeId: idSchema,
    toNodeId: idSchema,
    edgeType: { type: "string", enum: Object.values(StoryEdgeType) },
    condition: { type: "string" },
    weight: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["id", "storyWorldId", "arcId", "fromNodeId", "toNodeId", "edgeType"],
} as const satisfies JsonSchema;

export const updateStoryEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-story-edge-request",
  title: "UpdateStoryEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    edgeType: { type: "string", enum: Object.values(StoryEdgeType) },
    condition: { type: "string" },
    weight: { type: "number", minimum: 0, maximum: 1 },
  },
} as const satisfies JsonSchema;

export const promptTemplateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:prompt-template",
  title: "PromptTemplate",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: { type: "string", enum: Object.values(PromptTemplateType) },
    name: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    isDefault: { type: "boolean" },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "type", "name", "content", "isDefault", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createPromptTemplateRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-prompt-template-request",
  title: "CreatePromptTemplateRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: { type: "string", enum: Object.values(PromptTemplateType) },
    name: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    isDefault: { type: "boolean" },
  },
  required: ["id", "storyWorldId", "type", "name", "content"],
} as const satisfies JsonSchema;

export const updatePromptTemplateRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-prompt-template-request",
  title: "UpdatePromptTemplateRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: Object.values(PromptTemplateType) },
    name: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    isDefault: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const memoryCandidateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:memory-candidate",
  title: "MemoryCandidate",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    proposedMemoryId: idSchema,
    sourceRef: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    rationale: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    status: { type: "string", enum: Object.values(MemoryCandidateStatus) },
    createdAt: timestampSchema,
    reviewedAt: timestampSchema,
    reviewerCharacterId: idSchema,
    mergedIntoMemoryId: idSchema,
  },
  required: ["id", "storyWorldId", "sourceRef", "content", "rationale", "confidence", "status", "createdAt"],
} as const satisfies JsonSchema;

export const createMemoryCandidateRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-memory-candidate-request",
  title: "CreateMemoryCandidateRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    sourceRef: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    rationale: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["id", "storyWorldId", "sourceRef", "content", "confidence"],
} as const satisfies JsonSchema;

export const reviewMemoryCandidateRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:review-memory-candidate-request",
  title: "ReviewMemoryCandidateRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    reviewerCharacterId: idSchema,
    content: nonEmptyStringSchema,
    status: { type: "string", enum: ["APPROVED", "REJECTED", "MERGED"] },
    mergedIntoMemoryId: idSchema,
  },
  required: ["status"],
} as const satisfies JsonSchema;

export const worldContextPolicySchema = {
  type: "object",
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    worldLoreEnabled: { type: "boolean" },
    relationshipsEnabled: { type: "boolean" },
    schedulesEnabled: { type: "boolean" },
    memoriesEnabled: { type: "boolean" },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "worldLoreEnabled", "relationshipsEnabled", "schedulesEnabled", "memoriesEnabled", "createdAt", "updatedAt"],
  additionalProperties: false,
} as const satisfies JsonSchema;

export const updateWorldContextPolicyRequestSchema = {
  type: "object",
  properties: {
    worldLoreEnabled: { type: "boolean" },
    relationshipsEnabled: { type: "boolean" },
    schedulesEnabled: { type: "boolean" },
    memoriesEnabled: { type: "boolean" },
  },
  additionalProperties: false,
} as const satisfies JsonSchema;

export const storyGenerationJobStatusSchema = {
  type: "string",
  enum: ["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"],
} as const satisfies JsonSchema;

export const storyGenerationJobSchema = {
  type: "object",
  properties: {
    id: idSchema,
    storyNodeId: idSchema,
    storyWorldId: idSchema,
    status: storyGenerationJobStatusSchema,
    attempt: { type: "integer", minimum: 1 },
    idempotencyKey: { type: "string", minLength: 1 },
    provider: { type: "string" },
    model: { type: "string" },
    failureReason: { type: "string" },
    createdAt: timestampSchema,
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
  },
  required: ["id", "storyNodeId", "storyWorldId", "status", "attempt", "idempotencyKey", "createdAt"],
  additionalProperties: false,
} as const satisfies JsonSchema;

export const storyChoiceSchema = {
  type: "object",
  properties: {
    text: nonEmptyStringSchema,
    targetNodeId: idSchema,
  },
  required: ["text"],
  additionalProperties: false,
} as const satisfies JsonSchema;

export const storyGenerationCandidateStatusSchema = {
  type: "string",
  enum: ["PENDING_REVIEW", "APPROVED", "REJECTED"],
} as const satisfies JsonSchema;

export const storyGenerationCandidateSchema = {
  type: "object",
  properties: {
    id: idSchema,
    storyNodeId: idSchema,
    storyWorldId: idSchema,
    sourceJobId: idSchema,
    body: nonEmptyStringSchema,
    choices: { type: "array", items: storyChoiceSchema },
    promptVersion: nonEmptyStringSchema,
    status: storyGenerationCandidateStatusSchema,
    createdAt: timestampSchema,
    reviewedAt: timestampSchema,
    reviewerCharacterId: idSchema,
  },
  required: ["id", "storyNodeId", "storyWorldId", "sourceJobId", "body", "choices", "promptVersion", "status", "createdAt"],
  additionalProperties: false,
} as const satisfies JsonSchema;

export const createStoryGenerationJobRequestSchema = {
  type: "object",
  properties: {
    idempotencyKey: nonEmptyStringSchema,
  },
  required: ["idempotencyKey"],
  additionalProperties: false,
} as const satisfies JsonSchema;

export const reviewStoryGenerationCandidateRequestSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["approve", "reject"] },
    reviewerCharacterId: idSchema,
    idempotencyKey: nonEmptyStringSchema,
  },
  required: ["action", "reviewerCharacterId", "idempotencyKey"],
  additionalProperties: false,
} as const satisfies JsonSchema;
