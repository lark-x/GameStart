import assert from "node:assert/strict";
import test from "node:test";

import { ApiApplication, createApiStore } from "./index.ts";

const validWorkflow = {
  id: "workflow-api-moment",
  version: "v1",
  workflow: {
    positive: { inputs: { text: "placeholder" } },
    negative: { inputs: { text: "negative" } },
    sampler: { inputs: { seed: 1 } },
  },
  positivePromptPath: ["positive", "inputs", "text"],
  negativePromptPath: ["negative", "inputs", "text"],
  seedPath: ["sampler", "inputs", "seed"],
};

function application() {
  return new ApiApplication(createApiStore());
}

test("validates every configured ComfyUI workflow binding", async () => {
  const response = await application().handle(new Request(
    "http://localhost/v1/comfyui/workflows",
    { method: "POST", body: JSON.stringify(validWorkflow) },
  ));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    data: {
      valid: true,
      id: validWorkflow.id,
      version: validWorkflow.version,
      checkedBindings: ["positivePromptPath", "negativePromptPath", "seedPath"],
    },
  });
});

test("rejects invalid workflow paths and malformed requests", async () => {
  const invalidPath = await application().handle(new Request(
    "http://localhost/v1/comfyui/workflows",
    {
      method: "POST",
      body: JSON.stringify({
        ...validWorkflow,
        workflow: { positive: "not-an-object" },
        negativePromptPath: undefined,
        seedPath: undefined,
      }),
    },
  ));
  assert.equal(invalidPath.status, 400);
  assert.match(JSON.stringify(await invalidPath.json()), /workflow path/);

  const malformed = await application().handle(new Request(
    "http://localhost/v1/comfyui/workflows",
    { method: "POST", body: JSON.stringify({ ...validWorkflow, positivePromptPath: [] }) },
  ));
  assert.equal(malformed.status, 400);
  const method = await application().handle(new Request(
    "http://localhost/v1/comfyui/workflows",
    { method: "PUT" },
  ));
  assert.equal(method.status, 405);
});
