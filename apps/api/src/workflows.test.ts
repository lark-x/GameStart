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

test("imports and persists a ComfyUI API workflow", async () => {
  const app = application();
  const response = await app.handle(new Request(
    "http://localhost/v1/comfyui/workflows/import",
    {
      method: "POST",
      body: JSON.stringify({
        id: "imported-portrait",
        version: "v1",
        workflow: {
          positive: {
            class_type: "CLIPTextEncode",
            _meta: { title: "Positive Prompt" },
            inputs: { text: "placeholder" },
          },
          sampler: { class_type: "KSampler", inputs: { seed: 1 } },
        },
      }),
    },
  ));
  assert.equal(response.status, 201);
  const imported = (await response.json()) as { data: typeof validWorkflow };
  assert.equal(imported.data.id, "imported-portrait");
  assert.deepEqual(imported.data.positivePromptPath, ["positive", "inputs", "text"]);
  assert.deepEqual(imported.data.seedPath, ["sampler", "inputs", "seed"]);

  const listed = await app.handle(new Request("http://localhost/v1/comfyui/workflows"));
  const payload = (await listed.json()) as { data: Array<{ id: string; version: string }> };
  assert.ok(payload.data.some((item) => item.id === "imported-portrait" && item.version === "v1"));
});
