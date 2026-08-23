import type {
  V2ApplyNarrativeTemplateRequest,
  V2CreateChapterRequest,
  V2CreateQuestRequest,
  V2CreateLoreEntryRequest,
  V2NarrativeGenerationContextRequest,
  V2ReplaceSceneReferencesRequest,
  V2SaveSceneDocumentRequest,
  V2UpdateChapterRequest,
  V2UpdateQuestRequest,
  V2UpdateLoreEntryRequest,
} from "@living-network/contracts/v2";
import { V2HttpError } from "../core/errors.ts";

export function parseCreateChapterRequest(body: unknown): V2CreateChapterRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.arcId !== "string" || !b.arcId.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "arcId is required");
  }
  if (typeof b.title !== "string" || !b.title.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "title is required");
  }
  return {
    ...(typeof b.chapterId === "string" && b.chapterId.trim() ? { chapterId: b.chapterId.trim() } : {}),
    arcId: b.arcId as any,
    title: b.title.trim(),
    ...(typeof b.summary === "string" && b.summary.trim() ? { summary: b.summary.trim() } : {}),
    ...(typeof b.ordinal === "number" ? { ordinal: b.ordinal } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseUpdateChapterRequest(body: unknown): V2UpdateChapterRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  return {
    ...(typeof b.arcId === "string" && b.arcId.trim() ? { arcId: b.arcId.trim() as any } : {}),
    ...(typeof b.title === "string" && b.title.trim() ? { title: b.title.trim() } : {}),
    ...(b.summary === null ? { summary: null } : typeof b.summary === "string" ? { summary: b.summary.trim() } : {}),
    ...(typeof b.ordinal === "number" ? { ordinal: b.ordinal } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseCreateQuestRequest(body: unknown): V2CreateQuestRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.title !== "string" || !b.title.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "title is required");
  }
  return {
    ...(typeof b.questId === "string" && b.questId.trim() ? { questId: b.questId.trim() } : {}),
    ...(typeof b.arcId === "string" && b.arcId.trim() ? { arcId: b.arcId.trim() as any } : {}),
    ...(typeof b.chapterId === "string" && b.chapterId.trim() ? { chapterId: b.chapterId.trim() } : {}),
    title: b.title.trim(),
    ...(typeof b.summary === "string" && b.summary.trim() ? { summary: b.summary.trim() } : {}),
    ...(typeof b.kind === "string" && b.kind.trim() ? { kind: b.kind.trim() as any } : {}),
    ...(typeof b.ordinal === "number" ? { ordinal: b.ordinal } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseUpdateQuestRequest(body: unknown): V2UpdateQuestRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  return {
    ...(b.arcId === null ? { arcId: null } : typeof b.arcId === "string" && b.arcId.trim() ? { arcId: b.arcId.trim() as any } : {}),
    ...(b.chapterId === null ? { chapterId: null } : typeof b.chapterId === "string" && b.chapterId.trim() ? { chapterId: b.chapterId.trim() } : {}),
    ...(typeof b.title === "string" && b.title.trim() ? { title: b.title.trim() } : {}),
    ...(b.summary === null ? { summary: null } : typeof b.summary === "string" ? { summary: b.summary.trim() } : {}),
    ...(typeof b.kind === "string" && b.kind.trim() ? { kind: b.kind.trim() as any } : {}),
    ...(typeof b.ordinal === "number" ? { ordinal: b.ordinal } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseSaveSceneDocumentRequest(body: unknown): V2SaveSceneDocumentRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;

  const blocks = Array.isArray(b.blocks)
    ? b.blocks.map((item, idx) => {
        if (typeof item !== "object" || item === null) {
          throw new V2HttpError(400, "BAD_REQUEST", `blocks[${idx}] must be an object`);
        }
        const blk = item as Record<string, unknown>;
        if (typeof blk.kind !== "string") {
          throw new V2HttpError(400, "BAD_REQUEST", `blocks[${idx}].kind is required`);
        }
        return {
          ...(typeof blk.blockId === "string" && blk.blockId.trim() ? { blockId: blk.blockId.trim() } : {}),
          kind: blk.kind as any,
          ...(blk.speakerCharacterId === null ? { speakerCharacterId: null } : typeof blk.speakerCharacterId === "string" ? { speakerCharacterId: blk.speakerCharacterId as any } : {}),
          ...(typeof blk.text === "string" ? { text: blk.text } : {}),
          ...(typeof blk.payload === "object" && blk.payload !== null ? { payload: blk.payload as Record<string, unknown> } : {}),
        };
      })
    : undefined;

  return {
    ...(typeof b.documentMode === "string" ? { documentMode: b.documentMode === "legacy_body" ? "legacy_body" : "blocks" } : {}),
    ...(typeof b.title === "string" && b.title.trim() ? { title: b.title.trim() } : {}),
    ...(b.body === null ? { body: null } : typeof b.body === "string" ? { body: b.body } : {}),
    ...(b.arcId === null ? { arcId: null } : typeof b.arcId === "string" && b.arcId.trim() ? { arcId: b.arcId.trim() as any } : {}),
    ...(b.chapterId === null ? { chapterId: null } : typeof b.chapterId === "string" && b.chapterId.trim() ? { chapterId: b.chapterId.trim() } : {}),
    ...(b.questId === null ? { questId: null } : typeof b.questId === "string" && b.questId.trim() ? { questId: b.questId.trim() } : {}),
    ...(typeof b.isEntry === "boolean" ? { isEntry: b.isEntry } : {}),
    ...(typeof b.ordinal === "number" ? { ordinal: b.ordinal } : {}),
    ...(blocks !== undefined ? { blocks } : {}),
    ...(typeof b.expectedSceneRevision === "number" ? { expectedSceneRevision: b.expectedSceneRevision } : typeof b.revision === "number" ? { expectedSceneRevision: b.revision } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseReplaceSceneReferencesRequest(body: unknown): V2ReplaceSceneReferencesRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  const references = Array.isArray(b.references)
    ? b.references.map((item, idx) => {
        if (typeof item !== "object" || item === null) {
          throw new V2HttpError(400, "BAD_REQUEST", `references[${idx}] must be an object`);
        }
        const ref = item as Record<string, unknown>;
        if (typeof ref.targetType !== "string" || typeof ref.targetId !== "string" || typeof ref.role !== "string") {
          throw new V2HttpError(400, "BAD_REQUEST", `references[${idx}] requires targetType, targetId, and role`);
        }
        return {
          targetType: ref.targetType as any,
          targetId: ref.targetId,
          role: ref.role as any,
        };
      })
    : undefined;

  return {
    ...(b.mainLocationId === null ? { mainLocationId: null } : typeof b.mainLocationId === "string" && b.mainLocationId.trim() ? { mainLocationId: b.mainLocationId.trim() as any } : {}),
    ...(Array.isArray(b.participantCharacterIds) ? { participantCharacterIds: b.participantCharacterIds.map(String) as any } : {}),
    ...(references !== undefined ? { references } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseCreateLoreEntryRequest(body: unknown): V2CreateLoreEntryRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "name is required");
  }
  if (typeof b.type !== "string" || !b.type.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "type is required");
  }
  return {
    ...(typeof b.loreEntryId === "string" && b.loreEntryId.trim() ? { loreEntryId: b.loreEntryId.trim() } : {}),
    type: b.type as any,
    ...(typeof b.customType === "string" && b.customType.trim() ? { customType: b.customType.trim() } : {}),
    name: b.name.trim(),
    ...(typeof b.summary === "string" && b.summary.trim() ? { summary: b.summary.trim() } : {}),
    ...(typeof b.body === "string" ? { body: b.body } : {}),
    ...(Array.isArray(b.tags) ? { tags: b.tags.map(String) } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseUpdateLoreEntryRequest(body: unknown): V2UpdateLoreEntryRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  return {
    ...(typeof b.type === "string" && b.type.trim() ? { type: b.type.trim() as any } : {}),
    ...(b.customType === null ? { customType: null } : typeof b.customType === "string" && b.customType.trim() ? { customType: b.customType.trim() } : {}),
    ...(typeof b.name === "string" && b.name.trim() ? { name: b.name.trim() } : {}),
    ...(b.summary === null ? { summary: null } : typeof b.summary === "string" ? { summary: b.summary.trim() } : {}),
    ...(b.body === null ? { body: null } : typeof b.body === "string" ? { body: b.body } : {}),
    ...(Array.isArray(b.tags) ? { tags: b.tags.map(String) } : {}),
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseApplyNarrativeTemplateRequest(body: unknown): V2ApplyNarrativeTemplateRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.templateId !== "string" || !b.templateId.trim()) {
    throw new V2HttpError(400, "BAD_REQUEST", "templateId is required");
  }
  return {
    templateId: b.templateId as any,
    mode: b.mode === "replace_empty" ? "replace_empty" : "append",
    ...(typeof b.expectedRevision === "number" ? { expectedRevision: b.expectedRevision as any } : {}),
    ...(typeof b.idempotencyKey === "string" && b.idempotencyKey.trim() ? { idempotencyKey: b.idempotencyKey.trim() as any } : {}),
  };
}

export function parseNarrativeGenerationContextRequest(storyWorldId: string, body: unknown): V2NarrativeGenerationContextRequest {
  if (typeof body !== "object" || body === null) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  const b = body as Record<string, unknown>;
  return {
    storyWorldId: storyWorldId as any,
    task: (typeof b.task === "string" && b.task.trim() ? b.task.trim() : "create_scene") as any,
    ...(typeof b.targetSceneId === "string" && b.targetSceneId.trim() ? { targetSceneId: b.targetSceneId.trim() as any } : {}),
    ...(typeof b.targetQuestId === "string" && b.targetQuestId.trim() ? { targetQuestId: b.targetQuestId.trim() } : {}),
    ...(typeof b.prompt === "string" && b.prompt.trim() ? { prompt: b.prompt.trim() } : typeof b.userInstructions === "string" && b.userInstructions.trim() ? { prompt: b.userInstructions.trim() } : {}),
    ...(typeof b.tokenBudget === "number" ? { tokenBudget: b.tokenBudget } : {}),
  };
}
