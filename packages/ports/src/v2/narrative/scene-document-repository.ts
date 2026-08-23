import type {
  V2NarrativeScene,
  V2SceneBlock,
} from "@living-network/domain/v2";

export interface V2SceneDocumentAndBlocks {
  readonly scene: V2NarrativeScene;
  readonly blocks: readonly V2SceneBlock[];
}

export interface V2SceneDocumentRepository {
  getSceneDocument(criteria: { readonly storyWorldId: string; readonly sceneId: string }): Promise<V2SceneDocumentAndBlocks | undefined>;
  saveSceneDocument(document: {
    readonly scene: V2NarrativeScene;
    readonly blocks: readonly V2SceneBlock[];
  }): Promise<V2SceneDocumentAndBlocks>;
  listSceneBlocks(criteria: { readonly storyWorldId: string; readonly sceneId: string }): Promise<readonly V2SceneBlock[]>;
  listAllSceneBlocks(storyWorldId: string): Promise<readonly V2SceneBlock[]>;
  listAllScenes(storyWorldId: string): Promise<readonly V2NarrativeScene[]>;
}
