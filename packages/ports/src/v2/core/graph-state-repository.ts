import type {
  V2ArcId,
  V2ChoiceId,
  V2SceneId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2GraphArc,
  V2GraphChoice,
  V2GraphScene,
  V2TypedStateVariable,
} from "@living-network/domain/v2";

import type { V2CanonRepository } from "./canon-repository.ts";

export interface V2GraphStateRepository {
  getArc(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly arcId: V2ArcId;
  }): Promise<V2GraphArc | undefined>;
  listArcs(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphArc[]>;
  createArc(input: V2GraphArc): Promise<V2GraphArc>;

  getScene(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly sceneId: V2SceneId;
  }): Promise<V2GraphScene | undefined>;
  listScenes(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphScene[]>;
  createScene(input: V2GraphScene): Promise<V2GraphScene>;

  getChoice(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly choiceId: V2ChoiceId;
  }): Promise<V2GraphChoice | undefined>;
  listChoices(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphChoice[]>;
  createChoice(input: V2GraphChoice): Promise<V2GraphChoice>;

  updateArc(input: V2GraphArc): Promise<V2GraphArc>;
  updateScene(input: V2GraphScene): Promise<V2GraphScene>;
  updateChoice(input: V2GraphChoice): Promise<V2GraphChoice>;
  updateStateVariable(input: V2TypedStateVariable): Promise<V2TypedStateVariable>;

  getStateVariable(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly key: string;
  }): Promise<V2TypedStateVariable | undefined>;
  listStateVariables(storyWorldId: V2StoryWorldId): Promise<readonly V2TypedStateVariable[]>;
  createStateVariable(input: V2TypedStateVariable): Promise<V2TypedStateVariable>;
}

export interface V2GraphStateUnitOfWork {
  withGraphStateTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
