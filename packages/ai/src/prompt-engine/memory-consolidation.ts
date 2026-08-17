export type V2MemoryConsolidationAction = "keep_both" | "merge" | "supersede" | "ignore";

export interface V2MemoryConsolidationResult {
  readonly action: V2MemoryConsolidationAction;
  readonly mergedContent?: string;
  readonly confidence?: number;
}

const ACTIONS = new Set<V2MemoryConsolidationAction>(["keep_both", "merge", "supersede", "ignore"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseV2MemoryConsolidationOutput(text: string): V2MemoryConsolidationResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Memory consolidation output is empty");
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error("Memory consolidation output is not valid JSON");
  }
  if (!isRecord(payload) || typeof payload.action !== "string" || !ACTIONS.has(payload.action as V2MemoryConsolidationAction)) {
    throw new Error("Memory consolidation action is invalid");
  }
  const action = payload.action as V2MemoryConsolidationAction;
  let mergedContent: string | undefined;
  let confidence: number | undefined;
  if (payload.mergedContent !== undefined) {
    if (typeof payload.mergedContent !== "string" || payload.mergedContent.trim().length === 0) {
      throw new Error("mergedContent is invalid");
    }
    mergedContent = payload.mergedContent.trim();
  }
  if (payload.confidence !== undefined) {
    if (typeof payload.confidence !== "number" || !Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1) {
      throw new Error("confidence must be between 0 and 1");
    }
    confidence = payload.confidence;
  }
  if ((action === "merge" || action === "supersede") && mergedContent === undefined) {
    throw new Error("merge/supersede requires mergedContent");
  }
  return {
    action,
    ...(mergedContent === undefined ? {} : { mergedContent }),
    ...(confidence === undefined ? {} : { confidence }),
  };
}
