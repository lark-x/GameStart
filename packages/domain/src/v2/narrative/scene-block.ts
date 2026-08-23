import { V2DomainError } from "../shared/index.ts";

export type V2SceneBlockKind =
  | "dialogue"
  | "narration"
  | "stage_direction"
  | "action"
  | "command";

const VALID_BLOCK_KINDS = new Set<string>([
  "dialogue",
  "narration",
  "stage_direction",
  "action",
  "command",
]);

export interface V2SceneBlock {
  readonly blockId: string;
  readonly storyWorldId: string;
  readonly sceneId: string;
  readonly ordinal: number;
  readonly kind: V2SceneBlockKind;
  readonly speakerCharacterId?: string;
  readonly text?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function createV2SceneBlock(input: {
  readonly blockId: string;
  readonly storyWorldId: string;
  readonly sceneId: string;
  readonly ordinal?: number;
  readonly kind: V2SceneBlockKind;
  readonly speakerCharacterId?: string | null;
  readonly text?: string | null;
  readonly payload?: Readonly<Record<string, unknown>> | null;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): V2SceneBlock {
  const ordinal = input.ordinal ?? 0;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new V2DomainError("INVALID_INPUT", "scene block ordinal must be a non-negative integer");
  }
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new V2DomainError("INVALID_INPUT", "scene block revision must be a positive integer");
  }
  if (!VALID_BLOCK_KINDS.has(input.kind)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported scene block kind: ${input.kind}`);
  }

  const payload = (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload))
    ? input.payload
    : {};

  let speakerCharacterId: string | undefined;
  if (input.kind === "dialogue") {
    if (input.speakerCharacterId !== undefined && input.speakerCharacterId !== null && input.speakerCharacterId.trim() !== "") {
      speakerCharacterId = assertNonEmptyId(input.speakerCharacterId, "speakerCharacterId");
    }
  } else if (input.speakerCharacterId) {
    throw new V2DomainError("INVALID_INPUT", "speakerCharacterId is only allowed for dialogue blocks");
  }

  const text = (input.text !== undefined && input.text !== null)
    ? assertOptionalText(input.text, "text", 4000)
    : undefined;

  return {
    blockId: assertNonEmptyId(input.blockId, "blockId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    sceneId: assertNonEmptyId(input.sceneId, "sceneId"),
    ordinal,
    kind: input.kind,
    ...(speakerCharacterId === undefined ? {} : { speakerCharacterId }),
    ...(text === undefined ? {} : { text }),
    payload,
    revision,
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  };
}

export function renderSceneBlocksToPlainText(
  blocks: readonly Pick<V2SceneBlock, "kind" | "speakerCharacterId" | "text" | "payload">[],
  characterNameMap?: Readonly<Record<string, string>>,
): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const text = (block.text ?? "").trim();
    if (block.kind === "dialogue") {
      const speakerName = (block.speakerCharacterId && characterNameMap?.[block.speakerCharacterId]) || block.speakerCharacterId || "旁白";
      lines.push(`[${speakerName}] ${text}`);
    } else if (block.kind === "narration") {
      if (text) lines.push(text);
    } else if (block.kind === "stage_direction") {
      if (text) lines.push(`（${text}）`);
    } else if (block.kind === "action") {
      if (text) lines.push(`【${text}】`);
    } else if (block.kind === "command") {
      const commandName = typeof block.payload?.command === "string" ? block.payload.command : "command";
      lines.push(`::${commandName}::`);
    }
  }
  return lines.join("\n\n");
}

function assertNonEmptyId(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value.trim();
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const text = typeof value === "string" ? value : "";
  if (text.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return text;
}
