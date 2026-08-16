import assert from "node:assert/strict";
import test from "node:test";

import { createV2HttpAdapter, v2MediaRefToUrl } from "./http.ts";
import { createV2MockAdapter } from "./mock.ts";
import { V2AdapterError } from "./types.ts";

function installLocalStorageFixture(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> };
  };
  const previousWindow = globalWithWindow.window;
  globalWithWindow.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => { values.delete(key); },
    },
  };
  return {
    values,
    restore: () => {
      if (previousWindow === undefined) delete globalWithWindow.window;
      else globalWithWindow.window = previousWindow;
    },
  };
}

test("V2 mock adapter returns typed Gate 0 snapshot data", async () => {
  const snapshot = await createV2MockAdapter().getSnapshot();

  assert.equal(snapshot.health.version, "v2");
  assert.equal(snapshot.world.storyWorldId, "world_v2_demo");
  assert.equal(snapshot.sceneGraph.scenes[0]?.sceneId, "scene_opening");
  assert.equal(snapshot.world.characters.length, 2);
  assert.equal(snapshot.sceneGraph.diagnostics.length, 2);
  assert.equal(snapshot.typedState.preview.length, 2);
  assert.equal(snapshot.generation.job.status, "succeeded");
  assert.equal(snapshot.generation.context.sources.length, 4);
  assert.equal(snapshot.candidate.kind, "scene");
  assert.equal(snapshot.release.valid, true);
  assert.equal(snapshot.run.releaseVersion, "0.1.0");
  assert.equal(snapshot.assets.workflowName, "scene-background-v1");
  assert.equal(snapshot.assets.candidate.status, "pending");
  assert.equal(snapshot.assets.library.length, 1);
});

test("V2 mock adapter reviews a candidate without writing canon rules", async () => {
  const result = await createV2MockAdapter().reviewCandidate({
    candidateId: "candidate_scene_opening",
    action: "request_changes",
    reviewer: "local-creator",
    reason: "Needs a clearer gate.",
  });

  assert.equal(result.status, "changes_requested");
  assert.equal(result.reviewReason, "Needs a clearer gate.");
});

test("V2 mock adapter supports release, runtime, save, restore, and export", async () => {
  const adapter = createV2MockAdapter();
  const started = await adapter.startRun();
  const releasePackage = await adapter.createRelease();
  const player = await adapter.submitChoice("choice_archive");
  const save = await adapter.saveRun("Archive save");
  const restored = await adapter.restoreSave(save.saveId);
  const exportBundle = await adapter.exportRelease("markdown");
  const jsonBundle = await adapter.exportRelease("json");

  assert.equal(releasePackage.immutable, true);
  assert.equal(started.run.runId, "run_demo");
  assert.equal(player.sceneId, "scene_archive");
  assert.equal(save.label, "Archive save");
  assert.equal(restored.sceneId, "scene_opening");
  assert.equal(exportBundle.format, "markdown");
  assert.equal(jsonBundle.format, "json");
});

test("V2 mock adapter supports asset jobs and asset candidate review", async () => {
  const adapter = createV2MockAdapter();
  const job = await adapter.createAssetJob("Generate a station background.");
  const result = await adapter.reviewAssetCandidate({
    candidateId: "asset_candidate_station_bg",
    action: "approve",
    reviewer: "local-creator",
    reason: "Ready for asset library.",
  });

  assert.equal(job.status, "queued");
  assert.equal(job.promptPreview, "Generate a station background.");
  assert.equal(result.status, "approved");
  assert.equal(result.reviewReason, "Ready for asset library.");
  assert.equal(result.approvedAsset?.approved, true);
  assert.equal(result.approvedAsset?.kind, "scene_background");
});

test("V2 http adapter maps error envelopes", async () => {
  const adapter = createV2HttpAdapter({
    baseUrl: "http://127.0.0.1:3001",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "V2 unavailable",
            correlationId: "corr_v2",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
  });

  await assert.rejects(() => adapter.getSnapshot(), (err) => {
    assert.ok(err instanceof V2AdapterError);
    assert.equal(err.code, "SERVICE_UNAVAILABLE");
    assert.equal(err.correlationId, "corr_v2");
    return true;
  });
});

test("V2 http adapter reports an empty workspace explicitly", async () => {
  const adapter = createV2HttpAdapter({
    baseUrl: "http://localhost",
    fetchImpl: async (input) => String(input).endsWith("/health")
      ? Response.json({ ok: true, version: "v2" })
      : Response.json([]),
  });
  await assert.rejects(() => adapter.getSnapshot(), (error) => error instanceof V2AdapterError && error.code === "NOT_FOUND");
});

test("V2 media ref mapper only exposes controlled local asset paths", () => {
  const hash = "a".repeat(64);
  assert.equal(
    v2MediaRefToUrl(`media://local/v2/assets/${hash}.png`, "http://localhost/"),
    `http://localhost/api/v2/media/assets/${hash}.png`,
  );
  assert.equal(v2MediaRefToUrl("media://local/v1/assets/file.png", "http://localhost"), undefined);
  assert.equal(v2MediaRefToUrl(`media://local/v2/assets/${"A".repeat(64)}.PNG`, "http://localhost"), `http://localhost/api/v2/media/assets/${"A".repeat(64)}.PNG`);
});

