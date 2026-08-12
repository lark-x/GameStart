import assert from "node:assert/strict";
import test from "node:test";

import { createV2HttpAdapter } from "./http.ts";
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
  assert.equal(snapshot.run.releaseVersion, "0.0.1");
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
