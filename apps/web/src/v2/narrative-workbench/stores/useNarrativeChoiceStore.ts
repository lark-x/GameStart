import { defineStore } from "pinia";
import type { V2ChoiceDto } from "@living-network/contracts/v2";

export interface NarrativeChoiceState {
  choicesBySourceSceneId: Record<string, V2ChoiceDto[]>;
  loading: boolean;
  error: string | null;
}

export const useNarrativeChoiceStore = defineStore("narrativeChoice", {
  state: (): NarrativeChoiceState => ({
    choicesBySourceSceneId: {},
    loading: false,
    error: null,
  }),

  getters: {
    getChoicesForScene: (state) => (sceneId: string): readonly V2ChoiceDto[] => {
      return state.choicesBySourceSceneId[sceneId] ?? [];
    },

    choicesForScene: (state) => (sceneId: string): readonly V2ChoiceDto[] => {
      return state.choicesBySourceSceneId[sceneId] ?? [];
    },
  },

  actions: {
    setChoicesForScene(sceneId: string, choices: V2ChoiceDto[]): void {
      this.choicesBySourceSceneId[sceneId] = choices;
    },

    async fetchChoices(storyWorldId: string, _sceneId?: string): Promise<void> {
      return this.fetchChoicesForWorld(storyWorldId);
    },

    async fetchChoicesForWorld(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/worlds/${storyWorldId}/graph/choices`).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (res && Array.isArray(res)) {
          const map: Record<string, V2ChoiceDto[]> = {};
          for (const choice of res as V2ChoiceDto[]) {
            if (!map[choice.sourceSceneId]) {
              map[choice.sourceSceneId] = [];
            }
            map[choice.sourceSceneId]!.push(choice);
          }
          this.choicesBySourceSceneId = map;
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "获取分支选项失败";
      } finally {
        this.loading = false;
      }
    },
  },
});
