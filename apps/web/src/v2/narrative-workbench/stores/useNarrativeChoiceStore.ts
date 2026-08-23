import { defineStore } from "pinia";
import type {
  V2ChoiceDto,
  V2ChoiceId,
  V2CreateChoiceRequest,
  V2Revision,
  V2SceneId,
  V2UpdateChoiceRequest,
} from "@living-network/contracts/v2";
import { useNarrativeRevisionStore } from "./useNarrativeRevisionStore.ts";
import { createNarrativeMutationKey } from "../utils/idempotency.ts";

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
    choicesForScene: (state) => (sceneId: string): V2ChoiceDto[] => {
      return state.choicesBySourceSceneId[sceneId] ?? [];
    },

    allChoices(state): V2ChoiceDto[] {
      return Object.values(state.choicesBySourceSceneId).flat();
    },

    activeChoice(state): V2ChoiceDto | null {
      if (!state.activeChoiceId) return null;
      for (const list of Object.values(state.choicesBySourceSceneId)) {
        const found = list.find((c) => c.choiceId === state.activeChoiceId);
        if (found) return found;
      }
      return null;
    },
  },

  actions: {
    setActiveChoice(choiceId: string | null): void {
      this.activeChoiceId = choiceId;
    },

    async fetchChoices(storyWorldId: string): Promise<void> {
      return this.fetchChoicesForWorld(storyWorldId);
    },

    async fetchChoicesForWorld(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/graph`);
        if (!res.ok) {
          throw new Error(`Failed to load graph: ${res.statusText}`);
        }
        const data = (await res.json()) as { choices?: readonly V2ChoiceDto[] };
        const map: Record<string, V2ChoiceDto[]> = {};
        for (const choice of data.choices ?? []) {
          if (!map[choice.sourceSceneId]) {
            map[choice.sourceSceneId] = [];
          }
          map[choice.sourceSceneId]!.push(choice);
        }
        this.choicesBySourceSceneId = map;
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : "Failed to load choices";
      } finally {
        this.loading = false;
      }
    },

    async fetchChoicesForScene(storyWorldId: string, _sceneId?: string): Promise<void> {
      void _sceneId;
      return this.fetchChoicesForWorld(storyWorldId);
    },

    async createChoice(
      storyWorldId: string,
      request: {
        choiceId: string;
        sourceSceneId: string;
        targetSceneId?: string | undefined;
        label: string;
        expectedRevision?: number | undefined;
      },
    ): Promise<V2ChoiceDto | null> {
      this.saving = true;
      this.error = null;
      const revisionStore = useNarrativeRevisionStore();
      try {
        const body: V2CreateChoiceRequest = {
          choiceId: request.choiceId as V2ChoiceId,
          sourceSceneId: request.sourceSceneId as V2SceneId,
          ...(request.targetSceneId ? { targetSceneId: request.targetSceneId as V2SceneId } : {}),
          label: request.label,
          gates: [],
          consequences: [],
          expectedRevision: (request.expectedRevision ?? revisionStore.requireRevision()) as V2Revision,
          idempotencyKey: createNarrativeMutationKey("create_choice"),
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

        const data = (await res.json()) as { item?: V2ChoiceDto; choice?: V2ChoiceDto; revision?: number; worldRevision?: number };
        const choice: V2ChoiceDto = data.item ?? data.choice ?? (data as unknown as V2ChoiceDto);
        const nextRev = data.worldRevision ?? data.revision;
        if (nextRev !== undefined) {
          revisionStore.setRevision(nextRev);
        }
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
        targetSceneId?: string | undefined;
        label: string;
        gates?: V2ChoiceDto["gates"] | undefined;
        consequences?: V2ChoiceDto["consequences"] | undefined;
        expectedRevision?: number | undefined;
      },
    ): Promise<void> {
      this.saving = true;
      this.error = null;
      const revisionStore = useNarrativeRevisionStore();
      try {
        const body: V2UpdateChoiceRequest = {
          sourceSceneId: update.sourceSceneId as V2SceneId,
          ...(update.targetSceneId ? { targetSceneId: update.targetSceneId as V2SceneId } : {}),
          label: update.label,
          ...(update.gates ? { gates: update.gates } : {}),
          ...(update.consequences ? { consequences: update.consequences } : {}),
          expectedRevision: (update.expectedRevision ?? revisionStore.requireRevision()) as V2Revision,
          idempotencyKey: createNarrativeMutationKey("update_choice"),
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

        const data = (await res.json()) as { item?: V2ChoiceDto; revision?: number; worldRevision?: number };
        const nextRev = data.worldRevision ?? data.revision;
        if (nextRev !== undefined) {
          revisionStore.setRevision(nextRev);
        }

        await this.fetchChoicesForWorld(storyWorldId);
      } catch (err) {
        this.error = err instanceof Error ? err.message : "更新分支失败";
        throw err;
      } finally {
        this.saving = false;
      }
    },

    async deleteChoice(storyWorldId: string, choiceId: string): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/choices/${choiceId}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 404 && res.status !== 405) {
          // Fallback gracefully
        }
        for (const [sourceSceneId, list] of Object.entries(this.choicesBySourceSceneId)) {
          this.choicesBySourceSceneId[sourceSceneId] = list.filter((c) => c.choiceId !== choiceId);
        }
        if (this.activeChoiceId === choiceId) {
          this.activeChoiceId = null;
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "删除分支失败";
      } finally {
        this.saving = false;
      }
    },

    clear(): void {
      this.choicesBySourceSceneId = {};
      this.activeChoiceId = null;
      this.error = null;
    },
  },
});
