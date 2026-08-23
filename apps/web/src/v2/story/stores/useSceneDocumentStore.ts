import { defineStore } from "pinia";
import {
  renderSceneBlocksToPlainText,
  type V2SceneBlock,
  type V2SceneBlockKind,
  type V2SceneDocument,
  type V2SceneDocumentMode,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

export interface SceneDocumentState {
  document: V2SceneDocument | null;
  blocks: V2SceneBlock[];
  activeBlockId: string | null;
  documentMode: V2SceneDocumentMode;
  plainBody: string;
  isDirty: boolean;
  saving: boolean;
  loading: boolean;
  error: string | null;
  lastSavedAt: string | null;
}

export const useSceneDocumentStore = defineStore("sceneDocument", {
  state: (): SceneDocumentState => ({
    document: null,
    blocks: [],
    activeBlockId: null,
    documentMode: "blocks",
    plainBody: "",
    isDirty: false,
    saving: false,
    loading: false,
    error: null,
    lastSavedAt: null,
  }),

  getters: {
    activeBlock(state): V2SceneBlock | null {
      if (!state.activeBlockId) return null;
      return state.blocks.find((b) => b.blockId === state.activeBlockId) ?? null;
    },

    activeBlockIndex(state): number {
      if (!state.activeBlockId) return -1;
      return state.blocks.findIndex((b) => b.blockId === state.activeBlockId);
    },

    renderedPlainText(state): string {
      return renderSceneBlocksToPlainText(state.blocks);
    },

    speakerCharacterIds(state): readonly string[] {
      const set = new Set<string>();
      for (const b of state.blocks) {
        if (b.speakerCharacterId) set.add(b.speakerCharacterId);
      }
      return Array.from(set);
    },
  },

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    async fetchDocument(storyWorldId: string, sceneId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const client = this.getClient();
        const doc = await client.getSceneDocument(storyWorldId, sceneId);
        this.document = doc;
        this.blocks = [...doc.blocks];
        this.documentMode = doc.documentMode;
        this.plainBody = doc.body ?? "";
        this.activeBlockId = this.blocks.length > 0 ? this.blocks[0]!.blockId : null;
        this.isDirty = false;
        this.lastSavedAt = doc.updatedAt ?? doc.createdAt ?? null;
      } catch (err: any) {
        this.error = err.message || "Failed to load scene document";
      } finally {
        this.loading = false;
      }
    },

    setActiveBlockId(blockId: string | null): void {
      this.activeBlockId = blockId;
    },

    setDocumentMode(mode: V2SceneDocumentMode): void {
      if (this.documentMode === mode) return;
      if (mode === "legacy_body") {
        this.plainBody = this.renderedPlainText;
      }
      this.documentMode = mode;
      this.isDirty = true;
    },

    setPlainBody(text: string): void {
      this.plainBody = text;
      this.isDirty = true;
    },

    addBlock(
      afterOrdinal?: number,
      kind: V2SceneBlockKind = "dialogue",
      initialText: string = "",
      speakerCharacterId?: string,
    ): V2SceneBlock {
      if (!this.document) throw new Error("No active scene document");

      const newBlockId = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const targetIndex = afterOrdinal !== undefined ? afterOrdinal + 1 : this.blocks.length;

      const newBlock: V2SceneBlock = {
        blockId: newBlockId,
        storyWorldId: this.document.storyWorldId,
        sceneId: this.document.sceneId,
        ordinal: targetIndex,
        kind,
        ...(speakerCharacterId ? { speakerCharacterId: speakerCharacterId as any } : {}),
        text: initialText,
        payload: {},
        revision: 1,
      };

      this.blocks.splice(targetIndex, 0, newBlock);
      // Re-index ordinals
      this.blocks.forEach((b, idx) => {
        (b as any).ordinal = idx;
      });

      this.activeBlockId = newBlockId;
      this.isDirty = true;
      return newBlock;
    },

    updateBlock(blockId: string, partial: Partial<V2SceneBlock>): void {
      const idx = this.blocks.findIndex((b) => b.blockId === blockId);
      if (idx === -1) return;

      this.blocks[idx] = {
        ...this.blocks[idx]!,
        ...partial,
      };
      this.isDirty = true;
    },

    removeBlock(blockId: string): void {
      const idx = this.blocks.findIndex((b) => b.blockId === blockId);
      if (idx === -1) return;

      this.blocks.splice(idx, 1);
      // Re-index ordinals
      this.blocks.forEach((b, i) => {
        (b as any).ordinal = i;
      });

      // Update active selection
      if (this.activeBlockId === blockId) {
        if (this.blocks.length > 0) {
          const nextIdx = Math.min(idx, this.blocks.length - 1);
          this.activeBlockId = this.blocks[nextIdx]!.blockId;
        } else {
          this.activeBlockId = null;
        }
      }

      this.isDirty = true;
    },

    reorderBlocks(fromIndex: number, toIndex: number): void {
      if (fromIndex < 0 || fromIndex >= this.blocks.length || toIndex < 0 || toIndex >= this.blocks.length) return;
      const [moved] = this.blocks.splice(fromIndex, 1);
      if (!moved) return;
      this.blocks.splice(toIndex, 0, moved);
      this.blocks.forEach((b, idx) => {
        (b as any).ordinal = idx;
      });
      this.isDirty = true;
    },

    async saveDocument(storyWorldId: string): Promise<void> {
      if (!this.document) return;
      this.saving = true;
      this.error = null;

      try {
        const client = this.getClient();
        const saved = await client.saveSceneDocument(storyWorldId, this.document.sceneId, {
          title: this.document.title,
          documentMode: this.documentMode,
          ...(this.documentMode === "legacy_body" ? { body: this.plainBody } : {}),
          ...(this.document.arcId ? { arcId: this.document.arcId } : {}),
          ...(this.document.chapterId ? { chapterId: this.document.chapterId } : {}),
          ...(this.document.questId ? { questId: this.document.questId } : {}),
          isEntry: this.document.isEntry,
          ordinal: this.document.ordinal,
          blocks: this.blocks.map((b) => ({
            blockId: b.blockId,
            kind: b.kind,
            ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
            ...(b.text ? { text: b.text } : {}),
            payload: b.payload,
          })),
          expectedSceneRevision: this.document.revision,
          expectedRevision: 1 as any,
          idempotencyKey: `save_doc:${Date.now()}` as any,
        });

        this.document = saved;
        this.blocks = [...saved.blocks];
        this.isDirty = false;
        this.lastSavedAt = new Date().toISOString();
      } catch (err: any) {
        this.error = err.message || "Failed to save scene document";
        throw err;
      } finally {
        this.saving = false;
      }
    },
  },
});
