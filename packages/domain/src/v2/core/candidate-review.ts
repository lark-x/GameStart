import { V2DomainError } from "../shared/index.ts";
import {
  assertV2ReviewTransition,
  type V2ReviewAction,
  type V2ReviewStatus,
} from "../shared/review.ts";

export type V2CoreCandidateId = string;
export type V2CoreCandidateStoryWorldId = string;
export type V2CoreCandidateRevision = number;
export type V2CoreCandidateSource = "human" | "llm" | "comfyui" | "import";

export interface V2CoreCandidateProvenance {
  readonly source: V2CoreCandidateSource;
  readonly jobId?: string;
  readonly contextHash?: string;
  readonly summary?: string;
}

export interface V2CoreSceneCandidateBlock {
  readonly blockId?: string;
  readonly kind: "dialogue" | "narration" | "stage_direction" | "action" | "command";
  readonly speakerCharacterId?: string | null;
  readonly text?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface V2CoreSceneCandidatePayload {
  readonly scene: {
    readonly sceneId: string;
    readonly title: string;
    readonly body?: string;
    readonly document?: {
      readonly mode: "legacy_body" | "blocks";
      readonly blocks?: readonly V2CoreSceneCandidateBlock[];
    };
    readonly arcId?: string | null;
    readonly chapterId?: string | null;
    readonly questId?: string | null;
    readonly locationId?: string;
    readonly participantCharacterIds: readonly string[];
  };
  readonly references?: readonly {
    readonly referenceId?: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly role: string;
  }[];
  readonly choices: readonly {
    readonly label: string;
    readonly targetSceneId?: string;
    readonly consequenceSummary?: string;
  }[];
  readonly validationNotes: readonly string[];
}

export interface V2CoreSceneCandidate {
  readonly candidateId: V2CoreCandidateId;
  readonly kind: "scene";
  readonly storyWorldId: V2CoreCandidateStoryWorldId;
  readonly baseCanonRevision: V2CoreCandidateRevision;
  readonly status: V2ReviewStatus;
  readonly payload: V2CoreSceneCandidatePayload;
  readonly provenance: V2CoreCandidateProvenance;
  readonly createdAt?: string;
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}

export interface V2CoreCandidateReview {
  readonly candidate: V2CoreSceneCandidate;
  readonly action: V2ReviewAction;
  readonly reviewer: string;
  readonly reason?: string;
  readonly expectedRevision: V2CoreCandidateRevision;
}

export interface V2CoreCandidateApplyPlan {
  readonly scene: {
    readonly sceneId: string;
    readonly title: string;
    readonly body?: string;
    readonly arcId?: string;
    readonly chapterId?: string;
    readonly questId?: string;
    readonly locationId?: string;
    readonly participantCharacterIds: readonly string[];
    readonly documentMode?: "legacy_body" | "blocks";
    readonly blocks?: readonly {
      readonly blockId?: string;
      readonly kind: "dialogue" | "narration" | "stage_direction" | "action" | "command";
      readonly speakerCharacterId?: string;
      readonly text?: string;
      readonly payload?: Readonly<Record<string, unknown>>;
    }[];
  };
  readonly references?: readonly {
    readonly referenceId?: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly role: string;
  }[];
  readonly choices: readonly {
    readonly choiceId: string;
    readonly sourceSceneId: string;
    readonly targetSceneId?: string;
    readonly label: string;
  }[];
}

export function createV2SceneCandidate(input: {
  readonly candidateId: V2CoreCandidateId;
  readonly storyWorldId: V2CoreCandidateStoryWorldId;
  readonly baseCanonRevision: V2CoreCandidateRevision;
  readonly payload: V2CoreSceneCandidatePayload;
  readonly provenance: V2CoreCandidateProvenance;
}): V2CoreSceneCandidate {
  assertPositiveRevision(input.baseCanonRevision, "baseCanonRevision");
  return {
    candidateId: assertNonEmptyId(input.candidateId, "candidateId"),
    kind: "scene",
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    baseCanonRevision: input.baseCanonRevision,
    status: "pending",
    payload: assertSceneCandidatePayload(input.payload),
    provenance: assertCandidateProvenance(input.provenance),
  };
}

export function reviewV2SceneCandidate(input: V2CoreCandidateReview): V2CoreSceneCandidate {
  assertPositiveRevision(input.expectedRevision, "expectedRevision");
  const nextStatus = assertV2ReviewTransition(input.candidate.status, input.action);
  if (input.action === "approve") {
    assertV2CandidateIsFresh(input.candidate.baseCanonRevision, input.expectedRevision);
  }
  return {
    ...input.candidate,
    status: nextStatus,
    reviewer: assertNonEmptyText(input.reviewer, "reviewer", 120),
    ...(input.reason === undefined ? {} : { reviewReason: assertOptionalText(input.reason, "reason", 1200) }),
  };
}

export function assertV2CandidateIsFresh(baseCanonRevision: V2CoreCandidateRevision, expectedRevision: V2CoreCandidateRevision): void {
  if (baseCanonRevision !== expectedRevision) {
    throw new V2DomainError("STALE_REVISION", `Candidate is based on revision ${baseCanonRevision}, expected ${expectedRevision}`);
  }
}

export function buildV2SceneCandidateApplyPlan(candidate: V2CoreSceneCandidate): V2CoreCandidateApplyPlan {
  if (candidate.status !== "pending" && candidate.status !== "changes_requested") {
    throw new V2DomainError("INVALID_CANDIDATE_TRANSITION", `Cannot apply a ${candidate.status} candidate`);
  }
  const scene = candidate.payload.scene;
  return {
    scene: {
      sceneId: scene.sceneId,
      title: scene.title,
      ...(scene.body !== undefined ? { body: scene.body } : {}),
      ...(scene.arcId ? { arcId: scene.arcId } : {}),
      ...(scene.chapterId ? { chapterId: scene.chapterId } : {}),
      ...(scene.questId ? { questId: scene.questId } : {}),
      ...(scene.locationId !== undefined ? { locationId: scene.locationId } : {}),
      participantCharacterIds: scene.participantCharacterIds ?? [],
      ...(scene.document?.mode ? { documentMode: scene.document.mode } : {}),
      ...(scene.document?.blocks
        ? {
            blocks: scene.document.blocks.map((b) => ({
              ...(b.blockId ? { blockId: b.blockId } : {}),
              kind: b.kind,
              ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
              ...(b.text ? { text: b.text } : {}),
              ...(b.payload ? { payload: b.payload } : {}),
            })),
          }
        : {}),
    },
    ...(candidate.payload.references ? { references: candidate.payload.references } : {}),
    choices: candidate.payload.choices.map((choice, index) => ({
      choiceId: `${candidate.candidateId}:choice:${index + 1}`,
      sourceSceneId: scene.sceneId,
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: choice.targetSceneId }),
      label: choice.label,
    })),
  };
}

