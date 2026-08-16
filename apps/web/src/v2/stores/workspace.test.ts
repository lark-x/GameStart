import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { V2StoryWorldDto } from "@living-network/contracts/v2";
import { createPinia, setActivePinia } from "pinia";

import { createV2MockAdapter, type V2WorkspaceAdapter } from "../adapters/index.ts";
import { V2AdapterError } from "../adapters/types.ts";
import { useNotificationStore } from "./notification.ts";
import { createV2DefaultAdapter, useV2WorkspaceStore } from "./workspace.ts";

test("V2 workspace store loads snapshot through injected adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());

  await store.loadSnapshot();

  assert.equal(store.error, null);
  assert.equal(store.hasSnapshot, true);
  assert.equal(store.snapshot?.world.name, "Gate 0 Demo World");
  assert.equal(store.revisionLabel, "版本 2");
  assert.equal(store.graphIssueCount, 2);
  assert.equal(store.typedStatePreviewCount, 2);
});

test("V2 workspace store exposes adapter failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const adapter: V2WorkspaceAdapter = {
    ...createV2MockAdapter(),
    mode: "mock",
    async getSnapshot() {
      throw new Error("fixture failed");
    },
  };

  store.setAdapter(adapter);
  await store.loadSnapshot();

  assert.equal(store.hasSnapshot, false);
  assert.equal(store.error, "fixture failed");
});

test("V2 workspace store previews canon draft with revision guard", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  store.draftWorldName = "Revised Demo World";
  await store.previewCanonDraft();

  assert.equal(store.conflict, null);
  assert.equal(store.snapshot?.world.name, "Revised Demo World");
  assert.equal(store.snapshot?.world.revision, 3);
  assert.equal(store.expectedRevision, 3);
});

test("V2 workspace store reports stale canon draft revision", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  store.draftWorldName = "Stale Demo World";
  store.expectedRevision = 1;
  await store.previewCanonDraft();

  assert.match(store.conflict ?? "", /Expected revision 1/);
  assert.equal(store.snapshot?.world.name, "Gate 0 Demo World");
  assert.equal(store.snapshot?.world.revision, 2);
});

test("V2 workspace store creates a generation job through the adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  store.generationPrompt = "Create an archive scene candidate.";
  await store.createGenerationJob();

  assert.match(store.generationMessage ?? "", /生成任务已创建/);
  assert.equal(store.snapshot?.generation.job.status, "queued");
  assert.equal(store.snapshot?.generation.job.promptPreview, "Create an archive scene candidate.");
});

test("V2 workspace store applies candidate review result to mock state", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  store.reviewReason = "Approved for mock review.";
  await store.reviewCandidate("approve");

  assert.equal(store.reviewMessage, "候选内容已通过。");
  assert.equal(store.snapshot?.candidate.status, "approved");
  assert.equal(store.snapshot?.candidate.reviewReason, "Approved for mock review.");
  assert.equal(store.canReviewCandidate, false);
});

test("V2 workspace store handles release creation and export", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  await store.createRelease();
  await store.startRun();
  assert.equal(store.playerMessage, "已启动运行预览。");
  store.exportFormat = "markdown";
  await store.exportRelease();

  assert.equal(store.releaseMessage, "发布版本 0.1.0 已锁定。");
  assert.equal(store.snapshot?.releasePackage.immutable, true);
  assert.equal(store.snapshot?.exportBundle.format, "markdown");
  assert.match(store.exportMessage ?? "", /已准备导出文件/);
});

test("V2 workspace store handles player choice save and restore", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  await store.submitChoice("choice_archive");
  store.saveLabel = "Archive checkpoint";
  await store.saveRun();
  await store.restoreSave();

  assert.equal(store.playerMessage, "已恢复“Archive checkpoint”。");
  assert.equal(store.snapshot?.save.label, "Archive checkpoint");
  assert.equal(store.snapshot?.player.sceneId, "scene_opening");
  assert.equal(store.currentSceneTitle, "Opening Scene");
});

test("V2 workspace store creates an asset job and approves the asset candidate", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  store.assetPrompt = "Generate a Rain Station background.";
  await store.createAssetJob();
  assert.match(store.assetMessage ?? "", /素材任务已创建/);
  assert.equal(store.snapshot?.assets.job.status, "queued");
  assert.equal(store.snapshot?.assets.job.promptPreview, "Generate a Rain Station background.");
  store.assetReviewReason = "Approved for the local asset library.";
  await store.reviewAssetCandidate("approve");

  assert.equal(store.assetReviewMessage, "素材候选已通过。");
  assert.equal(store.snapshot?.assets.candidate.status, "approved");
  assert.equal(store.snapshot?.assets.library.length, 2);
  assert.equal(store.assetLibraryCount, 2);
  assert.equal(store.canReviewAssetCandidate, false);
});

