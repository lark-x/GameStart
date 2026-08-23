import type {
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "../shared/index.ts";
import type { V2QuestId } from "./hierarchy.ts";

export type V2NarrativeGenerationTask =
  | "create_scene"
  | "continue_scene"
  | "rewrite_scene"
  | "expand_dialogue"
  | "generate_choices"
  | "create_quest_outline";

export interface V2ContextSourceRevision {
  readonly kind: string;
  readonly id: string;
  readonly revision: number;
}

export interface V2NarrativeContextFingerprint {
  readonly storyWorldId: V2StoryWorldId;
  readonly worldRevision: number;
  readonly sources: readonly V2ContextSourceRevision[];
  readonly hash: string;
}

export interface V2NarrativeGenerationContextRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly task: V2NarrativeGenerationTask;
  readonly targetSceneId?: V2SceneId;
  readonly targetQuestId?: V2QuestId;
  readonly prompt?: string;
  readonly tokenBudget?: number;
}

export interface V2NarrativePromptSection {
  readonly title: string;
  readonly content: string;
  readonly tokenEstimate: number;
}

export interface V2NarrativeGenerationContextResponse {
  readonly contextHash: string;
  readonly fingerprint: V2NarrativeContextFingerprint;
  readonly sections: readonly V2NarrativePromptSection[];
  readonly totalTokensEstimate: number;
  readonly selectedSources: readonly string[];
  readonly omittedSources: readonly string[];
}
