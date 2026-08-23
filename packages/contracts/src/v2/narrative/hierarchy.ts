import type { V2ArcId } from "../core/graph.ts";
import type {
  V2IdempotencyKey,
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2ChapterId = string;
export type V2QuestId = string;

export type V2QuestKind =
  | "main"
  | "story"
  | "character"
  | "side"
  | "world"
  | "event"
  | "custom";

export interface V2NarrativeChapter {
  readonly chapterId: V2ChapterId;
  readonly storyWorldId: V2StoryWorldId;
  readonly arcId: V2ArcId;
  readonly title: string;
  readonly summary?: string;
  readonly ordinal: number;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface V2NarrativeQuest {
  readonly questId: V2QuestId;
  readonly storyWorldId: V2StoryWorldId;
  readonly arcId?: V2ArcId;
  readonly chapterId?: V2ChapterId;
  readonly title: string;
  readonly summary?: string;
  readonly kind: V2QuestKind;
  readonly ordinal: number;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface V2NarrativeOutlineScene {
  readonly sceneId: V2SceneId;
  readonly title: string;
  readonly ordinal: number;
  readonly isEntry: boolean;
  readonly documentMode: "legacy_body" | "blocks";
  readonly blockCount: number;
  readonly choiceCount: number;
  readonly diagnosticCount: number;
  readonly locationId?: string;
  readonly participantCharacterIds: readonly string[];
}

export interface V2NarrativeOutlineQuest {
  readonly questId: V2QuestId;
  readonly title: string;
  readonly summary?: string;
  readonly kind: V2QuestKind;
  readonly ordinal: number;
  readonly scenes: readonly V2NarrativeOutlineScene[];
}

export interface V2NarrativeOutlineChapter {
  readonly chapterId: V2ChapterId;
  readonly title: string;
  readonly summary?: string;
  readonly ordinal: number;
  readonly quests: readonly V2NarrativeOutlineQuest[];
  readonly looseScenes: readonly V2NarrativeOutlineScene[];
}

export interface V2NarrativeOutlineArc {
  readonly arcId: V2ArcId;
  readonly title: string;
  readonly summary?: string;
  readonly chapters: readonly V2NarrativeOutlineChapter[];
  readonly looseQuests: readonly V2NarrativeOutlineQuest[];
  readonly looseScenes: readonly V2NarrativeOutlineScene[];
}

export interface V2NarrativeOutline {
  readonly storyWorldId: V2StoryWorldId;
  readonly arcs: readonly V2NarrativeOutlineArc[];
  readonly unassignedScenes: readonly V2NarrativeOutlineScene[];
}

export interface V2CreateChapterRequest {
  readonly chapterId?: V2ChapterId;
  readonly arcId: V2ArcId;
  readonly title: string;
  readonly summary?: string;
  readonly ordinal?: number;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2UpdateChapterRequest {
  readonly arcId?: V2ArcId;
  readonly title?: string;
  readonly summary?: string | null;
  readonly ordinal?: number;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateQuestRequest {
  readonly questId?: V2QuestId;
  readonly arcId?: V2ArcId;
  readonly chapterId?: V2ChapterId;
  readonly title: string;
  readonly summary?: string;
  readonly kind?: V2QuestKind;
  readonly ordinal?: number;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2UpdateQuestRequest {
  readonly arcId?: V2ArcId | null;
  readonly chapterId?: V2ChapterId | null;
  readonly title?: string;
  readonly summary?: string | null;
  readonly kind?: V2QuestKind;
  readonly ordinal?: number;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2DeleteHierarchyItemResponse {
  readonly deleted: boolean;
  readonly revision: V2Revision;
}