test("V2 HTTP adapter drives bootstrap and the complete local creator loop", async () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const world = {
    storyWorldId: "world_http",
    name: "HTTP World",
    summary: "HTTP premise",
    revision: 2,
  };
  const runtime = {
    run: { runId: "run_http", releaseId: "release_http", releaseVersion: "1.0.0", currentSceneId: "scene_next", stateValues: {}, choiceHistory: [] },
    scene: { sceneId: "scene_next", title: "Next", isEntry: false },
    availableChoices: [{ choiceId: "choice_loop", label: "Stay" }],
  };
  const responseFor = (url: string, method: string, body: unknown): Response => {
    if (method === "POST" && url.endsWith("/worlds")) return Response.json({ storyWorldId: "world_http", revision: 1 });
    if (method === "POST" && url.includes("/core/worlds/world%3A") && url.endsWith("/scenes")) return Response.json({ revision: 2 });
    if (url.endsWith("/health")) return Response.json({ ok: true, version: "v2" });
    if (url.endsWith("/core/worlds")) return Response.json([world]);
    if (url.endsWith("/canon")) return Response.json({
      storyWorldId: "world_http", revision: 2, world: world, locations: [], characters: [], facts: [], rules: [], timelineEvents: [],
    });
    if (url.endsWith("/graph")) return Response.json({ arcs: [], scenes: [{ sceneId: "scene_opening", title: "Opening", isEntry: true }], choices: [] });
    if (url.endsWith("/graph/validation")) return Response.json({ valid: true, diagnostics: [] });
    if (url.endsWith("/state/variables")) return Response.json([]);
    if (url.endsWith("/state/initial")) return Response.json({ values: {} });
    if (url.endsWith("/candidates/scenes")) return Response.json([]);
    if (url.includes("/generation/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [{
      jobId: "job_scene_persisted", storyWorldId: "world_http", kind: "scene", status: "failed",
      idempotencyKey: "scene-persisted", baseCanonRevision: 2, contextHash: "context-persisted",
      context: { storyWorldId: "world_http", baseCanonRevision: 2, requestedAt: "2026-01-01", prompt: "persisted prompt", promptPreview: "persisted prompt", tokenBudget: 512, contextHash: "context-persisted", sourceFactIds: [], sourceCharacterIds: [], sourceSceneIds: [], facts: [], characters: [], scenes: [] },
      prompt: "persisted prompt", attempts: 1, maxAttempts: 1, createdAt: "2026-01-01", updatedAt: "2026-01-02", failureReason: "provider unavailable",
    }] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [{
      jobId: "asset_job_persisted", storyWorldId: "world_http", status: "succeeded", idempotencyKey: "asset-persisted",
      prompt: "persisted asset", workflowVersion: "workflow-v1", workflow: {}, seed: 7, attempts: 0, maxAttempts: 3,
      createdAt: "2026-01-01", updatedAt: "2026-01-02", candidateId: "asset_candidate_persisted",
    }] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/candidates")) return Response.json({ candidates: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/library")) return Response.json({ assets: [] });
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: true, diagnostics: [], blockers: [] });
    if (method === "POST" && url.endsWith("/releases")) return Response.json({ releaseId: "release_http", version: "1.0.0", sourceRevision: 2, contentHash: "hash", createdAt: "2026-01-01" });
    if (url.endsWith("/releases")) return Response.json([{ releaseId: "release_http", storyWorldId: "world_http", version: "1.0.0", sourceRevision: 2, contentHash: "hash", createdAt: "2026-01-01" }]);
    if (url.endsWith("/runtime/saves")) return Response.json([{ saveId: "save_http", runId: "run_http", releaseId: "release_http", releaseVersion: "1.0.0", currentSceneId: "scene_next", label: "Checkpoint", stateValues: {}, choiceHistory: [], createdAt: "2026-01-01" }]);
    if (method === "POST" && url.endsWith("/generation/jobs/scene")) return Response.json({ job: { jobId: "job_scene", status: "queued", createdAt: "2026-01-01", updatedAt: "2026-01-01", prompt: "prompt", contextHash: "hash", attempts: 0, maxAttempts: 3 } });
    if (method === "POST" && url.includes("/candidates/scenes/") && url.endsWith("/review")) return Response.json({ revision: 3, candidate: { status: "approved", reviewedAt: "2026-01-01", reviewReason: "ok" } });
    if (method === "POST" && url.endsWith("/runtime/runs")) return Response.json(runtime);
    if (method === "GET" && url.includes("/runtime/runs/") && url.endsWith("/scene")) return Response.json(runtime);
    if (method === "POST" && url.includes("/choices")) return Response.json(runtime);
    if (method === "POST" && url.includes("/saves") && !url.includes("/load")) return Response.json({ saveId: "save_http", runId: "run_http", releaseVersion: "1.0.0", currentSceneId: "scene_next", createdAt: "2026-01-01" });
    if (method === "POST" && url.includes("/load")) return Response.json(runtime);
    if (url.includes("/core/releases/") && url.endsWith("/export")) return Response.json({ json: { releaseId: "release_http" }, markdown: "# HTTP World" });
    if (method === "POST" && url.endsWith("/generation/assets/jobs")) return Response.json({ job: { jobId: "asset_job", status: "queued", createdAt: "2026-01-01", updatedAt: "2026-01-01", workflowVersion: "local-default@1", seed: 0, prompt: "asset" } });
    if (method === "POST" && url.includes("/generation/assets/candidates/") && url.endsWith("/review")) return Response.json({
      candidate: { status: "approved" },
      review: { reviewedAt: "2026-01-01", reason: "ready" },
      approvedAsset: {
        assetId: "asset_http",
        storyWorldId: "world_http",
        sourceType: "candidate",
        candidateId: "candidate_http",
        title: "HTTP Asset",
        mediaRef: `media://local/v2/assets/${"a".repeat(64)}.png`,
        contentHash: `sha256:${"a".repeat(64)}`,
        approvedAt: "2026-01-01",
      },
    });
    if (url.includes("/runtime/saves/") && method === "GET") return Response.json({ saveId: "save_http", runId: "run_http", releaseVersion: "1.0.0", currentSceneId: "scene_next", createdAt: "2026-01-01" });
    throw new Error(`unhandled ${method} ${url} ${JSON.stringify(body)}`);
  };
  const adapter = createV2HttpAdapter({
    baseUrl: "http://localhost/",
    fetchImpl: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      calls.push({ url, method, ...(body === undefined ? {} : { body }) });
      return responseFor(url, method, body);
    },
  });
  await adapter.bootstrapWorkspace();
  const snapshot = await adapter.getSnapshot();
  assert.equal(snapshot.world.storyWorldId, "world_http");
  assert.equal(snapshot.generation.job?.jobId, "job_scene_persisted");
  assert.equal(snapshot.generation.job?.status, "failed");
  assert.equal(snapshot.generation.job?.terminalMessage, "provider unavailable");
  assert.equal(snapshot.assets.job?.jobId, "asset_job_persisted");
  assert.equal(snapshot.assets.job?.status, "succeeded");
  assert.equal(snapshot.assets.prompt, "persisted asset");
  const job = await adapter.createSceneGenerationJob({ storyWorldId: "world_http", baseCanonRevision: 2, prompt: "prompt", idempotencyKey: "scene-idem" });
  assert.equal(job.job.jobId, "job_scene");
  assert.equal((await adapter.reviewCandidate({ candidateId: "candidate", action: "approve", reviewer: "creator", reason: "ok" })).status, "approved");
  const reviewBody = calls.find((call) => call.url.endsWith("/candidates/scenes/candidate/review"))?.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(reviewBody).sort(), ["action", "expectedRevision", "idempotencyKey", "reason", "reviewer"]);
  assert.equal(reviewBody.action, "approve");
  assert.equal(reviewBody.expectedRevision, 2);
  assert.equal((await adapter.createRelease()).version, "1.0.0");
  assert.equal((await adapter.startRun()).run.runId, "run_http");
  assert.equal((await adapter.submitChoice("choice")).sceneId, "scene_next");
  assert.equal((await adapter.saveRun("Checkpoint")).saveId, "save_http");
  const saveBody = calls.find((call) => call.url.endsWith("/runtime/runs/run_http/saves"))?.body as Record<string, unknown>;
  assert.equal(saveBody.label, "Checkpoint");
  const afterSave = await adapter.getSnapshot();
  assert.equal(afterSave.save?.saveId, "save_http");
  assert.equal(afterSave.save?.label, "Checkpoint");
  assert.equal((await adapter.restoreSave("save_http")).sceneId, "scene_next");
  assert.equal((await adapter.exportRelease("markdown")).format, "markdown");
  const createdAssetJob = await adapter.createAssetJob("asset");
  assert.equal(createdAssetJob.jobId, "asset_job");
  assert.equal(createdAssetJob.readableStatus, "queued");
  assert.equal((await adapter.reviewAssetCandidate({ candidateId: "asset_candidate", action: "approve", reviewer: "creator", reason: "ready" })).status, "approved");
  assert.ok(calls.some((call) => call.url.includes("/api/v2/core/worlds/world%3A")));
});

