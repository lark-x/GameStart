import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { useNarrativeSessionStore } from "./useNarrativeSessionStore.ts";
import { useNarrativeRouteSync } from "../composables/useNarrativeRouteSync.ts";

test("useNarrativeSessionStore initializes and mutates UI session state", () => {
  setActivePinia(createPinia());
  const store = useNarrativeSessionStore();

  assert.equal(store.mode, "script");
  assert.equal(store.activeSceneId, null);
  assert.equal(store.bottomPanelOpen, false);

  store.initSession("world-teyyvat", "outline", "scene-101", "quest-2", "problems");
  assert.equal(store.storyWorldId, "world-teyyvat");
  assert.equal(store.mode, "outline");
  assert.equal(store.activeSceneId, "scene-101");
  assert.equal(store.activeQuestId, "quest-2");
  assert.equal(store.bottomPanelOpen, true);
  assert.equal(store.bottomPanelTab, "problems");

  // Selecting a scene in outline mode automatically switches to script mode
  store.selectScene("scene-102");
  assert.equal(store.activeSceneId, "scene-102");
  assert.equal(store.mode, "script");

  // Toggling layout panels
  store.toggleExplorer();
  assert.equal(store.explorerCollapsed, true);
  store.toggleInspector();
  assert.equal(store.inspectorCollapsed, true);

  store.toggleBottomPanel("search");
  assert.equal(store.bottomPanelTab, "search");
  assert.equal(store.bottomPanelOpen, true);

  // Toggling same tab closes drawer
  store.toggleBottomPanel("search");
  assert.equal(store.bottomPanelOpen, false);

  // Reset
  store.resetSession();
  assert.equal(store.mode, "script");
  assert.equal(store.activeSceneId, null);
  assert.equal(store.explorerCollapsed, false);
});

test("useNarrativeRouteSync syncs route queries with sessionStore", async () => {
  setActivePinia(createPinia());
  const sessionStore = useNarrativeSessionStore();

  const mockRoute = reactive({
    params: { storyWorldId: "world-abc" },
    query: { mode: "review", scene: "scene-5", quest: "quest-1", panel: "candidates" },
  });

  const mockRouter = {
    replace: async (_opt: { query: Record<string, string | undefined> }) => Promise.resolve(),
  };

  const sync = useNarrativeRouteSync(
    mockRoute as unknown as RouteLocationNormalizedLoaded,
    mockRouter as unknown as Router,
  );
  sync.syncFromRoute();

  assert.equal(sessionStore.storyWorldId, "world-abc");
  assert.equal(sessionStore.mode, "review");
  assert.equal(sessionStore.activeSceneId, "scene-5");
  assert.equal(sessionStore.activeQuestId, "quest-1");
  assert.equal(sessionStore.bottomPanelOpen, true);
  assert.equal(sessionStore.bottomPanelTab, "candidates");
});
