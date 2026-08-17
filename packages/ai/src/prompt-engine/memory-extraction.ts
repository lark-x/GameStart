export type V2MemoryExtractionKind = "profile" | "preference" | "relationship" | "episodic" | "world_fact";

export interface V2MemoryExtractionCandidate {
  readonly kind: V2MemoryExtractionKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly string[];
}

export interface V2MemoryExtractionResult {
  readonly memories: readonly V2MemoryExtractionCandidate[];
}

const KINDS = new Set<V2MemoryExtractionKind>(["profile", "preference", "relationship", "episodic", "world_fact"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMemoryCandidate(value: unknown, index: number): V2MemoryExtractionCandidate {
  if (!isRecord(value)) throw new Error(`memory[${index}] must be an object`);
  const kind = value.kind;
  if (typeof kind !== "string" || !KINDS.has(kind as V2MemoryExtractionKind)) {
    throw new Error(`memory[${index}].kind is invalid`);
  }
  const content = value.content;
  if (typeof content !== "string" || content.trim().length === 0 || content.trim().length > 2000) {
    throw new Error(`memory[${index}].content is invalid`);
  }
  const importance = value.importance;
  const confidence = value.confidence;
  if (typeof importance !== "number" || !Number.isFinite(importance) || importance < 0 || importance > 1) {
    throw new Error(`memory[${index}].importance must be between 0 and 1`);
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`memory[${index}].confidence must be between 0 and 1`);
  }
  const sourceMessageIds = value.sourceMessageIds;
  if (!Array.isArray(sourceMessageIds) || sourceMessageIds.length === 0 || !sourceMessageIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
    throw new Error(`memory[${index}].sourceMessageIds must be a non-empty string array`);
  }
  return {
    kind: kind as V2MemoryExtractionKind,
    content: content.trim(),
    importance,
    confidence,
    sourceMessageIds: sourceMessageIds.map((id) => (id as string).trim()),
  };
}

export function parseV2MemoryExtractionOutput(text: string): V2MemoryExtractionResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Memory extraction output is empty");
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error("Memory extraction output is not valid JSON");
  }
  if (!isRecord(payload) || !Array.isArray(payload.memories)) {
    throw new Error("Memory extraction output must contain a memories array");
  }
  return {
    memories: payload.memories.map((candidate, index) => parseMemoryCandidate(candidate, index)),
  };
}