test("V2 HTTP adapter restores runtime session ids after browser refresh", async () => {
  const storage = installLocalStorageFixture({
    "living-network-v2-runtime:world": JSON.stringify({
      releaseId: "release",
      releaseVersion: "1.0.0",
      runId: "run",
      saveId: "save",
      saveLabel: "Browser checkpoint",
    }),
  });
  try {
    const runtime = {
      run: { runId: "run", releaseId: "release", releaseVersion: "1.0.0", currentSceneId: "scene", stateValues: {}, choiceHistory: ["choice"] },
      scene: { sceneId: "scene", title: "Restored Scene", body: "Restored body", isEntry: true },
      availableChoices: [],
    };
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/health")) return Response.json({ ok: true, version: "v2" });
      if (url.endsWith("/core/worlds")) return Response.json([{ storyWorldId: "world", name: "World", revision: 1 }]);
      if (url.endsWith("/canon")) return Response.json({ storyWorldId: "world", revision: 1, world: { storyWorldId: "world", name: "World", revision: 1 }, locations: [], characters: [], facts: [], rules: [], timelineEvents: [] });
      if (url.endsWith("/graph")) return Response.json({ arcs: [], scenes: [{ sceneId: "scene", title: "Restored Scene", isEntry: true }], choices: [] });
      if (url.endsWith("/graph/validation")) return Response.json({ valid: true, diagnostics: [] });
      if (url.endsWith("/state/variables")) return Response.json([]);
      if (url.endsWith("/state/initial")) return Response.json({ values: {} });
      if (url.endsWith("/candidates/scenes")) return Response.json([]);
      if (url.includes("/generation/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
      if (url.includes("/generation/assets/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
      if (url.includes("/generation/assets/worlds/") && url.endsWith("/candidates")) return Response.json({ candidates: [] });
      if (url.includes("/generation/assets/worlds/") && url.endsWith("/library")) return Response.json({ assets: [] });
      if (url.endsWith("/releases/preflight")) return Response.json({ valid: true, diagnostics: [], blockers: [] });
      if (url.endsWith("/releases")) return Response.json([{ releaseId: "release", storyWorldId: "world", version: "1.0.0", sourceRevision: 1, contentHash: "hash", createdAt: "2026-01-01" }]);
      if (url.endsWith("/runtime/saves")) return Response.json([{ saveId: "save", runId: "run", releaseId: "release", releaseVersion: "1.0.0", currentSceneId: "scene", label: "Server checkpoint", stateValues: {}, choiceHistory: ["choice"], createdAt: "2026-01-01" }]);
      if (url.includes("/runtime/runs/run/scene")) return Response.json(runtime);
      if (url.includes("/runtime/saves/save")) return Response.json({ saveId: "save", runId: "run", releaseVersion: "1.0.0", currentSceneId: "scene", createdAt: "2026-01-01" });
      throw new Error(`unhandled ${url}`);
    };

    const snapshot = await createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl }).getSnapshot("world");
    assert.equal(snapshot.releasePackage?.releaseId, "release");
    assert.equal(snapshot.run?.runId, "run");
    assert.equal(snapshot.save?.saveId, "save");
    assert.equal(snapshot.save?.label, "Server checkpoint");
    assert.equal(snapshot.player?.title, "Restored Scene");
  } finally {
    storage.restore();
  }
});

test("V2 HTTP adapter requires the correct operation order", async () => {
  const adapter = createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl: async () => Response.json([]) });
  await assert.rejects(() => adapter.reviewCandidate({ candidateId: "candidate", action: "approve", reviewer: "creator", reason: "ok" }), /Load a workspace/);
  await assert.rejects(() => adapter.createRelease(), /Load a workspace/);
  await assert.rejects(() => adapter.startRun(), /Create or load a release/);
  await assert.rejects(() => adapter.submitChoice("choice"), /Start a run/);
  await assert.rejects(() => adapter.saveRun("save"), /Start a run/);
  await assert.rejects(() => adapter.exportRelease("json"), /Create or load a release/);
  await assert.rejects(() => adapter.createAssetJob("asset"), /Load a workspace/);
});

