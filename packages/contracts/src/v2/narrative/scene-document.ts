import type { V2ArcId } from "../core/graph.ts";
import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "../shared/index.ts";
import type { V2ChapterId, V2QuestId } from "./hierarchy.ts";

export type V2SceneBlockKind =
  | "dialogue"
  | "narration"
  | "stage_direction"
  | "action"
  | "command";

export interface V2SceneBlock {
  readonly blockId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly sceneId: V2SceneId;
  readonly ordinal: number;
  readonly kind: V2SceneBlockKind;
  readonly speakerCharacterId?: V2CharacterId | undefined;
  readonly text?: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly revision: number;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

export type V2SceneDocumentMode = "legacy_body" | "blocks";

export interface V2SceneDocument {
  readonly sceneId: V2SceneId;
  readonly storyWorldId: V2StoryWorldId;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly documentMode: V2SceneDocumentMode;
  readonly body?: string | undefined;
  readonly arcId?: V2ArcId | undefined;
  readonly chapterId?: string | undefined;
  readonly questId?: string | undefined;
  readonly isEntry?: boolean | undefined;
  readonly ordinal?: number | undefined;
  readonly blocks: readonly V2SceneBlock[];
  readonly revision: number;
  readonly worldRevision?: number | undefined;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
}

export interface V2SceneBlockInput {
  readonly blockId?: string | undefined;
  readonly kind: V2SceneBlockKind;
  readonly speakerCharacterId?: V2CharacterId | undefined;
  readonly text?: string | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface V2SaveSceneDocumentRequest {
  readonly title?: string;
  readonly body?: string | null;
  readonly documentMode?: V2SceneDocumentMode;
  readonly arcId?: V2ArcId | null;
  readonly chapterId?: V2ChapterId | null;
  readonly questId?: V2QuestId | null;
  readonly isEntry?: boolean;
  readonly ordinal?: number;
  readonly blocks?: readonly V2SceneBlockInput[];
  readonly expectedSceneRevision?: number;
  readonly expectedRevision?: V2Revision;
  readonly idempotencyKey?: V2IdempotencyKey;
}

export interface V2SaveSceneDocumentResponse {
  readonly document: V2SceneDocument;
  readonly revision: V2Revision;
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
