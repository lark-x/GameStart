import assert from "node:assert/strict";
import test from "node:test";

import { generateV2SceneCandidate, type ChatProvider, type ChatCompletionRequest, type V2GenerationContextSnapshot } from "./index.ts";

const context: V2GenerationContextSnapshot = {
  storyWorldId: "world_v2",
  baseCanonRevision: 1,
  prompt: "Write a scene about the bridge.",
  tokenBudget: 512,
  contextHash: "sha256:context",
  facts: [{ id: "fact-bridge", text: "The bridge is sealed.", visibility: "player_visible" }],
  characters: [{ characterId: "char_mira", name: "Mira" }],
  scenes: [{ sceneId: "scene_intro", title: "Intro" }],
};

test("generateV2SceneCandidate requests JSON and parses provider output", async () => {
  const requests: ChatCompletionRequest[] = [];
  const provider: ChatProvider = {
    complete: async (request) => {
      requests.push(request);
      return {
        id: "completion-1",
        model: "fake-model",
        content: JSON.stringify({
          scene: {
            sceneId: "scene_bridge",
            title: "At the Bridge",
            body: "Mira stops before the sealed bridge.",
            participantCharacterIds: ["char_mira"],
          },
          choices: [{ label: "Look closer" }],
          validationNotes: [],
        }),
      };
    },
    stream: async function* () {},
  };
  const result = await generateV2SceneCandidate(provider, { context, model: "fake-model" });
  assert.equal(result.providerResponseId, "completion-1");
  assert.equal(result.content.includes("scene_bridge"), true);
  assert.equal(result.rawTextPreview.includes("scene_bridge"), true);
  assert.equal(requests[0]?.responseFormat, "json_object");
  assert.equal(requests[0]?.maxTokens, 512);
  assert.equal(requests[0]?.trace?.correlationId, "v2:generation:sha256:context");
  assert.equal(JSON.stringify(requests[0]?.messages).includes("The bridge is sealed."), true);
});

test("generateV2SceneCandidate returns raw malformed output for downstream strict parser", async () => {
  const provider: ChatProvider = {
    complete: async () => ({ id: "bad", model: "fake-model", content: "{}" }),
    stream: async function* () {},
  };
  const result = await generateV2SceneCandidate(provider, { context });
  assert.equal(result.content, "{}");
});