test("V2 HTTP adapter maps optional snapshot values and player choices", async () => {
  const runtime = {
    run: { runId: "run", releaseId: "release", releaseVersion: "1.0.0", currentSceneId: "scene", stateValues: {}, choiceHistory: ["old"] },
    scene: { sceneId: "scene", title: "Scene", isEntry: true },
    availableChoices: [{ choiceId: "choice", label: "Continue" }],
  };
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/health")) return Response.json({ ok: true, version: "v2" });
    if (url.endsWith("/core/worlds")) return Response.json([{ storyWorldId: "world", name: "World", revision: 1 }]);
    if (url.endsWith("/canon")) return Response.json({ storyWorldId: "world", revision: 1, world: { storyWorldId: "world", name: "World", revision: 1 }, locations: [{ locationId: "loc", name: "Location" }], characters: [{ characterId: "char", name: "Character" }], facts: [{ factId: "fact", text: "Fact", visibility: "creator_only" }], rules: [{ ruleId: "rule", text: "Rule", severity: "guideline" }], timelineEvents: [] });
    if (url.endsWith("/graph")) return Response.json({ arcs: [], scenes: [{ sceneId: "scene", title: "Scene", isEntry: true }], choices: [{ choiceId: "choice", sourceSceneId: "scene", label: "Continue" }] });
    if (url.endsWith("/graph/validation")) return Response.json({ valid: false, diagnostics: [{ code: "WARN", severity: "warning", message: "Warning", sceneId: "scene" }] });
    if (url.endsWith("/state/variables")) return Response.json([{ key: "Flag", valueType: "boolean", defaultValue: false }, { key: "Count", valueType: "number", defaultValue: 0 }, { key: "Name", valueType: "string", defaultValue: "" }]);
    if (url.endsWith("/state/initial")) return Response.json({ values: { Flag: false, Count: 0, Name: "" } });
    if (url.endsWith("/candidates/scenes")) return Response.json([{ candidateId: "candidate", kind: "scene", status: "changes_requested", storyWorldId: "world", baseCanonRevision: 1, payload: { scene: { sceneId: "candidate_scene", title: "Candidate", body: "Body", participantCharacterIds: [] }, choices: [{ label: "Choice" }], validationNotes: ["note"] }, provenance: { source: "llm", contextHash: "context" } }]);
    if (url.includes("/generation/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [{
      jobId: "job_scene_done",
      storyWorldId: "world",
      kind: "scene",
      status: "succeeded",
      idempotencyKey: "job-scene-done",
      baseCanonRevision: 1,
      contextHash: "context",
      context: { storyWorldId: "world", baseCanonRevision: 1, requestedAt: "2026-01-01", prompt: "Generate scene", promptPreview: "Generate scene", tokenBudget: 512, contextHash: "context", sourceFactIds: [], sourceCharacterIds: [], sourceSceneIds: [], facts: [], characters: [], scenes: [] },
      prompt: "Generate scene",
      attempts: 1,
      maxAttempts: 3,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      candidateId: "candidate",
    }] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/candidates")) return Response.json({ candidates: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/library")) return Response.json({ assets: [] });
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: false, diagnostics: [{ code: "BAD", severity: "error", message: "Bad release" }], blockers: [{ code: "BAD", message: "Bad release", targetPage: "story" }] });
    if (url.endsWith("/releases")) return Response.json([]);
    if (url.endsWith("/runtime/saves")) return Response.json([]);
    if (url.includes("/runtime/runs/") && url.endsWith("/scene")) return Response.json(runtime);
    if (url.includes("/runtime/saves/") && url.endsWith("/save")) return Response.json({ saveId: "save", runId: "run", releaseVersion: "1.0.0", currentSceneId: "scene", createdAt: "2026-01-01" });
    return Response.json({}, { status: 404 });
  };
  const snapshot = await createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl }).getSnapshot();
  assert.equal(snapshot.world.facts[0]?.visibility, "creator");
  assert.equal(snapshot.world.rules[0]?.severity, "soft");
  assert.equal(snapshot.world.timelineEvents.length, 0);
  assert.equal(snapshot.sceneGraph.arcs.length, 0);
  assert.equal(snapshot.sceneGraph.choices[0]?.gates.length, 0);
  assert.equal(snapshot.sceneGraph.choices[0]?.consequences.length, 0);
  assert.equal(snapshot.sceneGraph.diagnostics[0]?.severity, "warning");
  assert.equal(snapshot.typedState.variables[0]?.type, "flag");
  assert.equal(snapshot.typedState.variables[0]?.defaultValue, false);
  assert.equal(snapshot.candidate?.status, "changes_requested");
  assert.equal(snapshot.generation.job?.readableStatus, "candidate-ready");
  assert.equal(snapshot.generation.job?.candidateId, "candidate");
  assert.equal(snapshot.generation.diff.title, "Candidate");
  const adapter = createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl: async (input) => {
    const url = String(input);
    return url.includes("/runtime/runs/") ? Response.json(runtime) : fetchImpl(input);
  } });
  const run = await adapter.startRun().catch((error: unknown) => error);
  assert.ok(run instanceof V2AdapterError);
});

