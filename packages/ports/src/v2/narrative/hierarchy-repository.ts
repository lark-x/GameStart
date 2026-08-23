import type { V2NarrativeOutline } from "@living-network/contracts/v2";
import type {
  V2NarrativeChapter,
  V2NarrativeQuest,
} from "@living-network/domain/v2";

export interface V2NarrativeHierarchyRepository {
  listOutline(storyWorldId: string): Promise<V2NarrativeOutline>;
  getChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<V2NarrativeChapter | undefined>;
  listChapters(storyWorldId: string, arcId?: string): Promise<readonly V2NarrativeChapter[]>;
  createChapter(chapter: V2NarrativeChapter): Promise<V2NarrativeChapter>;
  updateChapter(chapter: V2NarrativeChapter): Promise<V2NarrativeChapter>;
  deleteChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<void>;

  getQuest(criteria: { readonly storyWorldId: string; readonly questId: string }): Promise<V2NarrativeQuest | undefined>;
  listQuests(storyWorldId: string, criteria?: { readonly arcId?: string; readonly chapterId?: string }): Promise<readonly V2NarrativeQuest[]>;
  createQuest(quest: V2NarrativeQuest): Promise<V2NarrativeQuest>;
  updateQuest(quest: V2NarrativeQuest): Promise<V2NarrativeQuest>;
  deleteQuest(criteria: { readonly storyWorldId: string; readonly questId: string }): Promise<void>;
}
