import type { V2CanonCharacter, V2CanonCharacterRelationship, V2CanonWorld } from "./canon.ts";

export type V2CharacterContextTask = "chat" | "story_analyze" | "scene_generation" | "image_generation";

export interface V2CharacterContextSource {
  readonly world: V2CanonWorld;
  readonly characters: readonly V2CanonCharacter[];
  readonly relationships: readonly V2CanonCharacterRelationship[];
  readonly facts?: readonly { readonly id: string; readonly text: string }[];
  readonly memories?: readonly { readonly id: string; readonly text: string; readonly relevance?: number }[];
  readonly conversationSummary?: string;
  readonly recentMessages?: readonly string[];
  readonly currentInput?: string;
  readonly task: V2CharacterContextTask;
  readonly primaryCharacterId?: string;
  readonly selectedCharacterIds?: readonly string[];
  readonly tokenBudget?: number;
}

export interface V2CharacterContextSourceTrace {
  readonly path: string;
  readonly sourceId?: string;
  readonly reason: string;
  readonly tokens: number;
}

export interface V2CharacterContextSnapshot {
  readonly stable: {
    readonly world: Pick<V2CanonWorld, "storyWorldId" | "name" | "summary">;
    readonly characters: readonly V2CanonCharacter[];
    readonly relationships: readonly V2CanonCharacterRelationship[];
    readonly facts: readonly { readonly id: string; readonly text: string }[];
  };
  readonly dynamic: {
    readonly memories: readonly { readonly id: string; readonly text: string }[];
    readonly conversationSummary?: string;
    readonly recentMessages: readonly string[];
  };
  readonly runtime: { readonly task: V2CharacterContextTask; readonly currentInput?: string };
  readonly sources: readonly V2CharacterContextSourceTrace[];
  readonly omittedSources: readonly V2CharacterContextSourceTrace[];
  readonly contextHash: string;
  readonly baseCanonRevision: number;
  readonly budget: { readonly limit: number; readonly used: number };
}

export function buildV2CharacterContext(source: V2CharacterContextSource): V2CharacterContextSnapshot {
  const limit = source.tokenBudget ?? 6000;
  const selectedIds = new Set(source.selectedCharacterIds ?? (source.primaryCharacterId ? [source.primaryCharacterId] : source.characters.map((character) => character.characterId)));
  const selectedCharacters = source.characters.filter((character) => selectedIds.has(character.characterId));
  const selectedRelationships = source.relationships.filter((relationship) => selectedIds.has(relationship.fromCharacterId) && selectedIds.has(relationship.toCharacterId));
  const facts = source.facts ?? [];
  const memories = [...(source.memories ?? [])].sort((left, right) => (right.relevance ?? 0) - (left.relevance ?? 0)).slice(0, 10);
  const sources: V2CharacterContextSourceTrace[] = [];
  const omittedSources: V2CharacterContextSourceTrace[] = [];
  let used = 0;
  const include = (path: string, value: unknown, reason: string, sourceId?: string): boolean => {
    const tokens = estimateTokens(value);
    if (used + tokens > limit) {
      omittedSources.push({ path, ...(sourceId === undefined ? {} : { sourceId }), reason: "token_budget", tokens });
      return false;
    }
    used += tokens;
    sources.push({ path, ...(sourceId === undefined ? {} : { sourceId }), reason, tokens });
    return true;
  };
  const characters = selectedCharacters.filter((character) => include(`characters.${character.characterId}`, character, "selected_character", character.characterId));
  const relationships = selectedRelationships.filter((relationship) => include(`relationships.${relationship.relationshipId}`, relationship, "selected_character_relationship", relationship.relationshipId));
  const includedFacts = facts.filter((fact) => include(`facts.${fact.id}`, fact.text, "world_fact", fact.id));
  const includedMemories = memories.filter((memory) => include(`memories.${memory.id}`, memory.text, "relevance", memory.id));
  if (source.conversationSummary !== undefined) include("conversation.summary", source.conversationSummary, "conversation_summary");
  (source.recentMessages ?? []).slice(-24).forEach((message, index) => include(`conversation.messages.${index}`, message, "recent_message"));
  if (source.currentInput !== undefined) include("runtime.currentInput", source.currentInput, "current_input");
  const snapshot = {
    stable: { world: { storyWorldId: source.world.storyWorldId, name: source.world.name, ...(source.world.summary === undefined ? {} : { summary: source.world.summary }) }, characters, relationships, facts: includedFacts },
    dynamic: { memories: includedMemories, ...(source.conversationSummary === undefined ? {} : { conversationSummary: source.conversationSummary }), recentMessages: (source.recentMessages ?? []).slice(-24) },
    runtime: { task: source.task, ...(source.currentInput === undefined ? {} : { currentInput: source.currentInput }) },
    sources,
    omittedSources,
    baseCanonRevision: source.world.revision,
    budget: { limit, used },
  };
  return { ...snapshot, contextHash: stableHash(snapshot) };
}

function estimateTokens(value: unknown): number {
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 4));
}

function stableHash(value: unknown): string {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
