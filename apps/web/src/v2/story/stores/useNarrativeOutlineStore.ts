import { defineStore } from "pinia";
import type {
  V2NarrativeOutline,
  V2NarrativeOutlineArc,
  V2NarrativeOutlineChapter,
  V2NarrativeOutlineQuest,
  V2NarrativeOutlineScene,
  V2CreateChapterRequest,
  V2UpdateChapterRequest,
  V2CreateQuestRequest,
  V2UpdateQuestRequest,
  V2ApplyNarrativeTemplateRequest,
  V2ApplyNarrativeTemplateResponse,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

export interface NarrativeOutlineState {
  outline: V2NarrativeOutline | null;
  activeArcId: string | null;
  activeChapterId: string | null;
  activeQuestId: string | null;
  activeSceneId: string | null;
  expandedNodeIds: string[];
  filterQuery: string;
  loading: boolean;
  error: string | null;
}

export const useNarrativeOutlineStore = defineStore("narrativeOutline", {
  state: (): NarrativeOutlineState => ({
    outline: null,
    activeArcId: null,
    activeChapterId: null,
    activeQuestId: null,
    activeSceneId: null,
    expandedNodeIds: [],
    filterQuery: "",
    loading: false,
    error: null,
  }),

  getters: {
    allScenes(state): readonly V2NarrativeOutlineScene[] {
      if (!state.outline) return [];
      const result: V2NarrativeOutlineScene[] = [];
      for (const arc of state.outline.arcs) {
        for (const ch of arc.chapters) {
          for (const q of ch.quests) {
            result.push(...q.scenes);
          }
          result.push(...ch.looseScenes);
        }
        for (const q of arc.looseQuests) {
          result.push(...q.scenes);
        }
        result.push(...arc.looseScenes);
      }
      result.push(...state.outline.unassignedScenes);
      return result;
    },

    activeScene(state): V2NarrativeOutlineScene | null {
      if (!state.activeSceneId) return null;
      return this.allScenes.find((s) => s.sceneId === state.activeSceneId) ?? null;
    },

    activeQuest(state): V2NarrativeOutlineQuest | null {
      if (!state.outline || !state.activeQuestId) return null;
      for (const arc of state.outline.arcs) {
        for (const ch of arc.chapters) {
          const found = ch.quests.find((q) => q.questId === state.activeQuestId);
          if (found) return found;
        }
        const found = arc.looseQuests.find((q) => q.questId === state.activeQuestId);
        if (found) return found;
      }
      return null;
    },

    activeChapter(state): V2NarrativeOutlineChapter | null {
      if (!state.outline || !state.activeChapterId) return null;
      for (const arc of state.outline.arcs) {
        const found = arc.chapters.find((c) => c.chapterId === state.activeChapterId);
        if (found) return found;
      }
      return null;
    },

    activeArc(state): V2NarrativeOutlineArc | null {
      if (!state.outline || !state.activeArcId) return null;
      return state.outline.arcs.find((a) => a.arcId === state.activeArcId) ?? null;
    },

    filteredOutline(state): V2NarrativeOutline | null {
      if (!state.outline) return null;
      const q = state.filterQuery.trim().toLowerCase();
      if (!q) return state.outline;

      const matches = (text?: string) => Boolean(text && text.toLowerCase().includes(q));

      const filterScene = (s: V2NarrativeOutlineScene) => matches(s.title);
      const filterQuest = (quest: V2NarrativeOutlineQuest): V2NarrativeOutlineQuest | null => {
        const matchingScenes = quest.scenes.filter(filterScene);
        if (matches(quest.title) || matches(quest.summary) || matchingScenes.length > 0) {
          return {
            ...quest,
            scenes: matchingScenes.length > 0 ? matchingScenes : quest.scenes,
          };
        }
        return null;
      };

      const filterChapter = (ch: V2NarrativeOutlineChapter): V2NarrativeOutlineChapter | null => {
        const quests = ch.quests.map(filterQuest).filter((item): item is V2NarrativeOutlineQuest => item !== null);
        const looseScenes = ch.looseScenes.filter(filterScene);
        if (matches(ch.title) || matches(ch.summary) || quests.length > 0 || looseScenes.length > 0) {
          return {
            ...ch,
            quests,
            looseScenes,
          };
        }
        return null;
      };

      const arcs: V2NarrativeOutlineArc[] = [];
      for (const arc of state.outline.arcs) {
        const chapters = arc.chapters.map(filterChapter).filter((item): item is V2NarrativeOutlineChapter => item !== null);
        const looseQuests = arc.looseQuests.map(filterQuest).filter((item): item is V2NarrativeOutlineQuest => item !== null);
        const looseScenes = arc.looseScenes.filter(filterScene);
        if (matches(arc.title) || matches(arc.summary) || chapters.length > 0 || looseQuests.length > 0 || looseScenes.length > 0) {
          arcs.push({
            arcId: arc.arcId,
            title: arc.title,
            ...(arc.summary ? { summary: arc.summary } : {}),
            chapters,
            looseQuests,
            looseScenes,
          });
        }
      }

      const unassignedScenes = state.outline.unassignedScenes.filter(filterScene);

      return {
        storyWorldId: state.outline.storyWorldId,
        arcs,
        unassignedScenes,
      };
    },
  },

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    isExpanded(nodeId: string): boolean {
      return this.expandedNodeIds.includes(nodeId);
    },

    toggleExpanded(nodeId: string): void {
      const idx = this.expandedNodeIds.indexOf(nodeId);
      if (idx >= 0) {
        this.expandedNodeIds.splice(idx, 1);
      } else {
        this.expandedNodeIds.push(nodeId);
      }
    },

    expandAll(): void {
      if (!this.outline) return;
      const ids: string[] = [];
      for (const arc of this.outline.arcs) {
        ids.push(arc.arcId);
        for (const ch of arc.chapters) {
          ids.push(ch.chapterId);
          for (const q of ch.quests) {
            ids.push(q.questId);
          }
        }
        for (const q of arc.looseQuests) {
          ids.push(q.questId);
        }
      }
      this.expandedNodeIds = Array.from(new Set(ids));
    },

    collapseAll(): void {
      this.expandedNodeIds = [];
    },

    selectScene(sceneId: string): void {
      this.activeSceneId = sceneId;
      if (!this.outline) return;
      for (const arc of this.outline.arcs) {
        for (const ch of arc.chapters) {
          for (const q of ch.quests) {
            if (q.scenes.some((s) => s.sceneId === sceneId)) {
              this.activeArcId = arc.arcId;
              this.activeChapterId = ch.chapterId;
              this.activeQuestId = q.questId;
              if (!this.isExpanded(arc.arcId)) this.expandedNodeIds.push(arc.arcId);
              if (!this.isExpanded(ch.chapterId)) this.expandedNodeIds.push(ch.chapterId);
              if (!this.isExpanded(q.questId)) this.expandedNodeIds.push(q.questId);
              return;
            }
          }
          if (ch.looseScenes.some((s) => s.sceneId === sceneId)) {
            this.activeArcId = arc.arcId;
            this.activeChapterId = ch.chapterId;
            this.activeQuestId = null;
            if (!this.isExpanded(arc.arcId)) this.expandedNodeIds.push(arc.arcId);
            if (!this.isExpanded(ch.chapterId)) this.expandedNodeIds.push(ch.chapterId);
            return;
          }
        }
        if (arc.looseScenes.some((s) => s.sceneId === sceneId)) {
          this.activeArcId = arc.arcId;
          this.activeChapterId = null;
          this.activeQuestId = null;
          if (!this.isExpanded(arc.arcId)) this.expandedNodeIds.push(arc.arcId);
          return;
        }
      }
    },

    async fetchOutline(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const client = this.getClient();
        this.outline = await client.getOutline(storyWorldId);
        // Expand top level nodes by default if empty
        if (this.expandedNodeIds.length === 0 && this.outline) {
          this.expandedNodeIds = this.outline.arcs.map((a) => a.arcId);
        }
        // Auto-select first scene if none selected
        if (!this.activeSceneId && this.allScenes.length > 0) {
          this.selectScene(this.allScenes[0]!.sceneId);
        }
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : "Failed to load outline";
      } finally {
        this.loading = false;
      }
    },

    async createChapter(storyWorldId: string, request: V2CreateChapterRequest): Promise<void> {
      const client = this.getClient();
      await client.createChapter(storyWorldId, request);
      await this.fetchOutline(storyWorldId);
    },

    async updateChapter(storyWorldId: string, chapterId: string, request: V2UpdateChapterRequest): Promise<void> {
      const client = this.getClient();
      await client.updateChapter(storyWorldId, chapterId, request);
      await this.fetchOutline(storyWorldId);
    },

    async deleteChapter(storyWorldId: string, chapterId: string): Promise<void> {
      const client = this.getClient();
      await client.deleteChapter(storyWorldId, chapterId);
      if (this.activeChapterId === chapterId) {
        this.activeChapterId = null;
      }
      await this.fetchOutline(storyWorldId);
    },

    async createQuest(storyWorldId: string, request: V2CreateQuestRequest): Promise<void> {
      const client = this.getClient();
      await client.createQuest(storyWorldId, request);
      await this.fetchOutline(storyWorldId);
    },

    async updateQuest(storyWorldId: string, questId: string, request: V2UpdateQuestRequest): Promise<void> {
      const client = this.getClient();
      await client.updateQuest(storyWorldId, questId, request);
      await this.fetchOutline(storyWorldId);
    },

    async deleteQuest(storyWorldId: string, questId: string): Promise<void> {
      const client = this.getClient();
      await client.deleteQuest(storyWorldId, questId);
      if (this.activeQuestId === questId) {
        this.activeQuestId = null;
      }
      await this.fetchOutline(storyWorldId);
    },

    async applyTemplate(storyWorldId: string, request: V2ApplyNarrativeTemplateRequest): Promise<V2ApplyNarrativeTemplateResponse> {
      const client = this.getClient();
      const res = await client.applyTemplate(storyWorldId, request);
      await this.fetchOutline(storyWorldId);
      this.expandAll();
      return res;
    },
  },
});