test("V2 mock adapter persists canon and graph authoring edits", async () => {
  const adapter = createV2MockAdapter();

  await adapter.createCanonEntity({ kind: "location", storyWorldId: "world_v2_demo", expectedRevision: 2, input: { name: "New Location", summary: "A new place" } });
  await adapter.createCanonEntity({ kind: "character", storyWorldId: "world_v2_demo", expectedRevision: 3, input: { name: "New Character", summary: "A new face" } });
  await adapter.createCanonEntity({ kind: "fact", storyWorldId: "world_v2_demo", expectedRevision: 4, input: { text: "New fact", visibility: "creator_only" } });
  await adapter.createCanonEntity({ kind: "rule", storyWorldId: "world_v2_demo", expectedRevision: 5, input: { text: "New rule", severity: "required" } });
  await adapter.createCanonEntity({ kind: "timeline", storyWorldId: "world_v2_demo", expectedRevision: 6, input: { localDate: "2088-04-04", title: "New Event", summary: "Event summary" } });

  await adapter.updateCanonEntity({ kind: "location", storyWorldId: "world_v2_demo", expectedRevision: 7, id: "loc_station", input: { name: "Rain Station Updated", summary: "Updated" } });
  await adapter.updateCanonEntity({ kind: "character", storyWorldId: "world_v2_demo", expectedRevision: 8, id: "char_archivist", input: { name: "Archivist Updated", summary: "Updated role" } });
  await adapter.updateCanonEntity({ kind: "fact", storyWorldId: "world_v2_demo", expectedRevision: 9, id: "fact_clock", input: { text: "Updated fact", visibility: "player_visible" } });
  await adapter.updateCanonEntity({ kind: "rule", storyWorldId: "world_v2_demo", expectedRevision: 10, id: "rule_candidate_review", input: { text: "Updated rule", severity: "guideline" } });
  await adapter.updateCanonEntity({ kind: "timeline", storyWorldId: "world_v2_demo", expectedRevision: 11, id: "timeline_first_train", input: { localDate: "2088-05-05", title: "Updated Event", summary: "Updated summary" } });

  await adapter.createGraphEntity({ kind: "arc", storyWorldId: "world_v2_demo", expectedRevision: 12, input: { title: "New Arc", summary: "Arc summary" } });
  await adapter.createGraphEntity({ kind: "scene", storyWorldId: "world_v2_demo", expectedRevision: 13, input: { title: "New Scene", body: "Scene body", arcId: "arc_main", isEntry: false } });
  await adapter.createGraphEntity({ kind: "choice", storyWorldId: "world_v2_demo", expectedRevision: 14, input: { sourceSceneId: "scene_opening", targetSceneId: "scene_archive", label: "New Choice", gates: [{ stateKey: "trust_archivist", operator: "gte", value: 1 }], consequences: [{ stateKey: "trust_archivist", operation: "increment", value: 1 }] } });
  await adapter.createGraphEntity({ kind: "state", storyWorldId: "world_v2_demo", expectedRevision: 15, input: { key: "new_flag", valueType: "boolean", defaultValue: false } });

  await adapter.updateGraphEntity({ kind: "arc", storyWorldId: "world_v2_demo", expectedRevision: 16, id: "arc_main", input: { title: "Main Mystery Updated", summary: "Updated arc" } });
  await adapter.updateGraphEntity({ kind: "scene", storyWorldId: "world_v2_demo", expectedRevision: 17, id: "scene_opening", input: { title: "Opening Updated", body: "Updated body", isEntry: true } });
  await adapter.updateGraphEntity({ kind: "choice", storyWorldId: "world_v2_demo", expectedRevision: 18, id: "choice_archive", input: { sourceSceneId: "scene_opening", targetSceneId: "scene_archive", label: "Updated Choice", gates: [], consequences: [] } });
  await adapter.updateGraphEntity({ kind: "state", storyWorldId: "world_v2_demo", expectedRevision: 19, id: "trust_archivist", input: { defaultValue: 5 } });

  const snapshot = await adapter.getSnapshot();
  assert.ok(snapshot.world.locations.some((location) => location.locationId.startsWith("location:mock-")));
  assert.ok(snapshot.world.characters.some((character) => character.characterId.startsWith("character:mock-")));
  assert.ok(snapshot.world.facts.some((fact) => fact.factId.startsWith("fact:mock-")));
  assert.ok(snapshot.world.rules.some((rule) => rule.ruleId.startsWith("rule:mock-")));
  assert.ok(snapshot.world.timelineEvents.some((event) => event.timelineEventId.startsWith("timeline:mock-")));
  assert.equal(snapshot.world.locations.find((location) => location.locationId === "loc_station")?.name, "Rain Station Updated");
  assert.equal(snapshot.world.timelineEvents.find((event) => event.timelineEventId === "timeline_first_train")?.title, "Updated Event");
  assert.ok(snapshot.sceneGraph.arcs.some((arc) => arc.arcId.startsWith("arc:mock-")));
  assert.ok(snapshot.sceneGraph.scenes.some((scene) => scene.sceneId.startsWith("scene:mock-")));
  assert.ok(snapshot.sceneGraph.choices.some((choice) => choice.choiceId.startsWith("choice:mock-")));
  assert.ok(snapshot.typedState.variables.some((variable) => variable.key === "new_flag"));
  assert.equal(snapshot.sceneGraph.arcs.find((arc) => arc.arcId === "arc_main")?.title, "Main Mystery Updated");
  assert.equal(snapshot.sceneGraph.scenes.find((scene) => scene.sceneId === "scene_opening")?.title, "Opening Updated");
  assert.equal(snapshot.sceneGraph.choices.find((choice) => choice.choiceId === "choice_archive")?.label, "Updated Choice");
  assert.equal(snapshot.typedState.variables.find((variable) => variable.key === "trust_archivist")?.defaultValue, 5);
});

