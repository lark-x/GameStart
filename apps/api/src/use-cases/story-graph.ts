import {
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  createMemoryItem,
  createMemoryCandidate,
  createPromptTemplate,
  createStoryArc,
  createStoryEdge,
  createStoryNode,
  type Character,
  type MemoryItem,
  type StoryArc,
  type StoryNode,
} from "@living-network/domain";
import type {
  CreateMemoryCandidateRequest,
  CreatePromptTemplateRequest,
  CreateStoryArcRequest,
  CreateStoryEdgeRequest,
  CreateStoryNodeRequest,
  MemoryCandidateDto,
  PromptPreviewDto,
  PromptTemplateDto,
  ReviewMemoryCandidateRequest,
  StoryArcDto,
  StoryEdgeDto,
  StoryNodeDto,
  UpdatePromptTemplateRequest,
  UpdateStoryArcRequest,
  UpdateStoryEdgeRequest,
  UpdateStoryNodeRequest,
} from "@living-network/contracts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import {
  toMemoryCandidateDto,
  toPromptTemplateDto,
  toRelationshipEdgeDto,
  toStoryArcDto,
  toStoryEdgeDto,
  toStoryNodeDto,
  toWorldLoreEntryDto,
} from "../mappers.ts";
import { requireStoryGraphStore } from "../store-helpers.ts";

async function requireWorld(store: ApiStore, storyWorldId: string) {
  const world = await store.storyWorlds.getById(storyWorldId);
  if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  return world;
}

async function requireArc(store: ReturnType<typeof requireStoryGraphStore>, arcId: string): Promise<StoryArc> {
  const arc = await store.storyArcs.getById(arcId);
  if (!arc) throw new ApiError(404, "NOT_FOUND", "Story arc not found");
  return arc;
}

async function requireNode(store: ReturnType<typeof requireStoryGraphStore>, nodeId: string): Promise<StoryNode> {
  const node = await store.storyNodes.getById(nodeId);
  if (!node) throw new ApiError(404, "NOT_FOUND", "Story node not found");
  return node;
}

async function loadCharacters(
  store: ApiStore,
  storyWorldId: string,
  ids: readonly string[],
): Promise<readonly Character[]> {
  const characters = await Promise.all(ids.map((id) => store.characters.getById(id)));
  return characters.map((character, index) => {
    if (!character) throw new ApiError(404, "NOT_FOUND", `Character not found: ${ids[index]}`);
    if (character.storyWorldId !== storyWorldId) {
      throw new ApiError(400, "BAD_REQUEST", "Node characters must belong to the same storyWorld");
    }
    return character;
  });
}

async function loadMemories(
  store: ReturnType<typeof requireStoryGraphStore>,
  storyWorldId: string,
  ids: readonly string[],
): Promise<readonly MemoryItem[]> {
  const memories = await Promise.all(ids.map((id) => store.memories.getById(id)));
  return memories.map((memory, index) => {
    if (!memory) throw new ApiError(404, "NOT_FOUND", `Memory not found: ${ids[index]}`);
    if (memory.storyWorldId !== storyWorldId) {
      throw new ApiError(400, "BAD_REQUEST", "Node memories must belong to the same storyWorld");
    }
    return memory;
  });
}

function handleDomainError(error: unknown): never {
  if (error instanceof TypeError || error instanceof RangeError) {
    throw new ApiError(400, "BAD_REQUEST", error.message);
  }
  throw error;
}

export async function listStoryArcs(store: ApiStore, storyWorldId: string): Promise<StoryArcDto[]> {
  const graphStore = requireStoryGraphStore(store);
  await requireWorld(store, storyWorldId);
  return (await graphStore.storyArcs.listByStoryWorld(storyWorldId)).map(toStoryArcDto);
}