test("V2 workspace store covers bootstrap, reset, mock gating, and typed failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  let bootstrapCount = 0;
  const base = createV2MockAdapter();
  store.setAdapter({
    ...base,
    async bootstrapWorkspace() { bootstrapCount += 1; },
  });
  await store.bootstrapWorkspace();
  assert.equal(bootstrapCount, 1);
  assert.equal(store.hasSnapshot, true);
  store.draftWorldName = "";
  store.draftPremise = "";
  store.resetCanonDraft();
  assert.equal(store.hasDraftChanges, false);
  store.setMode("mock");
  store.setMode("http");
  assert.equal(store.mode, "http");

  const errorStore = useV2WorkspaceStore();
  errorStore.setAdapter({
    ...createV2MockAdapter(),
    async bootstrapWorkspace() { throw new Error("bootstrap failed"); },
  });
  await errorStore.bootstrapWorkspace();
  assert.equal(errorStore.error, "bootstrap failed");
});

test("V2 workspace store maps operation errors and no-op guards", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const base = createV2MockAdapter();
  store.setAdapter({
    ...base,
    async getSnapshot() { return base.getSnapshot(); },
    async createSceneGenerationJob() { throw new Error("generation failed"); },
    async reviewCandidate() { throw new Error("review failed"); },
    async createRelease() { throw new Error("release failed"); },
    async submitChoice() { throw new Error("choice failed"); },
    async startRun() { throw new Error("run failed"); },
    async saveRun() { throw new Error("save failed"); },
    async restoreSave() { throw new Error("restore failed"); },
    async exportRelease() { throw new Error("export failed"); },
    async createAssetJob() { throw new Error("asset failed"); },
    async reviewAssetCandidate() { throw new Error("asset review failed"); },
  });
  await store.loadSnapshot();
  await store.createGenerationJob();
  await store.reviewCandidate("approve");
  await store.createRelease();
  await store.submitChoice("choice");
  await store.startRun();
  await store.saveRun();
  await store.restoreSave();
  await store.exportRelease();
  await store.createAssetJob();
  await store.reviewAssetCandidate("approve");
  assert.equal(store.error, "asset review failed");
});

test("V2 workspace store maps adapter-specific and unknown operation failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const base = createV2MockAdapter();
  const adapter: V2WorkspaceAdapter = {
    ...base,
    async getSnapshot() { return base.getSnapshot(); },
    async createSceneGenerationJob() { throw new V2AdapterError({ code: "FAIL", message: "generation" }); },
    async reviewCandidate() { throw "review"; },
    async createRelease() { throw new V2AdapterError({ code: "FAIL", message: "release" }); },
    async submitChoice() { throw "choice"; },
    async startRun() { throw new V2AdapterError({ code: "FAIL", message: "run" }); },
    async saveRun() { throw "save"; },
    async restoreSave() { throw new V2AdapterError({ code: "FAIL", message: "restore" }); },
    async exportRelease() { throw "export"; },
    async createAssetJob() { throw new V2AdapterError({ code: "FAIL", message: "asset" }); },
    async reviewAssetCandidate() { throw "asset review"; },
  };
  store.setAdapter(adapter);
  await store.loadSnapshot();
  await store.createGenerationJob();
  await store.reviewCandidate("approve");
  await store.createRelease();
  await store.startRun();
  await store.submitChoice("choice");
  await store.saveRun();
  await store.restoreSave();
  await store.exportRelease();
  await store.createAssetJob();
  await store.reviewAssetCandidate("approve");
  assert.equal(store.error, "审核素材候选失败");
});

test("V2 default adapter selects HTTP by default and mock only when explicitly enabled", () => {
  assert.equal(createV2DefaultAdapter({}).mode, "http");
  assert.equal(createV2DefaultAdapter({ VITE_V2_ENABLE_MOCK: "true" }, {
    localStorage: { getItem: () => "mock" },
    location: { origin: "http://localhost:4173" },
  }).mode, "mock");
  assert.equal(createV2DefaultAdapter({ VITE_V2_ENABLE_MOCK: "true" }, {
    localStorage: { getItem: () => "http" },
    location: { origin: "http://localhost:4173" },
  }).mode, "http");
});

