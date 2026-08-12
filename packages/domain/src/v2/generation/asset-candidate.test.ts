import assert from "node:assert/strict";
import test from "node:test";

import { assertV2AssetCandidateInput, assertV2AssetMediaRef } from "./asset-candidate.ts";

test("validates controlled V2 asset media references", () => {
  assert.equal(assertV2AssetMediaRef("media://local/abc123.png"), "media://local/abc123.png");
  assert.equal(assertV2AssetMediaRef("media://fake-comfy/job-1.png"), "media://fake-comfy/job-1.png");
  assert.throws(() => assertV2AssetMediaRef("https://example.com/image.png"), /controlled/);
  assert.throws(() => assertV2AssetMediaRef("media://local/../secret.png"), /unsafe/);
});

test("validates V2 asset candidate provenance inputs", () => {
  const input = assertV2AssetCandidateInput({
    mediaRef: "media://local/abc123.png",
    prompt: " castle concept ",
    workflowVersion: "wf-v1",
    seed: 42,
  });
  assert.equal(input.prompt, "castle concept");
  assert.equal(input.workflowVersion, "wf-v1");
  assert.equal(input.seed, 42);
  assert.throws(
    () => assertV2AssetCandidateInput({ mediaRef: "media://local/a.png", prompt: "", workflowVersion: "wf-v1" }),
    /prompt/,
  );
  assert.throws(
    () => assertV2AssetCandidateInput({ mediaRef: "media://local/a.png", prompt: "p", workflowVersion: "wf-v1", seed: -1 }),
    /seed/,
  );
});
