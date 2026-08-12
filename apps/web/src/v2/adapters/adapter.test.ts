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
  assert.equal(snapshot.candidate.kind, "scene");
  assert.equal(snapshot.release.valid, true);
  assert.equal(snapshot.run.releaseVersion, "0.0.1");
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
