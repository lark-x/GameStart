import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compileImageWorkflow,
  assertImageWorkflowTemplateBindings,
  createCharacterVisualIdentity,
  createImageWorkflowTemplate,
  importImageWorkflow,
} from "./visual-workflow.ts";

const updatedAt = "2026-08-05T10:00:00.000Z";

function makeIdentity() {
  return createCharacterVisualIdentity({
    id: "visual-1",
    characterId: "char-1",
    storyWorldId: "world-1",
    positivePrompt: "silver-haired alchemist",
    negativePrompt: "blurry",
    styleTags: ["anime illustration", "dramatic lighting"],
    referenceImageRefs: ["media://identity/char-1.png"],
    updatedAt,
  });
}

function makeTemplate() {
  return createImageWorkflowTemplate({
    id: "moment-v1",
    version: "2026-08",
    workflow: {
      "6": { inputs: { text: "placeholder" } },
      "7": { inputs: { text: "default negative" } },
      "3": { inputs: { seed: 1 } },
    },
    positivePromptPath: ["6", "inputs", "text"],
    negativePromptPath: ["7", "inputs", "text"],
    seedPath: ["3", "inputs", "seed"],
  });
}

test("composes stable character identity with scene prompt and injects workflow values", () => {
  const compiled = compileImageWorkflow(makeTemplate(), makeIdentity(), {
    prompt: "walking through a rain-soaked market",
    seed: 42,
  });
  assert.equal(
    compiled.prompt,
    "silver-haired alchemist, anime illustration, dramatic lighting, walking through a rain-soaked market",
  );
  assert.equal(compiled.negativePrompt, "blurry");
  assert.equal(compiled.seed, 42);
  assert.equal(compiled.workflowVersion, "moment-v1@2026-08");
  assert.equal((compiled.workflow["6"] as { inputs: { text: string } }).inputs.text, compiled.prompt);
  assert.equal((compiled.workflow["7"] as { inputs: { text: string } }).inputs.text, "blurry");
  assert.equal((compiled.workflow["3"] as { inputs: { seed: number } }).inputs.seed, 42);
});

test("keeps template defaults when no negative prompt is configured", () => {
  const template = createImageWorkflowTemplate({
    id: "moment-v2",
    version: "1",
    workflow: { node: { inputs: { text: "placeholder" } } },
    positivePromptPath: ["node", "inputs", "text"],
  });
  const identity = createCharacterVisualIdentity({
    id: "visual-2",
    characterId: "char-2",
    storyWorldId: "world-1",
    positivePrompt: "quiet librarian",
    updatedAt,
  });
  const compiled = compileImageWorkflow(template, identity, { prompt: "at dawn" });
  assert.equal(compiled.negativePrompt, undefined);
  assert.equal((compiled.workflow.node as { inputs: { text: string } }).inputs.text, "quiet librarian, at dawn");
});

test("rejects unsafe workflow paths and ignored seeds", () => {
  assert.throws(
    () => compileImageWorkflow(
      createImageWorkflowTemplate({
        id: "bad",
        version: "1",
        workflow: { node: "not-an-object" },
        positivePromptPath: ["node", "inputs", "text"],
      }),
      makeIdentity(),
      { prompt: "scene" },
    ),
    { name: "TypeError", message: /workflow path/ },
  );
  assert.throws(
    () => compileImageWorkflow(
      createImageWorkflowTemplate({
        id: "no-seed-path",
        version: "1",
        workflow: { node: { inputs: { text: "placeholder" } } },
        positivePromptPath: ["node", "inputs", "text"],
      }),
      makeIdentity(),
      { prompt: "scene", seed: 5 },
    ),
    { name: "TypeError", message: /seedPath/ },
  );
});

test("validates every configured workflow binding before external submission", () => {
  assert.doesNotThrow(() => assertImageWorkflowTemplateBindings(makeTemplate()));
  const invalid = createImageWorkflowTemplate({
    id: "invalid-bindings",
    version: "1",
    workflow: { node: "not-an-object" },
    positivePromptPath: ["node", "inputs", "text"],
  });
  assert.throws(
    () => assertImageWorkflowTemplateBindings(invalid),
    { name: "TypeError", message: /workflow path/ },
  );
});

test("rejects invalid revisions and scene seeds", () => {
  assert.throws(
    () => createCharacterVisualIdentity({
      id: "invalid-revision",
      characterId: "char-1",
      storyWorldId: "world-1",
      positivePrompt: "prompt",
      updatedAt,
      revision: 0,
    }),
    /revision must be a positive integer/,
  );
  assert.throws(
    () => compileImageWorkflow(makeTemplate(), makeIdentity(), { prompt: "scene", seed: -1 }),
    /scene\.seed/,
  );
});

test("imports the bundled ComfyUI canvas and maps editable widgets", async () => {
  const source = JSON.parse(await readFile(
    new URL("../../database/seed/workflows/comfy-anima-v1.canvas.json", import.meta.url),
    "utf8",
  )) as import("./life-simulation.ts").JsonObject;
  const imported = importImageWorkflow(source);
  assert.equal(imported.sourceFormat, "CANVAS");
  assert.deepEqual(imported.positivePromptPath, ["121", "inputs", "value"]);
  assert.deepEqual(imported.negativePromptPath, ["12", "inputs", "text"]);
  assert.deepEqual(imported.seedPath, ["63", "inputs", "seed"]);
  const sampler = imported.workflow["63"] as { inputs: Record<string, unknown> };
  assert.equal(sampler.inputs.steps, 31);
  assert.equal(sampler.inputs.cfg, 5);
  assert.equal(sampler.inputs.sampler_name, "er_sde");
  const latent = imported.workflow["28"] as { inputs: Record<string, unknown> };
  assert.deepEqual(latent.inputs, {
    width: ["122", 0],
    height: ["124", 0],
    batch_size: 1,
  });
  assert.equal(imported.workflow["108"], undefined);
  assert.equal(imported.workflow["109"], undefined);
  assert.equal((imported.workflow["122"] as { inputs: { value: number } }).inputs.value, 768);
  assert.equal((imported.workflow["124"] as { inputs: { value: number } }).inputs.value, 512);
  assertImageWorkflowTemplateBindings(createImageWorkflowTemplate({
    id: "comfy-anima",
    version: "v1",
    workflow: imported.workflow,
    positivePromptPath: imported.positivePromptPath,
    negativePromptPath: imported.negativePromptPath,
    seedPath: imported.seedPath,
  }));
});
