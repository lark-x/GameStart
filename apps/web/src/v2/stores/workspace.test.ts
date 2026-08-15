import assert from "node:assert/strict";
import test from "node:test";

import { createPinia, setActivePinia } from "pinia";

import { createV2MockAdapter, type V2WorkspaceAdapter } from "../adapters/index.ts";
import { V2AdapterError } from "../adapters/types.ts";
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
  store.previewCanonDraft();

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
  store.previewCanonDraft();

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
  store.assetReviewReason = "Approved for the local asset library.";
  await store.reviewAssetCandidate("approve");

  assert.match(store.assetMessage ?? "", /素材任务已创建/);
  assert.equal(store.snapshot?.assets.job.status, "queued");
  assert.equal(store.snapshot?.assets.job.promptPreview, "Generate a Rain Station background.");
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
