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
  activeBlockId: string | null;
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
    activeBlockId: null,
    explorerCollapsed: false,
    inspectorCollapsed: false,
    inspectorTab: "properties",
    bottomPanelOpen: false,
    bottomPanelTab: "problems",
    previewActive: false,
  }),

  actions: {
    initSession(
      storyWorldId: string,
      queryMode?: NarrativeWorkbenchMode,
      sceneId?: string,
      questId?: string,
      panelTab?: BottomPanelTab,
    ): void {
      this.storyWorldId = storyWorldId;
      if (queryMode) this.mode = queryMode;
      if (sceneId !== undefined) this.activeSceneId = sceneId || null;
      if (questId !== undefined) this.activeQuestId = questId || null;
      if (panelTab) {
        this.bottomPanelTab = panelTab;
        this.bottomPanelOpen = true;
      }
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

    setActiveBlockId(blockId: string | null): void {
      this.activeBlockId = blockId;
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

    setBottomPanelOpen(open: boolean): void {
      this.bottomPanelOpen = open;
    },

    setBottomPanelTab(tab: BottomPanelTab): void {
      this.bottomPanelTab = tab;
      this.bottomPanelOpen = true;
    },

    togglePreview(): void {
      this.previewActive = !this.previewActive;
    },

    resetSession(): void {
      this.storyWorldId = "";
      this.mode = "script";
      this.activeArcId = null;
      this.activeChapterId = null;
      this.activeQuestId = null;
      this.activeSceneId = null;
      this.activeBlockId = null;
      this.explorerCollapsed = false;
      this.inspectorCollapsed = false;
      this.inspectorTab = "properties";
      this.bottomPanelOpen = false;
      this.bottomPanelTab = "problems";
      this.previewActive = false;
    },
  },
});
