import type {
  V2IdempotencyKey,
  V2Revision,
} from "../shared/index.ts";
import type { V2QuestKind } from "./hierarchy.ts";
import type { V2SceneBlockKind } from "./scene-document.ts";

export type V2NarrativeTemplateId =
  | "blank"
  | "three-act"
  | "rpg-main-quest"
  | "rpg-side-quest"
  | "visual-novel";

export interface V2TemplateBlockDef {
  readonly kind: V2SceneBlockKind;
  readonly text?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface V2TemplateChoiceDef {
  readonly label: string;
  readonly targetSceneKey?: string;
}

export interface V2TemplateSceneDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly isEntry?: boolean;
  readonly blocks?: readonly V2TemplateBlockDef[];
  readonly choices?: readonly V2TemplateChoiceDef[];
}

export interface V2TemplateQuestDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly kind: V2QuestKind;
  readonly scenes: readonly V2TemplateSceneDef[];
}

export interface V2TemplateChapterDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly quests: readonly V2TemplateQuestDef[];
  readonly looseScenes?: readonly V2TemplateSceneDef[];
}

export interface V2TemplateArcDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly chapters: readonly V2TemplateChapterDef[];
  readonly looseQuests?: readonly V2TemplateQuestDef[];
  readonly looseScenes?: readonly V2TemplateSceneDef[];
}

export interface V2NarrativeTemplate {
  readonly templateId: V2NarrativeTemplateId;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly structure: {
    readonly arcs: readonly V2TemplateArcDef[];
    readonly unassignedScenes?: readonly V2TemplateSceneDef[];
  };
}

export interface V2ApplyNarrativeTemplateRequest {
  readonly templateId: V2NarrativeTemplateId;
  readonly mode?: "append" | "replace_empty";
  readonly expectedRevision?: V2Revision;
  readonly idempotencyKey?: V2IdempotencyKey;
}

export interface V2ApplyNarrativeTemplateResponse {
  readonly createdArcsCount: number;
  readonly createdChaptersCount: number;
  readonly createdQuestsCount: number;
  readonly createdScenesCount: number;
  readonly createdChoicesCount: number;
  readonly revision: V2Revision;
}
