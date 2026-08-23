import { ref, watch } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { useNarrativeSessionStore, type BottomPanelTab } from "../stores/useNarrativeSessionStore.ts";
import type { NarrativeWorkbenchMode } from "../components/topbar/NarrativeModeTabs.vue";

export function useNarrativeRouteSync(route: RouteLocationNormalizedLoaded, router: Router) {
  const sessionStore = useNarrativeSessionStore();
  const isSyncingFromRoute = ref(false);

  // Initialize from route on mount
  const syncFromRoute = () => {
    isSyncingFromRoute.value = true;
    try {
      const mode = (route.query.mode as NarrativeWorkbenchMode) || "script";
      const sceneId = (route.query.scene as string) || undefined;
      const questId = (route.query.quest as string) || undefined;
      const panelTab = (route.query.panel as BottomPanelTab) || undefined;
      const storyWorldId = (route.params.storyWorldId as string) || "default";

      sessionStore.initSession(storyWorldId, mode, sceneId, questId, panelTab);
    } finally {
      isSyncingFromRoute.value = false;
    }
  };

  // Watch URL query changes (e.g. browser back/forward or external navigation)
  watch(
    () => route.query,
    (query) => {
      isSyncingFromRoute.value = true;
      try {
        if (query.mode && query.mode !== sessionStore.mode) {
          sessionStore.setMode(query.mode as NarrativeWorkbenchMode);
        }
        const targetScene = (query.scene as string) || null;
        if (targetScene !== sessionStore.activeSceneId) {
          sessionStore.selectScene(targetScene);
        }
        const targetQuest = (query.quest as string) || null;
        if (targetQuest !== sessionStore.activeQuestId) {
          sessionStore.selectQuest(targetQuest);
        }
        const targetPanel = (query.panel as BottomPanelTab) || null;
        if (targetPanel) {
          sessionStore.setBottomPanelTab(targetPanel);
        } else if (sessionStore.bottomPanelOpen && !query.panel) {
          sessionStore.setBottomPanelOpen(false);
        }
      } finally {
        isSyncingFromRoute.value = false;
      }
    },
    { deep: true },
  );

  // Watch Session Store mutations -> push back to Router
  watch(
    () => [
      sessionStore.mode,
      sessionStore.activeSceneId,
      sessionStore.activeQuestId,
      sessionStore.bottomPanelOpen,
      sessionStore.bottomPanelTab,
    ],
    () => {
      if (isSyncingFromRoute.value) return;

      const nextQuery: Record<string, string | undefined> = {
        ...route.query,
        mode: sessionStore.mode,
        scene: sessionStore.activeSceneId || undefined,
        quest: sessionStore.activeQuestId || undefined,
        panel: sessionStore.bottomPanelOpen ? sessionStore.bottomPanelTab : undefined,
      };

      // Clean undefined keys
      for (const k of Object.keys(nextQuery)) {
        if (nextQuery[k] === undefined) {
          delete nextQuery[k];
        }
      }

      // Check if actually changed before calling router.replace
      const currentKeys = Object.keys(route.query);
      const nextKeys = Object.keys(nextQuery);
      let changed = currentKeys.length !== nextKeys.length;
      if (!changed) {
        for (const k of nextKeys) {
          if (route.query[k] !== nextQuery[k]) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        void router.replace({ query: nextQuery });
      }
    },
  );

  return {
    syncFromRoute,
  };
}
