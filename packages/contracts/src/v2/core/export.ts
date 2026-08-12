import type {
  V2ReleaseId,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2ExportSourceKind = "workspace" | "release";

export interface V2CoreExportBundleDto {
  readonly source: {
    readonly kind: V2ExportSourceKind;
    readonly storyWorldId: V2StoryWorldId;
    readonly revision?: V2Revision;
    readonly releaseId?: V2ReleaseId;
    readonly releaseVersion?: string;
  };
  readonly json: unknown;
  readonly markdown: string;
}