test("V2 mock adapter updates created story worlds", async () => {
  const adapter = createV2MockAdapter();
  const created = await adapter.createStoryWorld({ name: "First" });
  const updated = await adapter.updateStoryWorld({ storyWorldId: created.storyWorldId, name: "Second", summary: "S", expectedRevision: created.revision });

  assert.equal(updated.name, "Second");
  const snapshot = await adapter.getSnapshot(created.storyWorldId);
  assert.equal(snapshot.world.name, "Second");
});

test("V2 mock adapter creates story worlds with generated ids", async () => {
  const adapter = createV2MockAdapter();
  const first = await adapter.createStoryWorld({ name: "故事甲" });
  const second = await adapter.createStoryWorld({ name: "故事乙", summary: "  前提乙  " });

  assert.equal(first.name, "故事甲");
  assert.ok(first.storyWorldId.startsWith("world:mock-"));
  assert.equal(first.revision, 1);
  assert.equal(second.summary, "前提乙");
});

test("V2 http adapter creates a story world and prefers it on the next snapshot", async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const oldWorld = { storyWorldId: "world:old", name: "Old World", revision: 3, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  let createdRef: { storyWorldId: string; name: string; revision: number } | null = null;
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/worlds")) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url, method, body });
      createdRef = { storyWorldId: String(body.storyWorldId), name: String(body.name), revision: 1 };
      return Response.json({ item: { ...createdRef, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } });
    }
    if (url.endsWith("/health")) return Response.json({ ok: true, version: "v2" });
    if (url.endsWith("/core/worlds")) return Response.json(createdRef === null ? [oldWorld] : [oldWorld, createdRef]);
    if (url.endsWith("/canon")) return Response.json({ storyWorldId: createdRef?.storyWorldId ?? "world:new", revision: 1, world: createdRef === null ? { storyWorldId: "world:new", name: "新世界", summary: "前提", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } : { ...createdRef, summary: "前提" }, locations: [], characters: [], facts: [], rules: [], timelineEvents: [] });
    if (url.endsWith("/graph")) return Response.json({ arcs: [], scenes: [], choices: [] });
    if (url.endsWith("/graph/validation")) return Response.json({ valid: true, diagnostics: [] });
    if (url.endsWith("/state/variables")) return Response.json([]);
    if (url.endsWith("/state/initial")) return Response.json({ values: {} });
    if (url.endsWith("/candidates/scenes")) return Response.json([]);
    if (url.includes("/generation/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/candidates")) return Response.json({ candidates: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/library")) return Response.json({ assets: [] });
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: true, diagnostics: [], blockers: [] });
    if (url.endsWith("/releases")) return Response.json([]);
    if (url.endsWith("/runtime/saves")) return Response.json([]);
    throw new Error(`unhandled ${method} ${url}`);
  };

  const adapter = createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl });
  const created = await adapter.createStoryWorld({ name: "新世界", summary: "前提" });

  assert.equal(created.name, "新世界");
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.body?.name, "新世界");
  assert.equal(calls[0]?.body?.summary, "前提");
  assert.ok(String(calls[0]?.body?.storyWorldId).startsWith("world:"));
  assert.ok(String(calls[0]?.body?.idempotencyKey).startsWith("create-world:"));

  // 创建后即使 worlds[0] 是旧世界，下一次快照也要加载新世界
  const snapshot = await adapter.getSnapshot();
  assert.equal(snapshot.world.storyWorldId, createdRef?.storyWorldId);
  assert.equal(snapshot.world.name, "新世界");
});

