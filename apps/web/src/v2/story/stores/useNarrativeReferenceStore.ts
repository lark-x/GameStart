import { defineStore } from "pinia";
import type {
  V2CharacterId,
  V2LocationId,
  V2NarrativeReference,
  V2NarrativeReferenceRole,
  V2NarrativeReferenceTargetType,
  V2SceneReferencesDto,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";
import { useNarrativeRevisionStore } from "../../narrative-workbench/stores/useNarrativeRevisionStore.ts";
import { createNarrativeMutationKey } from "../../narrative-workbench/utils/idempotency.ts";

export interface NarrativeReferenceState {
  sceneReferences: V2SceneReferencesDto | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export const useNarrativeReferenceStore = defineStore("narrativeReference", {
  state: (): NarrativeReferenceState => ({
    sceneReferences: null,
    loading: false,
    saving: false,
    error: null,
  }),

  getters: {
    mainLocationId(state): string | null {
      return state.sceneReferences?.mainLocationId ?? null;
    },

    participantCharacterIds(state): readonly string[] {
      return state.sceneReferences?.participantCharacterIds ?? [];
    },

    loreItemIds(state): readonly string[] {
      return (state.sceneReferences?.references ?? [])
        .filter((r) => r.targetType === "lore")
        .map((r) => r.targetId);
    },

    allReferences(state): readonly V2NarrativeReference[] {
      return state.sceneReferences?.references ?? [];
    },
  },

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    async fetchSceneReferences(storyWorldId: string, sceneId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const client = this.getClient();
        this.sceneReferences = await client.getSceneReferences(storyWorldId, sceneId);
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : "Failed to load scene references";
      } finally {
        this.loading = false;
      }
    },

    async fetchReferences(storyWorldId: string, sceneId: string): Promise<void> {
      return this.fetchSceneReferences(storyWorldId, sceneId);
    },

    async addParticipant(storyWorldId: string, sceneId: string, characterId: string): Promise<void> {
      if (this.participantCharacterIds.includes(characterId)) return;
      return this.toggleParticipant(storyWorldId, sceneId, characterId);
    },

    async removeParticipant(storyWorldId: string, sceneId: string, characterId: string): Promise<void> {
      if (!this.participantCharacterIds.includes(characterId)) return;
      return this.toggleParticipant(storyWorldId, sceneId, characterId);
    },

    async addLoreItem(storyWorldId: string, sceneId: string, loreId: string): Promise<void> {
      return this.addCustomReference(storyWorldId, sceneId, "lore", loreId, "related");
    },

    async removeLoreItem(storyWorldId: string, sceneId: string, loreId: string): Promise<void> {
      const client = this.getClient();
      const revisionStore = useNarrativeRevisionStore();
      const current = this.sceneReferences;
      const refs = (current?.references ?? [])
        .filter((r) => !(r.targetId === loreId && r.targetType === "lore"))
        .map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          role: r.role,
        }));

      this.saving = true;
      try {
        const response = await client.replaceSceneReferences(storyWorldId, sceneId, {
          ...(current?.mainLocationId ? { mainLocationId: current.mainLocationId } : {}),
          ...(current?.participantCharacterIds ? { participantCharacterIds: current.participantCharacterIds } : {}),
          references: refs,
          expectedRevision: revisionStore.requireRevision(),
          idempotencyKey: createNarrativeMutationKey("ref_del_lore"),
        });
        this.sceneReferences = response.references;
        revisionStore.setRevision(response.revision);
      } finally {
        this.saving = false;
      }
    },

    async setMainLocation(storyWorldId: string, sceneId: string, locationId: string | null): Promise<void> {
      const client = this.getClient();
      const revisionStore = useNarrativeRevisionStore();
      const current = this.sceneReferences;
      this.saving = true;
      try {
        const filteredRefs = current?.references
          ? current.references.filter((r) => r.role !== "location").map((r) => ({
              targetType: r.targetType,
              targetId: r.targetId,
              role: r.role,
            }))
          : undefined;

        const response = await client.replaceSceneReferences(storyWorldId, sceneId, {
          mainLocationId: (locationId as V2LocationId) ?? null,
          ...(current?.participantCharacterIds ? { participantCharacterIds: current.participantCharacterIds } : {}),
          ...(filteredRefs ? { references: filteredRefs } : {}),
          expectedRevision: revisionStore.requireRevision(),
          idempotencyKey: createNarrativeMutationKey("ref_loc"),
        });
        this.sceneReferences = response.references;
        revisionStore.setRevision(response.revision);
      } finally {
        this.saving = false;
      }
    },

    async toggleParticipant(storyWorldId: string, sceneId: string, characterId: string): Promise<void> {
      const client = this.getClient();
      const revisionStore = useNarrativeRevisionStore();
      const current = this.sceneReferences;
      const currentParticipants = [...(current?.participantCharacterIds ?? [])];
      const idx = currentParticipants.indexOf(characterId as V2CharacterId);
      if (idx >= 0) {
        currentParticipants.splice(idx, 1);
      } else {
        currentParticipants.push(characterId as V2CharacterId);
      }

      this.saving = true;
      try {
        const filteredRefs = current?.references
          ? current.references.filter((r) => r.role !== "participant").map((r) => ({
              targetType: r.targetType,
              targetId: r.targetId,
              role: r.role,
            }))
          : undefined;

        const response = await client.replaceSceneReferences(storyWorldId, sceneId, {
          ...(current?.mainLocationId ? { mainLocationId: current.mainLocationId } : {}),
          participantCharacterIds: currentParticipants,
          ...(filteredRefs ? { references: filteredRefs } : {}),
          expectedRevision: revisionStore.requireRevision(),
          idempotencyKey: createNarrativeMutationKey("ref_part"),
        });
        this.sceneReferences = response.references;
        revisionStore.setRevision(response.revision);
      } finally {
        this.saving = false;
      }
    },

    async addCustomReference(
      storyWorldId: string,
      sceneId: string,
      targetType: V2NarrativeReferenceTargetType,
      targetId: string,
      role: V2NarrativeReferenceRole,
    ): Promise<void> {
      const client = this.getClient();
      const revisionStore = useNarrativeRevisionStore();
      const current = this.sceneReferences;
      const refs = [
        ...(current?.references ?? []).map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          role: r.role,
        })),
        { targetType, targetId, role },
      ];

      this.saving = true;
      try {
        const response = await client.replaceSceneReferences(storyWorldId, sceneId, {
          ...(current?.mainLocationId ? { mainLocationId: current.mainLocationId } : {}),
          ...(current?.participantCharacterIds ? { participantCharacterIds: current.participantCharacterIds } : {}),
          references: refs,
          expectedRevision: revisionStore.requireRevision(),
          idempotencyKey: createNarrativeMutationKey("ref_add"),
        });
        this.sceneReferences = response.references;
        revisionStore.setRevision(response.revision);
      } finally {
        this.saving = false;
      }
    },
  },
});
