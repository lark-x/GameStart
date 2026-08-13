import assert from "node:assert/strict";
import test from "node:test";

import { createV2HttpAdapter, v2MediaRefToUrl } from "./http.ts";
import { createV2MockAdapter } from "./mock.ts";
import { V2AdapterError } from "./types.ts";

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
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: true, diagnostics: [] });
    if (method === "POST" && url.endsWith("/releases")) return Response.json({ releaseId: "release_http", version: "1.0.0", sourceRevision: 2, contentHash: "hash", createdAt: "2026-01-01" });
    if (url.endsWith("/releases")) return Response.json([{ releaseId: "release_http", storyWorldId: "world_http", version: "1.0.0", sourceRevision: 2, contentHash: "hash", createdAt: "2026-01-01" }]);
    if (method === "POST" && url.endsWith("/generation/jobs/scene")) return Response.json({ job: { jobId: "job_scene", status: "queued", createdAt: "2026-01-01", updatedAt: "2026-01-01", prompt: "prompt", contextHash: "hash", attempts: 0, maxAttempts: 3 } });
    if (method === "POST" && url.includes("/candidates/scenes/") && url.endsWith("/review")) return Response.json({ revision: 3, candidate: { status: "approved", reviewedAt: "2026-01-01", reviewReason: "ok" } });
    if (method === "POST" && url.endsWith("/runtime/runs")) return Response.json(runtime);
    if (method === "GET" && url.includes("/runtime/runs/") && url.endsWith("/scene")) return Response.json(runtime);
    if (method === "POST" && url.includes("/choices")) return Response.json(runtime);
    if (method === "POST" && url.includes("/saves") && !url.includes("/load")) return Response.json({ saveId: "save_http", runId: "run_http", releaseVersion: "1.0.0", currentSceneId: "scene_next", createdAt: "2026-01-01" });
    if (method === "POST" && url.includes("/load")) return Response.json(runtime);
    if (url.includes("/core/releases/") && url.endsWith("/export")) return Response.json({ json: { releaseId: "release_http" }, markdown: "# HTTP World" });
    if (method === "POST" && url.endsWith("/generation/assets/jobs")) return Response.json({ job: { jobId: "asset_job", status: "queued", createdAt: "2026-01-01", updatedAt: "2026-01-01", workflowVersion: "local-default@1", seed: 0, prompt: "asset" } });
    if (method === "POST" && url.includes("/generation/assets/candidates/") && url.endsWith("/review")) return Response.json({ candidate: { status: "approved" }, review: { reviewedAt: "2026-01-01", reason: "ready" }, approvedAsset: { assetId: "asset_http", mediaRef: `media://local/v2/assets/${"a".repeat(64)}.png` } });
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
  const job = await adapter.createSceneGenerationJob({ storyWorldId: "world_http", baseCanonRevision: 2, prompt: "prompt", idempotencyKey: "scene-idem" });
  assert.equal(job.job.jobId, "job_scene");
  assert.equal((await adapter.reviewCandidate({ candidateId: "candidate", action: "approve", reviewer: "creator", reason: "ok" })).status, "approved");
  assert.equal((await adapter.createRelease()).version, "1.0.0");
  assert.equal((await adapter.startRun()).run.runId, "run_http");
  assert.equal((await adapter.submitChoice("choice")).sceneId, "scene_next");
  assert.equal((await adapter.saveRun("Checkpoint")).saveId, "save_http");
  const afterSave = await adapter.getSnapshot();
  assert.equal(afterSave.save?.saveId, "save_http");
  assert.equal((await adapter.restoreSave("save_http")).sceneId, "scene_next");
  assert.equal((await adapter.exportRelease("markdown")).format, "markdown");
  assert.equal((await adapter.createAssetJob("asset")).jobId, "asset_job");
  assert.equal((await adapter.reviewAssetCandidate({ candidateId: "asset_candidate", action: "approve", reviewer: "creator", reason: "ready" })).status, "approved");
  assert.ok(calls.some((call) => call.url.includes("/api/v2/core/worlds/world%3A")));
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
    if (url.endsWith("/canon")) return Response.json({ storyWorldId: "world", revision: 1, world: { storyWorldId: "world", name: "World", revision: 1 }, locations: [{ locationId: "loc", name: "Location" }], characters: [{ characterId: "char", name: "Character" }], facts: [{ factId: "fact", text: "Fact", visibility: "creator_only" }], rules: [{ ruleId: "rule", text: "Rule", severity: "guideline" }] });
    if (url.endsWith("/graph")) return Response.json({ arcs: [], scenes: [{ sceneId: "scene", title: "Scene", isEntry: true }], choices: [{ choiceId: "choice", sourceSceneId: "scene", label: "Continue" }] });
    if (url.endsWith("/graph/validation")) return Response.json({ valid: false, diagnostics: [{ code: "WARN", severity: "warning", message: "Warning", sceneId: "scene" }] });
    if (url.endsWith("/state/variables")) return Response.json([{ key: "Flag", valueType: "boolean", defaultValue: false }, { key: "Count", valueType: "number", defaultValue: 0 }, { key: "Name", valueType: "string", defaultValue: "" }]);
    if (url.endsWith("/state/initial")) return Response.json({ values: { Flag: false, Count: 0, Name: "" } });
    if (url.endsWith("/candidates/scenes")) return Response.json([{ candidateId: "candidate", kind: "scene", status: "changes_requested", storyWorldId: "world", baseCanonRevision: 1, payload: { scene: { sceneId: "candidate_scene", title: "Candidate", body: "Body", participantCharacterIds: [] }, choices: [{ label: "Choice" }], validationNotes: ["note"] }, provenance: { source: "llm", contextHash: "context" } }]);
    if (url.endsWith("/releases/preflight")) return Response.json({ valid: false, diagnostics: [{ code: "BAD", severity: "error", message: "Bad release" }] });
    if (url.endsWith("/releases")) return Response.json([]);
    if (url.includes("/runtime/runs/") && url.endsWith("/scene")) return Response.json(runtime);
    if (url.includes("/runtime/saves/") && url.endsWith("/save")) return Response.json({ saveId: "save", runId: "run", releaseVersion: "1.0.0", currentSceneId: "scene", createdAt: "2026-01-01" });
    return Response.json({}, { status: 404 });
  };
  const snapshot = await createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl }).getSnapshot();
  assert.equal(snapshot.world.facts[0]?.visibility, "creator");
  assert.equal(snapshot.world.rules[0]?.severity, "soft");
  assert.equal(snapshot.sceneGraph.diagnostics[0]?.severity, "warning");
  assert.equal(snapshot.typedState.variables[0]?.type, "flag");
  assert.equal(snapshot.candidate?.status, "changes_requested");
  const adapter = createV2HttpAdapter({ baseUrl: "http://localhost", fetchImpl: async (input) => {
    const url = String(input);
    return url.includes("/runtime/runs/") ? Response.json(runtime) : fetchImpl(input);
  } });
  const run = await adapter.startRun().catch((error: unknown) => error);
  assert.ok(run instanceof V2AdapterError);
});
