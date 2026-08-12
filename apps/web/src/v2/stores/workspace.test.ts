import assert from "node:assert/strict";
import test from "node:test";

import { createPinia, setActivePinia } from "pinia";

import { createV2MockAdapter, type V2WorkspaceAdapter } from "../adapters/index.ts";
import { useV2WorkspaceStore } from "./workspace.ts";

test("V2 workspace store loads snapshot through injected adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());

  await store.loadSnapshot();

  assert.equal(store.error, null);
  assert.equal(store.hasSnapshot, true);
  assert.equal(store.snapshot?.world.name, "Gate 0 Demo World");
  assert.equal(store.revisionLabel, "Revision 2");
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

  assert.match(store.generationMessage ?? "", /Generation job/);
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

  assert.equal(store.reviewMessage, "Candidate marked approved.");
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
  store.exportFormat = "markdown";
  await store.exportRelease();

  assert.equal(store.releaseMessage, "Release 0.1.0 is immutable.");
  assert.equal(store.snapshot?.releasePackage.immutable, true);
  assert.equal(store.snapshot?.exportBundle.format, "markdown");
  assert.match(store.exportMessage ?? "", /Prepared/);
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

  assert.equal(store.playerMessage, "Restored Archive checkpoint.");
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

  assert.match(store.assetMessage ?? "", /Asset job/);
  assert.equal(store.snapshot?.assets.job.status, "queued");
  assert.equal(store.snapshot?.assets.job.promptPreview, "Generate a Rain Station background.");
  assert.equal(store.assetReviewMessage, "Asset candidate marked approved.");
  assert.equal(store.snapshot?.assets.candidate.status, "approved");
  assert.equal(store.snapshot?.assets.library.length, 2);
  assert.equal(store.assetLibraryCount, 2);
  assert.equal(store.canReviewAssetCandidate, false);
});
