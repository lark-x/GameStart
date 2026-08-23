import type {
  V2IdempotencyKey,
  V2ReleaseBlockerDto,
  V2ReleaseId,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";
import type { V2CanonSnapshotDto } from "./canon.ts";
import type { V2GraphDiagnosticDto, V2GraphSnapshotDto } from "./graph.ts";
import type { V2StateVariableDto } from "./state.ts";

export interface V2ReleaseManifestDto {
  readonly releaseId: V2ReleaseId;
  readonly storyWorldId: V2StoryWorldId;
  readonly version: string;
  readonly sourceRevision: V2Revision;
  readonly contentHash: string;
  readonly canon: V2CanonSnapshotDto;
  readonly graph: V2GraphSnapshotDto;
  readonly stateSchema: readonly V2StateVariableDto[];
  readonly narrative?: Record<string, unknown>;
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