test("V2 notification store manages toast notifications lifecycle", () => {
  setActivePinia(createPinia());
  const store = useNotificationStore();
  assert.equal(store.notifications.length, 0);

  store.success("Success msg");
  store.error("Error msg");
  store.warning("Warning msg");
  store.info("Info msg");

  assert.equal(store.notifications.length, 4);
  const firstId = store.notifications[0].id;
  store.removeNotification(firstId);
  assert.equal(store.notifications.length, 3);
});

test("V2 workspace store creates a story world and reloads the snapshot", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  let createdInput: { name: string; summary?: string } | undefined;
  let snapshotLoads = 0;
  const adapter: V2WorkspaceAdapter = {
    ...createV2MockAdapter(),
    async createStoryWorld(input) {
      createdInput = input;
      return { storyWorldId: "world:test", name: input.name, revision: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    },
    async getSnapshot() {
      snapshotLoads += 1;
      return createV2MockAdapter().getSnapshot();
    },
  };

  store.setAdapter(adapter);
  await store.createStoryWorld({ name: "新故事", summary: "前提" });

  assert.deepEqual(createdInput, { name: "新故事", summary: "前提" });
  assert.equal(snapshotLoads, 1);
  assert.equal(store.error, null);
  assert.equal(store.creatingStory, false);
});

test("V2 workspace store surfaces story creation failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const adapter: V2WorkspaceAdapter = {
    ...createV2MockAdapter(),
    async createStoryWorld() {
      throw new Error("create failed");
    },
  };

  store.setAdapter(adapter);
  await assert.rejects(() => store.createStoryWorld({ name: "x" }), /create failed/);
  assert.equal(store.error, "create failed");
  assert.equal(store.creatingStory, false);
});

test("V2 workspace store updates graph entities through the adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const updates: unknown[] = [];
  const base = createV2MockAdapter();
  store.setAdapter({
    ...base,
    async updateGraphEntity(input) {
      updates.push(input);
    },
  });
  await store.loadSnapshot();

  await store.updateGraphEntity({
    kind: "scene",
    id: "scene_opening",
    input: { title: "Revised Opening", body: "New body", isEntry: true },
  });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    kind: "scene",
    id: "scene_opening",
    input: { title: "Revised Opening", body: "New body", isEntry: true },
    storyWorldId: "world_v2_demo",
    expectedRevision: 2,
  });
});

test("V2 workspace store switches worlds and reloads the selected snapshot", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const worlds: readonly V2StoryWorldDto[] = [
    { storyWorldId: "world:one", name: "One", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    { storyWorldId: "world:two", name: "Two", revision: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];
  let requested: string | undefined;
  const base = createV2MockAdapter();
  store.setAdapter({
    ...base,
    async listStoryWorlds() {
      return worlds;
    },
    async getSnapshot(storyWorldId) {
      requested = storyWorldId;
      const snapshot = await base.getSnapshot();
      return {
        ...snapshot,
        world: {
          ...snapshot.world,
          storyWorldId: storyWorldId ?? "world:one",
          name: storyWorldId === "world:two" ? "Two" : "One",
          revision: storyWorldId === "world:two" ? 2 : 1,
        },
      };
    },
  });

  await store.loadSnapshot();
  assert.equal(store.snapshot?.world.storyWorldId, "world:one");

  await store.selectStoryWorld("world:two");
  assert.equal(requested, "world:two");
  assert.equal(store.snapshot?.world.name, "Two");
  assert.equal(store.snapshot?.world.revision, 2);
});

test("V2 workspace store stops generation polling after five minutes", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    setActivePinia(createPinia());
    const store = useV2WorkspaceStore();
    const base = createV2MockAdapter();
    store.setAdapter({
      ...base,
      async createSceneGenerationJob() {
        return { job: { jobId: "job_poll", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } };
      },
      async getSceneGenerationJob() {
        return { jobId: "job_poll", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
      },
    });
    await store.loadSnapshot();
    await store.createGenerationJob();
    assert.match(store.generationMessage ?? "", /生成任务已创建/);

    await mock.timers.tick(5 * 60 * 1000 + 100);
    assert.match(store.generationMessage ?? "", /轮询已暂停/);
  } finally {
    mock.timers.reset();
  }
});

test("V2 workspace store reports an empty workspace explicitly", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter({
    ...createV2MockAdapter(),
    async listStoryWorlds() {
      return [];
    },
  });

  await store.loadSnapshot();

  assert.equal(store.hasSnapshot, false);
  assert.equal(store.snapshot, null);
});

