import {
  assertWorldLoreEntry,
  type StoryWorld,
  type Character,
  type MemoryItem,
  type StoryArc,
  type StoryNode,
  type StoryEdge,
  type PromptTemplate,
  type MemoryCandidate,
  type WorldLoreEntry,
} from "@living-network/domain";
import type {
  StoryArcRepository,
  StoryNodeRepository,
  StoryEdgeRepository,
  PromptTemplateRepository,
  MemoryCandidateRepository,
  WorldLoreEntryRepository,
} from "../repositories.ts";

// ── Copy helpers ──

function copyWorldLoreEntry(entry: WorldLoreEntry): WorldLoreEntry {
  return { ...entry, tags: [...entry.tags] };
}

function copyStoryArc(arc: StoryArc): StoryArc {
  return { ...arc };
}

function copyStoryNode(node: StoryNode): StoryNode {
  return { ...node, involvedCharacterIds: [...node.involvedCharacterIds], referencedMemoryIds: [...node.referencedMemoryIds] };
}

function copyStoryEdge(edge: StoryEdge): StoryEdge {
  return { ...edge };
}

function copyPromptTemplate(template: PromptTemplate): PromptTemplate {
  return { ...template };
}

function copyMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
  return { ...candidate };
}

// ── Assertion helpers ──

function assertWorldLoreEntryRefs(
  entry: WorldLoreEntry,
  worlds: Map<string, StoryWorld>,
): void {
  assertWorldLoreEntry(entry);
  if (!worlds.has(entry.storyWorldId)) {
    throw new TypeError(`World lore entry ${entry.id} references an unknown story world`);
  }
}

function assertStoryArcRefs(arc: StoryArc, worlds: Map<string, StoryWorld>): void {
  if (!worlds.has(arc.storyWorldId)) {
    throw new TypeError(`Story arc ${arc.id} references an unknown story world`);
  }
}

function assertStoryNodeRefs(
  node: StoryNode,
  worlds: Map<string, StoryWorld>,
  arcs: Map<string, StoryArc>,
  characters: Map<string, Character>,
  memories: Map<string, MemoryItem>,
): void {
  if (!worlds.has(node.storyWorldId)) {
    throw new TypeError(`Story node ${node.id} references an unknown story world`);
  }
  const arc = arcs.get(node.arcId);
  if (!arc || arc.storyWorldId !== node.storyWorldId) {
    throw new TypeError(`Story node ${node.id} references an invalid story arc`);
  }
  for (const characterId of node.involvedCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== node.storyWorldId) {
      throw new TypeError(`Story node ${node.id} references an invalid character`);
    }
  }
  for (const memoryId of node.referencedMemoryIds) {
    const memory = memories.get(memoryId);
    if (!memory || memory.storyWorldId !== node.storyWorldId) {
      throw new TypeError(`Story node ${node.id} references an invalid memory`);
    }
  }
}

function assertStoryEdgeRefs(
  edge: StoryEdge,
  worlds: Map<string, StoryWorld>,
  arcs: Map<string, StoryArc>,
  nodes: Map<string, StoryNode>,
): void {
  if (!worlds.has(edge.storyWorldId)) {
    throw new TypeError(`Story edge ${edge.id} references an unknown story world`);
  }
  const arc = arcs.get(edge.arcId);
  const fromNode = nodes.get(edge.fromNodeId);
  const toNode = nodes.get(edge.toNodeId);
  if (
    !arc ||
    arc.storyWorldId !== edge.storyWorldId ||
    !fromNode ||
    !toNode ||
    fromNode.storyWorldId !== edge.storyWorldId ||
    toNode.storyWorldId !== edge.storyWorldId ||
    fromNode.arcId !== edge.arcId ||
    toNode.arcId !== edge.arcId
  ) {
    throw new TypeError(`Story edge ${edge.id} references invalid story nodes`);
  }
}

function assertPromptTemplateRefs(template: PromptTemplate, worlds: Map<string, StoryWorld>): void {
  if (!worlds.has(template.storyWorldId)) {
    throw new TypeError(`Prompt template ${template.id} references an unknown story world`);
  }
}

function assertMemoryCandidateRefs(
  candidate: MemoryCandidate,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
  memories: Map<string, MemoryItem>,
): void {
  if (!worlds.has(candidate.storyWorldId)) {
    throw new TypeError(`Memory candidate ${candidate.id} references an unknown story world`);
  }
  if (candidate.reviewerCharacterId !== undefined) {
    const character = characters.get(candidate.reviewerCharacterId);
    if (!character || character.storyWorldId !== candidate.storyWorldId) {
      throw new TypeError(`Memory candidate ${candidate.id} references an invalid reviewer`);
    }
  }
  if (candidate.mergedIntoMemoryId !== undefined) {
    const memory = memories.get(candidate.mergedIntoMemoryId);
    if (!memory || memory.storyWorldId !== candidate.storyWorldId) {
      throw new TypeError(`Memory candidate ${candidate.id} references an invalid merged memory`);
    }
  }
}

// ── Repository factories ──

