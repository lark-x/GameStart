import { V2DomainError } from "../shared/index.ts";

export interface V2ParsedSceneCandidate {
  readonly payload: V2SceneCandidatePayload;
  readonly rawTextPreview: string;
}

export interface V2SceneCandidatePayload {
  readonly scene: {
    readonly sceneId: string;
    readonly title: string;
    readonly body?: string;
    readonly locationId?: string;
    readonly arcId?: string;
    readonly chapterId?: string;
    readonly questId?: string;
    readonly document?: { readonly mode: "legacy_body" | "blocks"; readonly blocks?: readonly { readonly blockId?: string; readonly kind: "dialogue" | "narration" | "stage_direction" | "action" | "command"; readonly speakerCharacterId?: string; readonly text?: string; readonly payload?: Readonly<Record<string, unknown>> }[] };
    readonly participantCharacterIds: readonly string[];
  };
  readonly references?: readonly { readonly referenceId?: string; readonly targetType: string; readonly targetId: string; readonly role: string }[];
  readonly choices: readonly {
    readonly label: string;
    readonly targetSceneId?: string;
    readonly consequenceSummary?: string;
  }[];
  readonly validationNotes: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return nonEmptyString(value, field);
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new V2DomainError("INVALID_INPUT", `${field} must be an array`);
  return value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
}

function parseDocument(value: unknown): V2SceneCandidatePayload["scene"]["document"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.mode !== "legacy_body" && value.mode !== "blocks")) throw new V2DomainError("INVALID_INPUT", "scene.document.mode must be legacy_body or blocks");
  if (value.blocks === undefined) return { mode: value.mode };
  if (!Array.isArray(value.blocks)) throw new V2DomainError("INVALID_INPUT", "scene.document.blocks must be an array");
  return {
    mode: value.mode,
    blocks: value.blocks.map((block, index) => {
      if (!isRecord(block)) throw new V2DomainError("INVALID_INPUT", `scene.document.blocks[${index}] must be an object`);
      const kind = block.kind;
      if (kind !== "dialogue" && kind !== "narration" && kind !== "stage_direction" && kind !== "action" && kind !== "command") throw new V2DomainError("INVALID_INPUT", `scene.document.blocks[${index}].kind is invalid`);
      return {
        ...(block.blockId === undefined ? {} : { blockId: nonEmptyString(block.blockId, `scene.document.blocks[${index}].blockId`) }),
        kind,
        ...(block.speakerCharacterId === undefined ? {} : { speakerCharacterId: nonEmptyString(block.speakerCharacterId, `scene.document.blocks[${index}].speakerCharacterId`) }),
        ...(block.text === undefined ? {} : { text: nonEmptyString(block.text, `scene.document.blocks[${index}].text`) }),
        ...(block.payload === undefined ? {} : { payload: isRecord(block.payload) ? block.payload : (() => { throw new V2DomainError("INVALID_INPUT", `scene.document.blocks[${index}].payload must be an object`); })() }),
      };
    }),
  };
}
function parseReferences(value: unknown): V2SceneCandidatePayload["references"] {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new V2DomainError("INVALID_INPUT", "references must be an array");
  return value.map((reference, index) => {
    if (!isRecord(reference)) throw new V2DomainError("INVALID_INPUT", `references[${index}] must be an object`);
    return {
      ...(reference.referenceId === undefined ? {} : { referenceId: nonEmptyString(reference.referenceId, `references[${index}].referenceId`) }),
      targetType: nonEmptyString(reference.targetType, `references[${index}].targetType`),
      targetId: nonEmptyString(reference.targetId, `references[${index}].targetId`),
      role: nonEmptyString(reference.role, `references[${index}].role`),
    };
  });
}
function parseChoices(value: unknown): V2SceneCandidatePayload["choices"] {
  if (!Array.isArray(value)) {
    throw new V2DomainError("INVALID_INPUT", "choices must be an array");
  }
  return value.map((choice, index) => {
    if (!isRecord(choice)) throw new V2DomainError("INVALID_INPUT", `choices[${index}] must be an object`);
    const result: V2SceneCandidatePayload["choices"][number] = {
      label: nonEmptyString(choice.label, `choices[${index}].label`),
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: nonEmptyString(choice.targetSceneId, `choices[${index}].targetSceneId`) }),
      ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: nonEmptyString(choice.consequenceSummary, `choices[${index}].consequenceSummary`) }),
    };
    return result;
  });
}

export function parseV2SceneCandidateText(rawText: string): V2ParsedSceneCandidate {
  const raw = nonEmptyString(rawText, "rawText");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new V2DomainError("INVALID_INPUT", "scene candidate output must be valid JSON");
  }
  if (!isRecord(parsed) || !isRecord(parsed.scene)) {
    throw new V2DomainError("INVALID_INPUT", "scene candidate output must include scene");
  }
  const scene = parsed.scene;
  const locationId = optionalNonEmptyString(scene.locationId, "scene.locationId");
  const arcId = optionalNonEmptyString(scene.arcId, "scene.arcId");
  const chapterId = optionalNonEmptyString(scene.chapterId, "scene.chapterId");
  const questId = optionalNonEmptyString(scene.questId, "scene.questId");
  const document = parseDocument(scene.document);
  const references = parseReferences(parsed.references);
  const hasBlocks = document?.blocks !== undefined && document.blocks.length > 0;
  if (scene.body === undefined && !hasBlocks) {
    throw new V2DomainError("INVALID_INPUT", "scene must include body or at least one document block");
  }
  const payload: V2SceneCandidatePayload = {
    scene: {
      sceneId: nonEmptyString(scene.sceneId, "scene.sceneId"),
      title: nonEmptyString(scene.title, "scene.title"),
      ...(scene.body === undefined ? {} : { body: nonEmptyString(scene.body, "scene.body") }),
      ...(locationId === undefined ? {} : { locationId }),
      ...(arcId === undefined ? {} : { arcId }),
      ...(chapterId === undefined ? {} : { chapterId }),
      ...(questId === undefined ? {} : { questId }),
      ...(document === undefined ? {} : { document }),
      participantCharacterIds: stringArray(scene.participantCharacterIds, "scene.participantCharacterIds"),
    },
    ...(references === undefined ? {} : { references }),
    choices: parseChoices(parsed.choices),
    validationNotes: parsed.validationNotes === undefined
      ? []
      : stringArray(parsed.validationNotes, "validationNotes"),
  };
  return {
    payload,
    rawTextPreview: raw.slice(0, 1000),
  };
}
