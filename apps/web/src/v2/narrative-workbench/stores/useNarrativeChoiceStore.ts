import { defineStore } from "pinia";
import type {
  V2ChoiceDto,
  V2ChoiceId,
  V2CreateChoiceRequest,
  V2IdempotencyKey,
  V2Revision,
  V2SceneId,
  V2UpdateChoiceRequest,
} from "@living-network/contracts/v2";

export interface NarrativeChoiceState {
  choicesBySourceSceneId: Record<string, V2ChoiceDto[]>;
  activeChoiceId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export const useNarrativeChoiceStore = defineStore("narrativeChoice", {
  state: (): NarrativeChoiceState => ({
    choicesBySourceSceneId: {},
    activeChoiceId: null,
    loading: false,
    saving: false,
    error: null,
  }),

  getters: {
    allChoices(state): readonly V2ChoiceDto[] {
      const list: V2ChoiceDto[] = [];
      for (const choices of Object.values(state.choicesBySourceSceneId)) {
        list.push(...choices);
      }
      return list;
    },

    getChoicesForScene: (state) => (sceneId: string): readonly V2ChoiceDto[] => {
      return state.choicesBySourceSceneId[sceneId] ?? [];
    },

    choicesForScene: (state) => (sceneId: string): readonly V2ChoiceDto[] => {
      return state.choicesBySourceSceneId[sceneId] ?? [];
    },

    activeChoice(state): V2ChoiceDto | null {
      if (!state.activeChoiceId) return null;
      for (const choices of Object.values(state.choicesBySourceSceneId)) {
        const found = choices.find((c) => c.choiceId === state.activeChoiceId);
        if (found) return found;
      }
      return null;
    },
  },

  actions: {
    setActiveChoiceId(choiceId: string | null): void {
      this.activeChoiceId = choiceId;
    },

    setChoicesForScene(sceneId: string, choices: V2ChoiceDto[]): void {
      this.choicesBySourceSceneId[sceneId] = choices;
    },

    async fetchChoices(storyWorldId: string): Promise<void> {
      return this.fetchChoicesForWorld(storyWorldId);
    },

    async fetchChoicesForWorld(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/graph`).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (res && res.choices && Array.isArray(res.choices)) {
          const map: Record<string, V2ChoiceDto[]> = {};
          for (const choice of res.choices as V2ChoiceDto[]) {
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

    async createChoice(
      storyWorldId: string,
      request: {
        choiceId: string;
        sourceSceneId: string;
        targetSceneId?: string;
        label: string;
        expectedRevision?: number;
      },
    ): Promise<V2ChoiceDto | null> {
      this.saving = true;
      this.error = null;
      try {
        const body: V2CreateChoiceRequest = {
          choiceId: request.choiceId as V2ChoiceId,
          sourceSceneId: request.sourceSceneId as V2SceneId,
          ...(request.targetSceneId ? { targetSceneId: request.targetSceneId as V2SceneId } : {}),
          label: request.label,
          gates: [],
          consequences: [],
          expectedRevision: (request.expectedRevision ?? 1) as V2Revision,
          idempotencyKey: `create_choice:${Date.now()}` as V2IdempotencyKey,
        };

        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/choices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `创建分支失败 (${res.status})`);
        }

        const created = await res.json() as { choice?: V2ChoiceDto; item?: V2ChoiceDto } | V2ChoiceDto;
        const choice = (created as any).choice || (created as any).item || created;
        if (!this.choicesBySourceSceneId[request.sourceSceneId]) {
          this.choicesBySourceSceneId[request.sourceSceneId] = [];
        }
        this.choicesBySourceSceneId[request.sourceSceneId]!.push(choice);
        return choice;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "创建分支失败";
        throw err;
      } finally {
        this.saving = false;
      }
    },

    async updateChoice(
      storyWorldId: string,
      choiceId: string,
      update: {
        sourceSceneId: string;
        targetSceneId?: string;
        label: string;
        gates?: V2ChoiceDto["gates"];
        consequences?: V2ChoiceDto["consequences"];
        expectedRevision?: number;
      },
    ): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        const body: V2UpdateChoiceRequest = {
          sourceSceneId: update.sourceSceneId as V2SceneId,
          ...(update.targetSceneId ? { targetSceneId: update.targetSceneId as V2SceneId } : {}),
          label: update.label,
          ...(update.gates ? { gates: update.gates } : {}),
          ...(update.consequences ? { consequences: update.consequences } : {}),
          expectedRevision: (update.expectedRevision ?? 1) as V2Revision,
          idempotencyKey: `update_choice:${Date.now()}` as V2IdempotencyKey,
        };

        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/choices/${choiceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `更新分支失败 (${res.status})`);
        }

        await this.fetchChoicesForWorld(storyWorldId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "更新分支失败";
        throw err;
      } finally {
        this.saving = false;
      }
    },
  },
});