export function createWorldLoreEntryRepo(
  map: Map<string, WorldLoreEntry>,
  worldMap: Map<string, StoryWorld>,
): WorldLoreEntryRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter((entry) => entry.storyWorldId === storyWorldId)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)
        )
        .map(copyWorldLoreEntry),
    getById: async (id) => {
      const entry = map.get(id);
      return entry ? copyWorldLoreEntry(entry) : undefined;
    },
    search: async (storyWorldId, queryText) => {
      if (queryText.trim().length === 0) {
        throw new TypeError("world lore search queryText must be non-empty");
      }
      const terms = queryText.toLocaleLowerCase().trim().split(/\s+/u);
      return [...map.values()]
        .filter((entry) => entry.storyWorldId === storyWorldId && entry.isEnabled)
        .map((entry) => {
          const searchable = [entry.title, entry.content, ...entry.tags]
            .join(" ")
            .toLocaleLowerCase();
          const matchedTerms = terms.filter((term) => searchable.includes(term)).length;
          return { entry, matchedTerms };
        })
        .filter(({ matchedTerms }) => matchedTerms > 0)
        .sort((left, right) =>
          right.matchedTerms - left.matchedTerms ||
          right.entry.updatedAt.localeCompare(left.entry.updatedAt) ||
          left.entry.id.localeCompare(right.entry.id)
        )
        .map(({ entry }) => copyWorldLoreEntry(entry));
    },
    save: async (entry) => {
      assertWorldLoreEntryRefs(entry, worldMap);
      map.set(entry.id, copyWorldLoreEntry(entry));
    },
    delete: async (id) => {
      map.delete(id);
    },
  };
}

export function createStoryArcRepo(
  arcMap: Map<string, StoryArc>,
  nodeMap: Map<string, StoryNode>,
  edgeMap: Map<string, StoryEdge>,
  worldMap: Map<string, StoryWorld>,
): StoryArcRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...arcMap.values()]
        .filter((arc) => arc.storyWorldId === storyWorldId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
        .map(copyStoryArc),
    getById: async (id) => {
      const arc = arcMap.get(id);
      return arc ? copyStoryArc(arc) : undefined;
    },
    save: async (arc) => {
      assertStoryArcRefs(arc, worldMap);
      arcMap.set(arc.id, copyStoryArc(arc));
    },
    delete: async (id) => {
      const nodeIds = new Set(
        [...nodeMap.values()].filter((node) => node.arcId === id).map((node) => node.id),
      );
      for (const edge of [...edgeMap.values()]) {
        if (edge.arcId === id || nodeIds.has(edge.fromNodeId) || nodeIds.has(edge.toNodeId)) {
          edgeMap.delete(edge.id);
        }
      }
      for (const nodeId of nodeIds) nodeMap.delete(nodeId);
      arcMap.delete(id);
    },
  };
}

export function createStoryNodeRepo(
  nodeMap: Map<string, StoryNode>,
  edgeMap: Map<string, StoryEdge>,
  worldMap: Map<string, StoryWorld>,
  arcMap: Map<string, StoryArc>,
  characterMap: Map<string, Character>,
  memoryMap: Map<string, MemoryItem>,
): StoryNodeRepository {
  return {
    listByArc: async (arcId) =>
      [...nodeMap.values()]
        .filter((node) => node.arcId === arcId)
        .sort((left, right) => left.priority - right.priority || left.createdAt.localeCompare(right.createdAt))
        .map(copyStoryNode),
    listByStoryWorld: async (storyWorldId) =>
      [...nodeMap.values()]
        .filter((node) => node.storyWorldId === storyWorldId)
        .sort((left, right) => left.priority - right.priority || left.createdAt.localeCompare(right.createdAt))
        .map(copyStoryNode),
    getById: async (id) => {
      const node = nodeMap.get(id);
      return node ? copyStoryNode(node) : undefined;
    },
    save: async (node) => {
      assertStoryNodeRefs(node, worldMap, arcMap, characterMap, memoryMap);
      nodeMap.set(node.id, copyStoryNode(node));
    },
    delete: async (id) => {
      for (const edge of [...edgeMap.values()]) {
        if (edge.fromNodeId === id || edge.toNodeId === id) edgeMap.delete(edge.id);
      }
      nodeMap.delete(id);
    },
  };
}

export function createStoryEdgeRepo(
  edgeMap: Map<string, StoryEdge>,
  worldMap: Map<string, StoryWorld>,
  arcMap: Map<string, StoryArc>,
  nodeMap: Map<string, StoryNode>,
): StoryEdgeRepository {
  return {
    listByArc: async (arcId) =>
      [...edgeMap.values()]
        .filter((edge) => edge.arcId === arcId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
        .map(copyStoryEdge),
    getById: async (id) => {
      const edge = edgeMap.get(id);
      return edge ? copyStoryEdge(edge) : undefined;
    },
    save: async (edge) => {
      assertStoryEdgeRefs(edge, worldMap, arcMap, nodeMap);
      edgeMap.set(edge.id, copyStoryEdge(edge));
    },
    delete: async (id) => {
      edgeMap.delete(id);
    },
  };
}

export function createPromptTemplateRepo(
  map: Map<string, PromptTemplate>,
  worldMap: Map<string, StoryWorld>,
): PromptTemplateRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter((template) => template.storyWorldId === storyWorldId)
        .sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
        .map(copyPromptTemplate),
    getById: async (id) => {
      const template = map.get(id);
      return template ? copyPromptTemplate(template) : undefined;
    },
    save: async (template) => {
      assertPromptTemplateRefs(template, worldMap);
      map.set(template.id, copyPromptTemplate(template));
    },
    delete: async (id) => {
      map.delete(id);
    },
  };
}

export function createMemoryCandidateRepo(
  map: Map<string, MemoryCandidate>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  memoryMap: Map<string, MemoryItem>,
): MemoryCandidateRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter((candidate) => candidate.storyWorldId === storyWorldId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
        .map(copyMemoryCandidate),
    getById: async (id) => {
      const candidate = map.get(id);
      return candidate ? copyMemoryCandidate(candidate) : undefined;
    },
    save: async (candidate) => {
      assertMemoryCandidateRefs(candidate, worldMap, characterMap, memoryMap);
      map.set(candidate.id, copyMemoryCandidate(candidate));
    },
  };
}
