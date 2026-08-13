import type {
  V2AssetId,
  V2ReleaseId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";

export interface V2ApprovedAssetRef {
  readonly assetId: V2AssetId;
  readonly storyWorldId: V2StoryWorldId;
  readonly mediaRef: string;
  readonly contentHash: string;
}

export interface ApprovedAssetReaderPort {
  getApprovedAsset(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly assetId: V2AssetId;
  }): Promise<V2ApprovedAssetRef | undefined>;

  listReleaseAssets(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly releaseId: V2ReleaseId;
  }): Promise<readonly V2ApprovedAssetRef[]>;
}
