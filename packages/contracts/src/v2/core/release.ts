import type {
  V2IdempotencyKey,
  V2ReleaseBlockerDto,
  V2ReleaseId,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";
import type { V2CanonSnapshotDto, V2TimelineEventDto } from "./canon.ts";
import type { V2GraphDiagnosticDto, V2GraphSnapshotDto } from "./graph.ts";
import type { V2StateVariableDto } from "./state.ts";
import type { V2NarrativeChapter, V2NarrativeQuest, V2NarrativeReference, V2CanonLoreEntry } from "../narrative/index.ts";
import type { V2SceneBlock, V2SceneDocument } from "../narrative/scene-document.ts";

export interface V2ReleaseNarrativeSnapshotDto {
  readonly schemaVersion: 1;
  readonly chapters: readonly V2NarrativeChapter[];
  readonly quests: readonly V2NarrativeQuest[];
  readonly sceneDocuments: readonly V2SceneDocument[];
  readonly sceneBlocks: readonly V2SceneBlock[];
  readonly loreEntries: readonly V2CanonLoreEntry[];
  readonly references: readonly V2NarrativeReference[];
  readonly timelineEvents: readonly V2TimelineEventDto[];
}

export interface V2ReleaseManifestDto {
  readonly releaseId: V2ReleaseId;
  readonly storyWorldId: V2StoryWorldId;
  readonly version: string;
  readonly sourceRevision: V2Revision;
  readonly contentHash: string;
  readonly canon: V2CanonSnapshotDto;
  readonly graph: V2GraphSnapshotDto;
  readonly stateSchema: readonly V2StateVariableDto[];
  readonly narrative?: V2ReleaseNarrativeSnapshotDto;
  readonly createdAt: string;
}

export interface V2ReleasePreflightDto {
  readonly valid: boolean;
  readonly diagnostics: readonly V2GraphDiagnosticDto[];
  readonly blockers: readonly V2ReleaseBlockerDto[];
}

export interface V2CreateReleaseRequest {
  readonly releaseId: V2ReleaseId;
  readonly version: string;
  readonly sourceRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}