test("V2 workspace store reports non-stale canon save failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter({
    ...createV2MockAdapter(),
    async updateStoryWorld() {
      throw new Error("save failed");
    },
  });
  await store.loadSnapshot();

  await store.previewCanonDraft();

  assert.equal(store.error, "save failed");
});

test("V2 workspace store reports canon and graph entity operation failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter({
    ...createV2MockAdapter(),
    async createCanonEntity() {
      throw new Error("create canon failed");
    },
    async updateCanonEntity() {
      throw new Error("update canon failed");
    },
    async createGraphEntity() {
      throw new Error("create graph failed");
    },
    async updateGraphEntity() {
      throw new Error("update graph failed");
    },
  });
  await store.loadSnapshot();

  await store.createCanonEntity({ kind: "fact", input: { text: "x", visibility: "creator_only" } });
  assert.equal(store.error, "create canon failed");

  await store.updateCanonEntity({ kind: "fact", id: "fact_clock", input: { text: "y", visibility: "player_visible" } });
  assert.equal(store.error, "update canon failed");

  await store.createGraphEntity({ kind: "arc", input: { title: "A" } });
  assert.equal(store.error, "create graph failed");

  await store.updateGraphEntity({ kind: "arc", id: "arc_main", input: { title: "B" } });
  assert.equal(store.error, "update graph failed");
});

test("V2 workspace store persists canon and graph entities through mock adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());
  await store.loadSnapshot();

  await store.createCanonEntity({ kind: "fact", input: { text: "New fact", visibility: "creator_only" } });
  assert.equal(store.error, null);

  await store.createGraphEntity({ kind: "arc", input: { title: "New Arc" } });
  assert.equal(store.error, null);

  await store.updateCanonEntity({ kind: "fact", id: "fact_clock", input: { text: "Updated fact", visibility: "player_visible" } });
  assert.equal(store.error, null);

  await store.updateGraphEntity({ kind: "arc", id: "arc_main", input: { title: "Updated Arc" } });
  assert.equal(store.error, null);
});

test("V2 workspace store continues generation polling while queued", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    setActivePinia(createPinia());
    const store = useV2WorkspaceStore();
    let reads = 0;
    store.setAdapter({
      ...createV2MockAdapter(),
      async createSceneGenerationJob() {
        return { job: { jobId: "job_continue", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } };
      },
      async getSceneGenerationJob() {
        reads += 1;
        return { jobId: "job_continue", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
      },
    });
    await store.loadSnapshot();
    await store.createGenerationJob();
    await mock.timers.tick(2000);
    assert.ok(reads >= 1);
    assert.match(store.generationMessage ?? "", /生成任务已创建/);
  } finally {
    mock.timers.reset();
  }
});

test("V2 workspace store stops asset polling after five minutes and continues while queued", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    setActivePinia(createPinia());
    const store = useV2WorkspaceStore();
    let reads = 0;
    store.setAdapter({
      ...createV2MockAdapter(),
      async createAssetJob() {
        return { ...(await createV2MockAdapter().createAssetJob("x")), jobId: "asset_continue", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
      },
      async getAssetGenerationJob() {
        reads += 1;
        return { jobId: "asset_continue", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
      },
    });
    await store.loadSnapshot();
    await store.createAssetJob();
    await mock.timers.tick(2000);
    assert.ok(reads >= 1);
    assert.match(store.assetMessage ?? "", /素材任务已创建/);

    await mock.timers.tick(5 * 60 * 1000 + 100);
    assert.match(store.assetMessage ?? "", /轮询已暂停/);
  } finally {
    mock.timers.reset();
  }
});

test("V2 workspace store handles generation and asset polling failures", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    setActivePinia(createPinia());
    const store = useV2WorkspaceStore();
    const base = createV2MockAdapter();
    store.setAdapter({
      ...base,
      async createSceneGenerationJob() {
        return { job: { jobId: "job_fail", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } };
      },
      async getSceneGenerationJob() {
        throw new Error("generation read failed");
      },
      async createAssetJob() {
        const job = await base.createAssetJob("x");
        return { ...job, jobId: "asset_fail", status: "queued", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
      },
      async getAssetGenerationJob() {
        throw new Error("asset read failed");
      },
    });
    await store.loadSnapshot();
    await store.createGenerationJob();
    await mock.timers.tick(2000);
    assert.equal(store.error, "generation read failed");

    store.error = null;
    await store.createAssetJob();
    await mock.timers.tick(2000);
    assert.equal(store.error, "asset read failed");
  } finally {
    mock.timers.reset();
  }
});