export async function createStoryArcUseCase(
  store: ApiStore,
  input: CreateStoryArcRequest,
): Promise<StoryArcDto> {
  const graphStore = requireStoryGraphStore(store);
  if (await graphStore.storyArcs.getById(input.id)) throw new ApiError(409, "CONFLICT", "Story arc already exists");
  const storyWorld = await requireWorld(store, input.storyWorldId);
  try {
    const now = new Date().toISOString();
    const arc = createStoryArc({ ...input, storyWorld, createdAt: now, updatedAt: now });
    await graphStore.storyArcs.save(arc);
    return toStoryArcDto(arc);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function updateStoryArcUseCase(
  store: ApiStore,
  id: string,
  input: UpdateStoryArcRequest,
): Promise<StoryArcDto> {
  const graphStore = requireStoryGraphStore(store);
  const existing = await requireArc(graphStore, id);
  const storyWorld = await requireWorld(store, existing.storyWorldId);
  try {
    const updated = createStoryArc({
      id: existing.id,
      storyWorld,
      title: input.title ?? existing.title,
      summary: input.summary ?? existing.summary,
      status: input.status ?? existing.status,
      ...((input.startAt ?? existing.startAt) === undefined ? {} : { startAt: input.startAt ?? existing.startAt }),
      ...((input.endAt ?? existing.endAt) === undefined ? {} : { endAt: input.endAt ?? existing.endAt }),
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await graphStore.storyArcs.save(updated);
    return toStoryArcDto(updated);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function deleteStoryArc(store: ApiStore, id: string): Promise<void> {
  const graphStore = requireStoryGraphStore(store);
  await requireArc(graphStore, id);
  await graphStore.storyArcs.delete(id);
}

export async function listStoryNodes(
  store: ApiStore,
  storyWorldId: string,
  arcId?: string,
): Promise<StoryNodeDto[]> {
  const graphStore = requireStoryGraphStore(store);
  await requireWorld(store, storyWorldId);
  if (arcId !== undefined) {
    const arc = await requireArc(graphStore, arcId);
    if (arc.storyWorldId !== storyWorldId) throw new ApiError(400, "BAD_REQUEST", "arcId must belong to storyWorld");
    return (await graphStore.storyNodes.listByArc(arcId)).map(toStoryNodeDto);
  }
  return (await graphStore.storyNodes.listByStoryWorld(storyWorldId)).map(toStoryNodeDto);
}

export async function createStoryNodeUseCase(
  store: ApiStore,
  input: CreateStoryNodeRequest,
): Promise<StoryNodeDto> {
  const graphStore = requireStoryGraphStore(store);
  if (await graphStore.storyNodes.getById(input.id)) throw new ApiError(409, "CONFLICT", "Story node already exists");
  const [storyWorld, arc] = await Promise.all([
    requireWorld(store, input.storyWorldId),
    requireArc(graphStore, input.arcId),
  ]);
  if (arc.storyWorldId !== storyWorld.id) throw new ApiError(400, "BAD_REQUEST", "arcId must belong to storyWorld");
  const [involvedCharacters, referencedMemories] = await Promise.all([
    loadCharacters(store, storyWorld.id, input.involvedCharacterIds ?? []),
    loadMemories(graphStore, storyWorld.id, input.referencedMemoryIds ?? []),
  ]);
  try {
    const now = new Date().toISOString();
    const node = createStoryNode({
      ...input,
      storyWorld,
      arc,
      involvedCharacters,
      referencedMemories,
      createdAt: now,
      updatedAt: now,
    });
    await graphStore.storyNodes.save(node);
    return toStoryNodeDto(node);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function updateStoryNodeUseCase(
  store: ApiStore,
  id: string,
  input: UpdateStoryNodeRequest,
): Promise<StoryNodeDto> {
  const graphStore = requireStoryGraphStore(store);
  const existing = await requireNode(graphStore, id);
  const [storyWorld, arc] = await Promise.all([
    requireWorld(store, existing.storyWorldId),
    requireArc(graphStore, existing.arcId),
  ]);
  const [involvedCharacters, referencedMemories] = await Promise.all([
    loadCharacters(store, storyWorld.id, input.involvedCharacterIds ?? existing.involvedCharacterIds),
    loadMemories(graphStore, storyWorld.id, input.referencedMemoryIds ?? existing.referencedMemoryIds),
  ]);
  try {
    const scheduledAt = input.scheduledAt ?? existing.scheduledAt;
    const windowStart = input.windowStart ?? existing.windowStart;
    const windowEnd = input.windowEnd ?? existing.windowEnd;
    const creatorNotes = input.creatorNotes ?? existing.creatorNotes;
    const updated = createStoryNode({
      id: existing.id,
      storyWorld,
      arc,
      title: input.title ?? existing.title,
      nodeType: input.nodeType ?? existing.nodeType,
      status: input.status ?? existing.status,
      timeMode: input.timeMode ?? existing.timeMode,
      ...(scheduledAt === undefined ? {} : { scheduledAt }),
      ...(windowStart === undefined ? {} : { windowStart }),
      ...(windowEnd === undefined ? {} : { windowEnd }),
      summary: input.summary ?? existing.summary,
      generationGoal: input.generationGoal ?? existing.generationGoal,
      requiredFacts: input.requiredFacts ?? existing.requiredFacts,
      involvedCharacters,
      referencedMemories,
      ...(creatorNotes === undefined ? {} : { creatorNotes }),
      priority: input.priority ?? existing.priority,
      locked: input.locked ?? existing.locked,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await graphStore.storyNodes.save(updated);
    return toStoryNodeDto(updated);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function deleteStoryNode(store: ApiStore, id: string): Promise<void> {
  const graphStore = requireStoryGraphStore(store);
  await requireNode(graphStore, id);
  await graphStore.storyNodes.delete(id);
}

export async function listStoryEdges(store: ApiStore, arcId: string): Promise<StoryEdgeDto[]> {
  const graphStore = requireStoryGraphStore(store);
  await requireArc(graphStore, arcId);
  return (await graphStore.storyEdges.listByArc(arcId)).map(toStoryEdgeDto);
}

export async function createStoryEdgeUseCase(
  store: ApiStore,
  input: CreateStoryEdgeRequest,
): Promise<StoryEdgeDto> {
  const graphStore = requireStoryGraphStore(store);
  if (await graphStore.storyEdges.getById(input.id)) throw new ApiError(409, "CONFLICT", "Story edge already exists");
  const [storyWorld, arc, fromNode, toNode] = await Promise.all([
    requireWorld(store, input.storyWorldId),
    requireArc(graphStore, input.arcId),
    requireNode(graphStore, input.fromNodeId),
    requireNode(graphStore, input.toNodeId),
  ]);
  try {
    const now = new Date().toISOString();
    const edge = createStoryEdge({
      ...input,
      storyWorld,
      arc,
      fromNode,
      toNode,
      createdAt: now,
      updatedAt: now,
    });
    await graphStore.storyEdges.save(edge);
    return toStoryEdgeDto(edge);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function updateStoryEdgeUseCase(
  store: ApiStore,
  id: string,
  input: UpdateStoryEdgeRequest,
): Promise<StoryEdgeDto> {
  const graphStore = requireStoryGraphStore(store);
  const existing = await graphStore.storyEdges.getById(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Story edge not found");
  const [storyWorld, arc, fromNode, toNode] = await Promise.all([
    requireWorld(store, existing.storyWorldId),
    requireArc(graphStore, existing.arcId),
    requireNode(graphStore, existing.fromNodeId),
    requireNode(graphStore, existing.toNodeId),
  ]);
  try {
    const updated = createStoryEdge({
      id: existing.id,
      storyWorld,
      arc,
      fromNode,
      toNode,
      edgeType: input.edgeType ?? existing.edgeType,
      condition: input.condition ?? existing.condition,
      weight: input.weight ?? existing.weight,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await graphStore.storyEdges.save(updated);
    return toStoryEdgeDto(updated);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function deleteStoryEdge(store: ApiStore, id: string): Promise<void> {
  const graphStore = requireStoryGraphStore(store);
  if (!(await graphStore.storyEdges.getById(id))) throw new ApiError(404, "NOT_FOUND", "Story edge not found");
  await graphStore.storyEdges.delete(id);
}

export async function listPromptTemplates(store: ApiStore, storyWorldId: string): Promise<PromptTemplateDto[]> {
  const graphStore = requireStoryGraphStore(store);
  await requireWorld(store, storyWorldId);
  return (await graphStore.promptTemplates.listByStoryWorld(storyWorldId)).map(toPromptTemplateDto);
}

export async function createPromptTemplateUseCase(
  store: ApiStore,
  input: CreatePromptTemplateRequest,
): Promise<PromptTemplateDto> {
  const graphStore = requireStoryGraphStore(store);
  if (await graphStore.promptTemplates.getById(input.id)) throw new ApiError(409, "CONFLICT", "Prompt template already exists");
  const storyWorld = await requireWorld(store, input.storyWorldId);
  try {
    const now = new Date().toISOString();
    const template = createPromptTemplate({ ...input, storyWorld, createdAt: now, updatedAt: now });
    await graphStore.promptTemplates.save(template);
    return toPromptTemplateDto(template);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function updatePromptTemplateUseCase(
  store: ApiStore,
  id: string,
  input: UpdatePromptTemplateRequest,
): Promise<PromptTemplateDto> {
  const graphStore = requireStoryGraphStore(store);
  const existing = await graphStore.promptTemplates.getById(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Prompt template not found");
  const storyWorld = await requireWorld(store, existing.storyWorldId);
  try {
    const updated = createPromptTemplate({
      id: existing.id,
      storyWorld,
      type: input.type ?? existing.type,
      name: input.name ?? existing.name,
      content: input.content ?? existing.content,
      isDefault: input.isDefault ?? existing.isDefault,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await graphStore.promptTemplates.save(updated);
    return toPromptTemplateDto(updated);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function deletePromptTemplate(store: ApiStore, id: string): Promise<void> {
  const graphStore = requireStoryGraphStore(store);
  if (!(await graphStore.promptTemplates.getById(id))) throw new ApiError(404, "NOT_FOUND", "Prompt template not found");
  await graphStore.promptTemplates.delete(id);
}

export async function previewPrompt(
  store: ApiStore,
  storyWorldId: string,
  arcId?: string,
  nodeId?: string,
): Promise<PromptPreviewDto> {
  const graphStore = requireStoryGraphStore(store);
  const storyWorld = await requireWorld(store, storyWorldId);
  const [lore, characters, relationships, templates] = await Promise.all([
    graphStore.worldLoreEntries.listByStoryWorld(storyWorldId),
    store.characters.listByStoryWorld(storyWorldId),
    store.relationshipEdges.listByStoryWorld(storyWorldId),
    graphStore.promptTemplates.listByStoryWorld(storyWorldId),
  ]);
  const arc = arcId === undefined ? undefined : await requireArc(graphStore, arcId);
  if (arc && arc.storyWorldId !== storyWorldId) throw new ApiError(400, "BAD_REQUEST", "arcId must belong to storyWorld");
  const node = nodeId === undefined ? undefined : await requireNode(graphStore, nodeId);
  if (node && node.storyWorldId !== storyWorldId) throw new ApiError(400, "BAD_REQUEST", "nodeId must belong to storyWorld");
  const referencedMemories = node === undefined ? [] : await loadMemories(graphStore, storyWorldId, node.referencedMemoryIds);
  const sections = [
    {
      title: "世界",
      content: `${storyWorld.name}\n时区: ${storyWorld.timezone}\n模式: ${storyWorld.storyMode}`,
    },
    {
      title: "世界设定",
      content: lore.map((entry) => `${entry.category} / ${entry.title}: ${entry.content}`).join("\n\n") || "暂无世界设定",
    },
    {
      title: "角色",
      content: characters.map((character) => `${character.displayName} (${character.role})`).join("\n") || "暂无角色",
    },
    {
      title: "关系",
      content: relationships.map((edge) => {
        const dto = toRelationshipEdgeDto(edge);
        return `${dto.sourceCharacterId} -> ${dto.targetCharacterId}: ${dto.relationshipType}`;
      }).join("\n") || "暂无关系",
    },
    ...(arc === undefined ? [] : [{ title: "篇章", content: `${arc.title}\n${arc.summary}` }]),
    ...(node === undefined ? [] : [{
      title: "当前节点",
      content: [
        `标题: ${node.title}`,
        `类型: ${node.nodeType}`,
        `目标: ${node.generationGoal}`,
        `摘要: ${node.summary}`,
        `必备事实: ${node.requiredFacts.join("; ") || "无"}`,
        `生成约束: ${node.creatorNotes ?? "无"}`,
      ].join("\n"),
    }]),
    {
      title: "长期记忆",
      content: referencedMemories.map((memory) => memory.content).join("\n") || "当前节点暂无引用记忆",
    },
    {
      title: "提示词模板",
      content: templates.map((template) => `[${template.type}] ${template.name}\n${template.content}`).join("\n\n") || "暂无模板",
    },
    {
      title: "输出要求",
      content: "围绕当前世界、角色关系和节点目标生成游戏剧情候选；不得引入跨世界事实；保留可分支的关键选择点。",
    },
  ];
  return {
    storyWorldId,
    ...(arcId === undefined ? {} : { arcId }),
    ...(nodeId === undefined ? {} : { nodeId }),
    sections,
    finalPrompt: sections.map((section) => `## ${section.title}\n${section.content}`).join("\n\n"),
  };
}

export async function listMemoryCandidates(store: ApiStore, storyWorldId: string): Promise<MemoryCandidateDto[]> {
  const graphStore = requireStoryGraphStore(store);
  await requireWorld(store, storyWorldId);
  return (await graphStore.memoryCandidates.listByStoryWorld(storyWorldId)).map(toMemoryCandidateDto);
}

export async function createMemoryCandidateUseCase(
  store: ApiStore,
  input: CreateMemoryCandidateRequest,
): Promise<MemoryCandidateDto> {
  const graphStore = requireStoryGraphStore(store);
  if (await graphStore.memoryCandidates.getById(input.id)) throw new ApiError(409, "CONFLICT", "Memory candidate already exists");
  const storyWorld = await requireWorld(store, input.storyWorldId);
  try {
    const candidate = createMemoryCandidate({
      ...input,
      storyWorld,
      createdAt: new Date().toISOString(),
    });
    await graphStore.memoryCandidates.save(candidate);
    return toMemoryCandidateDto(candidate);
  } catch (error) {
    handleDomainError(error);
  }
}

export async function reviewMemoryCandidate(
  store: ApiStore,
  id: string,
  input: ReviewMemoryCandidateRequest,
): Promise<MemoryCandidateDto> {
  const graphStore = requireStoryGraphStore(store);
  const existing = await graphStore.memoryCandidates.getById(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Memory candidate not found");
  const storyWorld = await requireWorld(store, existing.storyWorldId);
  const reviewerCharacter = input.reviewerCharacterId === undefined
    ? undefined
    : (await loadCharacters(store, storyWorld.id, [input.reviewerCharacterId]))[0];
  const mergedIntoMemory = input.mergedIntoMemoryId === undefined
    ? undefined
    : await graphStore.memories.getById(input.mergedIntoMemoryId);
  if (input.status === "MERGED" && mergedIntoMemory === undefined) {
    throw new ApiError(400, "BAD_REQUEST", "MERGED review requires mergedIntoMemoryId");
  }
  if (mergedIntoMemory && mergedIntoMemory.storyWorldId !== storyWorld.id) {
    throw new ApiError(400, "BAD_REQUEST", "mergedIntoMemoryId must belong to storyWorld");
  }
  try {
    const now = new Date().toISOString();
    const approvedContent = input.content ?? existing.content;
    let proposedMemoryId = existing.proposedMemoryId;
    if (input.status === "APPROVED") {
      proposedMemoryId = existing.proposedMemoryId ?? `mem-${existing.id}`;
      const memory = createMemoryItem({
        id: proposedMemoryId,
        storyWorld,
        kind: MemoryKind.EVENT_FACT,
        visibility: MemoryVisibility.SYSTEM,
        source: MemorySource.LLM_DERIVED,
        content: approvedContent,
        confidence: existing.confidence,
        createdAt: now,
        sourceRef: existing.sourceRef,
      });
      await graphStore.memories.save(memory);
    }
    const candidate = createMemoryCandidate({
      id: existing.id,
      storyWorld,
      ...(proposedMemoryId === undefined ? {} : { proposedMemoryId }),
      sourceRef: existing.sourceRef,
      content: approvedContent,
      rationale: existing.rationale,
      confidence: existing.confidence,
      status: input.status,
      createdAt: existing.createdAt,
      reviewedAt: now,
      ...(reviewerCharacter === undefined ? {} : { reviewerCharacter }),
      ...(mergedIntoMemory === undefined ? {} : { mergedIntoMemory }),
    });
    await graphStore.memoryCandidates.save(candidate);
    return toMemoryCandidateDto(candidate);
  } catch (error) {
    handleDomainError(error);
  }
}
