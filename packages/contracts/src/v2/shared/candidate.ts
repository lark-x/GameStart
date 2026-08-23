import type {
  V2CandidateId,
  V2CharacterId,
  V2IsoDateTime,
  V2LocationId,
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "./primitives.ts";

export type V2CandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type V2CandidateKind = "scene" | "state_delta" | "asset";

export interface V2CandidateEnvelope<TPayload> {
  readonly candidateId: V2CandidateId;
  readonly kind: V2CandidateKind;
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly status: V2CandidateStatus;
  readonly payload: TPayload;
  readonly provenance: V2CandidateProvenance;
  readonly createdAt: V2IsoDateTime;
  readonly reviewedAt?: V2IsoDateTime;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}

export interface V2CandidateProvenance {
  readonly source: "human" | "llm" | "comfyui" | "import";
  readonly jobId?: string;
  readonly contextHash?: string;
  readonly summary?: string;
}

export interface V2SceneCandidateBlock {
  readonly blockId?: string;
  readonly kind: "dialogue" | "narration" | "stage_direction" | "action" | "command";
  readonly speakerCharacterId?: string | null;
  readonly text?: string;
  readonly payload?: Record<string, unknown>;
}

export interface V2SceneCandidatePayload {
  readonly scene: {
    readonly sceneId: V2SceneId;
    readonly title: string;
    readonly body?: string;
    readonly document?: {
      readonly mode: "legacy_body" | "blocks";
      readonly blocks?: readonly V2SceneCandidateBlock[];
    };
    readonly arcId?: string | null;
    readonly chapterId?: string | null;
    readonly questId?: string | null;
    readonly locationId?: V2LocationId;
    readonly participantCharacterIds: readonly V2CharacterId[];
  };
  readonly references?: readonly {
    readonly referenceId?: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly role: string;
  }[];
  readonly choices: readonly {
    readonly label: string;
    readonly targetSceneId?: V2SceneId;
    readonly consequenceSummary?: string;
  }[];
  readonly validationNotes: readonly string[];
}