function assertSceneCandidatePayload(input: V2CoreSceneCandidatePayload): V2CoreSceneCandidatePayload {
  const scene = input.scene;
  const bodyText = scene.body !== undefined ? assertOptionalText(scene.body, "scene.body", 32000) : undefined;
  return {
    scene: {
      sceneId: assertNonEmptyId(scene.sceneId, "scene.sceneId"),
      title: assertNonEmptyText(scene.title, "scene.title", 160),
      ...(bodyText !== undefined ? { body: bodyText } : {}),
      ...(scene.document
        ? {
            document: {
              mode: scene.document.mode,
              ...(scene.document.blocks ? { blocks: scene.document.blocks } : {}),
            },
          }
        : {}),
      ...(scene.arcId ? { arcId: scene.arcId } : {}),
      ...(scene.chapterId ? { chapterId: scene.chapterId } : {}),
      ...(scene.questId ? { questId: scene.questId } : {}),
      ...(scene.locationId === undefined ? {} : { locationId: assertNonEmptyId(scene.locationId, "scene.locationId") }),
      participantCharacterIds: assertUniqueIds(scene.participantCharacterIds ?? [], "scene.participantCharacterIds"),
    },
    ...(input.references ? { references: input.references } : {}),
    choices: input.choices.map((choice, index) => ({
      label: assertNonEmptyText(choice.label, `choices[${index}].label`, 200),
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: assertNonEmptyId(choice.targetSceneId, `choices[${index}].targetSceneId`) }),
      ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: assertOptionalText(choice.consequenceSummary, `choices[${index}].consequenceSummary`, 1200) }),
    })),
    validationNotes: (input.validationNotes ?? []).map((note, index) => assertOptionalText(note, `validationNotes[${index}]`, 1200)),
  };
}

function assertCandidateProvenance(input: V2CoreCandidateProvenance): V2CoreCandidateProvenance {
  if (input.source !== "human" && input.source !== "llm" && input.source !== "comfyui" && input.source !== "import") {
    throw new V2DomainError("INVALID_INPUT", "candidate provenance source is not supported");
  }
  return {
    source: input.source,
    ...(input.jobId === undefined ? {} : { jobId: assertNonEmptyId(input.jobId, "provenance.jobId") }),
    ...(input.contextHash === undefined ? {} : { contextHash: assertOptionalText(input.contextHash, "provenance.contextHash", 256) }),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "provenance.summary", 1200) }),
  };
}

function assertUniqueIds(values: readonly string[], field: string): readonly string[] {
  const seen = new Set<string>();
  return values.map((value, index) => {
    const id = assertNonEmptyId(value, `${field}[${index}]`);
    if (seen.has(id)) {
      throw new V2DomainError("INVALID_INPUT", `${field} must not contain duplicate ids`);
    }
    seen.add(id);
    return id;
  });
}

function assertPositiveRevision(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a positive integer`);
  }
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value;
}

function assertNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return trimmed;
}