test("V2 HTTP adapter covers authoring CRUD and optional asset/timeline mapping", async () => {
  const world = { storyWorldId: "world", name: "World", revision: 5, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const assetHash = "a".repeat(64);
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "PATCH" && url.includes("/core/worlds/world") && !url.includes("/arcs") && !url.includes("/scenes") && !url.includes("/choices") && !url.includes("/state") && !url.includes("/locations") && !url.includes("/characters") && !url.includes("/facts") && !url.includes("/rules") && !url.includes("/timeline")) {
      return Response.json({ item: { ...world, name: "Updated", revision: 6 } });
    }
    if (method === "PATCH" || method === "POST") return Response.json({});
    if (url.endsWith("/health")) return Response.json({ ok: true, version: "v2" });
    if (url.endsWith("/core/worlds")) return Response.json([world]);
    if (url.endsWith("/canon")) return Response.json({
      storyWorldId: "world", revision: 5, world,
      locations: [], characters: [], facts: [], rules: [],
      timelineEvents: [{ timelineEventId: "evt", localDate: "2088-01-01", title: "Event", summary: "Summary" }],
    });
    if (url.endsWith("/graph")) return Response.json({
      arcs: [{ arcId: "arc", title: "Arc", summary: "Arc summary" }],
      scenes: [{ sceneId: "scene", title: "Scene", isEntry: true, body: "Body", arcId: "arc" }],
      choices: [{ choiceId: "choice", sourceSceneId: "scene", label: "Choice", gates: [{ stateKey: "flag", operator: "eq", value: true }], consequences: [{ stateKey: "flag", operation: "set", value: true }] }],
    });
    if (url.endsWith("/graph/validation")) return Response.json({ valid: true, diagnostics: [] });
    if (url.endsWith("/state/variables")) return Response.json([{ key: "flag", valueType: "boolean", defaultValue: false, createdAt: "2026-01-01" }]);
    if (url.endsWith("/state/initial")) return Response.json({ values: { flag: false } });
    if (url.endsWith("/candidates/scenes")) return Response.json([]);
    if (url.includes("/generation/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/jobs")) return Response.json({ jobs: [] });
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: true, diagnostics: [], blockers: [] });
    if (url.endsWith("/releases")) return Response.json([]);
    if (url.endsWith("/runtime/saves")) return Response.json([]);
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/candidates")) return Response.json({
      candidates: [{
        candidateId: "asset_candidate", status: "pending", payload: { asset: { prompt: "Prompt", mediaRef: `media://local/v2/assets/${assetHash}.png`, sourceJobId: "job", workflowVersion: "v1" }, validationNotes: ["ok"] },
        reviewedAt: "2026-01-01", reviewer: "creator", reviewReason: "good",
      }],
    });
    if (url.includes("/generation/assets/worlds/") && url.endsWith("/library")) return Response.json({
      assets: [{ assetId: "asset", mediaRef: `media://local/v2/assets/${assetHash}.png` }],
    });
    if (url.includes("/generation/assets/jobs/")) return Response.json({ job: { jobId: "asset_job", status: "queued", workflowVersion: "v1", seed: 0, prompt: "Prompt", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    if (url.includes("/generation/jobs/")) return Response.json({ job: { jobId: "scene_job", status: "queued", createdAt: "2026-01-01", updatedAt: "2026-01-01" } });
    return Response.json({}, { status: 404 });
  };

  const adapter = createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl });

  const worlds = await adapter.listStoryWorlds();
  assert.equal(worlds.length, 1);

  const updated = await adapter.updateStoryWorld({ storyWorldId: "world", name: "Updated", summary: "S", expectedRevision: 5 });
  assert.equal(updated.name, "Updated");

  await adapter.createCanonEntity({ kind: "location", storyWorldId: "world", expectedRevision: 6, input: { name: "Loc" } });
  await adapter.createCanonEntity({ kind: "character", storyWorldId: "world", expectedRevision: 6, input: { name: "Char" } });
  await adapter.createCanonEntity({ kind: "fact", storyWorldId: "world", expectedRevision: 6, input: { text: "Fact", visibility: "creator_only" } });
  await adapter.createCanonEntity({ kind: "rule", storyWorldId: "world", expectedRevision: 6, input: { text: "Rule", severity: "guideline" } });
  await adapter.createCanonEntity({ kind: "timeline", storyWorldId: "world", expectedRevision: 6, input: { localDate: "2088-01-01", title: "Event" } });

  await adapter.updateCanonEntity({ kind: "location", storyWorldId: "world", expectedRevision: 6, id: "loc", input: { name: "Loc2" } });
  await adapter.updateCanonEntity({ kind: "character", storyWorldId: "world", expectedRevision: 6, id: "char", input: { name: "Char2" } });
  await adapter.updateCanonEntity({ kind: "fact", storyWorldId: "world", expectedRevision: 6, id: "fact", input: { text: "Fact2", visibility: "player_visible" } });
  await adapter.updateCanonEntity({ kind: "rule", storyWorldId: "world", expectedRevision: 6, id: "rule", input: { text: "Rule2", severity: "required" } });
  await adapter.updateCanonEntity({ kind: "timeline", storyWorldId: "world", expectedRevision: 6, id: "evt", input: { localDate: "2088-02-02", title: "Event2" } });

  await adapter.createGraphEntity({ kind: "arc", storyWorldId: "world", expectedRevision: 6, input: { title: "Arc" } });
  await adapter.createGraphEntity({ kind: "scene", storyWorldId: "world", expectedRevision: 6, input: { title: "Scene", isEntry: false } });
  await adapter.createGraphEntity({ kind: "choice", storyWorldId: "world", expectedRevision: 6, input: { sourceSceneId: "scene", label: "Choice" } });
  await adapter.createGraphEntity({ kind: "state", storyWorldId: "world", expectedRevision: 6, input: { key: "flag", valueType: "boolean", defaultValue: false } });

  await adapter.updateGraphEntity({ kind: "arc", storyWorldId: "world", expectedRevision: 6, id: "arc", input: { title: "Arc2" } });
  await adapter.updateGraphEntity({ kind: "scene", storyWorldId: "world", expectedRevision: 6, id: "scene", input: { title: "Scene2", isEntry: true } });
  await adapter.updateGraphEntity({ kind: "choice", storyWorldId: "world", expectedRevision: 6, id: "choice", input: { sourceSceneId: "scene", label: "Choice2" } });
  await adapter.updateGraphEntity({ kind: "state", storyWorldId: "world", expectedRevision: 6, id: "flag", input: { defaultValue: true } });

  const assetJob = await adapter.getAssetGenerationJob("asset_job");
  assert.equal(assetJob.jobId, "asset_job");
  const sceneJob = await adapter.getSceneGenerationJob("scene_job");
  assert.equal(sceneJob.jobId, "scene_job");

  const snapshot = await adapter.getSnapshot("world");
  assert.equal(snapshot.world.timelineEvents[0]?.summary, "Summary");
  assert.equal(snapshot.sceneGraph.arcs[0]?.summary, "Arc summary");
  assert.equal(snapshot.sceneGraph.scenes[0]?.body, "Body");
  assert.equal(snapshot.sceneGraph.scenes[0]?.arcId, "arc");
  assert.equal(snapshot.sceneGraph.choices[0]?.gates.length, 1);
  assert.equal(snapshot.assets.candidate?.status, "pending");
  assert.equal(snapshot.assets.candidate?.reviewer, "creator");
  assert.equal(snapshot.assets.library.length, 1);
});
