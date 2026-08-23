import { defineStore } from "pinia";
import type { NarrativeWorkbenchMode } from "../components/topbar/NarrativeModeTabs.vue";

export type BottomPanelTab = "problems" | "search" | "jobs" | "candidates";

export interface NarrativeSessionState {
  storyWorldId: string;
  mode: NarrativeWorkbenchMode;
  activeArcId: string | null;
  activeChapterId: string | null;
  activeQuestId: string | null;
  activeSceneId: string | null;
  explorerCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorTab: "properties" | "references" | "choices" | "ai";
  bottomPanelOpen: boolean;
  bottomPanelTab: BottomPanelTab;
  previewActive: boolean;
}

export const useNarrativeSessionStore = defineStore("narrativeSession", {
  state: (): NarrativeSessionState => ({
    storyWorldId: "",
    mode: "script",
    activeArcId: null,
    activeChapterId: null,
    activeQuestId: null,
    activeSceneId: null,
    explorerCollapsed: false,
    inspectorCollapsed: false,
    inspectorTab: "properties",
    bottomPanelOpen: false,
    bottomPanelTab: "problems",
    previewActive: false,
  }),

  actions: {
    initSession(storyWorldId: string, queryMode?: NarrativeWorkbenchMode, sceneId?: string, questId?: string): void {
      this.storyWorldId = storyWorldId;
      if (queryMode) this.mode = queryMode;
      if (sceneId) this.activeSceneId = sceneId;
      if (questId) this.activeQuestId = questId;
    },

    setMode(mode: NarrativeWorkbenchMode): void {
      this.mode = mode;
    },

    selectScene(sceneId: string | null): void {
      this.activeSceneId = sceneId;
      if (sceneId && this.mode === "outline") {
        this.mode = "script";
      }
    },

    selectQuest(questId: string | null): void {
      this.activeQuestId = questId;
    },

    selectChapter(chapterId: string | null): void {
      this.activeChapterId = chapterId;
    },

    selectArc(arcId: string | null): void {
      this.activeArcId = arcId;
    },

    toggleExplorer(): void {
      this.explorerCollapsed = !this.explorerCollapsed;
    },

    toggleInspector(): void {
      this.inspectorCollapsed = !this.inspectorCollapsed;
    },

    setInspectorTab(tab: "properties" | "references" | "choices" | "ai"): void {
      this.inspectorTab = tab;
      this.inspectorCollapsed = false;
    },

    toggleBottomPanel(tab?: BottomPanelTab): void {
      if (tab) {
        if (this.bottomPanelOpen && this.bottomPanelTab === tab) {
          this.bottomPanelOpen = false;
        } else {
          this.bottomPanelTab = tab;
          this.bottomPanelOpen = true;
        }
      } else {
        this.bottomPanelOpen = !this.bottomPanelOpen;
      }
    },

    togglePreview(): void {
      this.previewActive = !this.previewActive;
    },
  },
});
