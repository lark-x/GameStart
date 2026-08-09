import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  StoryMode,
  TriggerSource,
  createBehaviorAction,
  createCharacter,
  createCharacterVisualIdentity,
  createComfyUiSettings,
  createEventExecution,
  createImageJob,
  createImageWorkflowTemplate,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { ComfyUiError, type ComfyUiProgressClient, type ComfyUiSubmitRequest } from "./media.ts";
import { createImageJobPump } from "./image-job-pump.ts";

const createdAt = "2026-08-09T00:00:00.000Z";

function fixture() {
  const world = createStoryWorld({ id: "pump-world", name: "Pump", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const character = createCharacter({ id: "pump-character", displayName: "Nia", role: CharacterRole.AI, storyWorldId: world.id, timezone: "UTC" });
  const definition = createWorldEventDefinition({
    id: "pump-definition", storyWorld: world, eventKey: "pump:event", name: "Pump event",
    triggerSource: TriggerSource.MANUAL, recurrence: { kind: EventRecurrenceKind.ONCE, runAt: createdAt }, targetCharacters: [character], createdAt,
  });
  const occurrence = createScheduledOccurrence({ id: "pump-occurrence", definition, scheduledFor: createdAt, occurrenceKey: "pump:once", createdAt });
  const execution = createEventExecution({ id: "pump-execution", occurrence, definition, ruleVersion: "test", inputSnapshot: {}, startedAt: createdAt });
  const action = createBehaviorAction({ id: "pump-action", execution, actorCharacterId: character.id, kind: ActionKind.REQUEST_IMAGE, payload: { prompt: "night observatory", workflowVersion: "moment@v1" }, createdAt });
  const job = createImageJob({ id: "pump-job", action, createdAt });
  const identity = createCharacterVisualIdentity({ id: "pump-identity", characterId: character.id, storyWorldId: world.id, positivePrompt: "astronomer", updatedAt: createdAt });
  const template = createImageWorkflowTemplate({ id: "moment", version: "v1", workflow: { prompt: { inputs: { text: "" } } }, positivePromptPath: ["prompt", "inputs", "text"] });
  const settings = createComfyUiSettings({ id: "default", baseUrl: "http://configured-comfy.test:8188", timeoutMs: 1234, autoImageIntentEnabled: true, updatedAt: createdAt });
  return {
    job,
    settings,
    repositories: createInMemoryRepositories({
      worlds: [world], characters: [character], worldEventDefinitions: [definition], scheduledOccurrences: [occurrence], eventExecutions: [execution], behaviorActions: [action], imageJobs: [job], characterVisualIdentities: [identity], imageWorkflowTemplates: [template], comfyUiSettings: settings,
    }),
  };
}

class CompletingClient implements ComfyUiProgressClient {
  public request: ComfyUiSubmitRequest | undefined;
  public async submit(request: ComfyUiSubmitRequest) { this.request = request; return { externalJobId: "comfy-pump-job" }; }
  public async getResult(externalJobId: string) { return { externalJobId, mediaRef: "media://local/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png" }; }
  public async *watchProgress(externalJobId: string) { yield { externalJobId, kind: "completed" as const }; }
}

test("image job pump uses persisted ComfyUI settings, submits queued work, and completes it", async () => {
  const { repositories, job } = fixture();
  const seen: Array<{ baseUrl: string; timeoutMs: number }> = [];
  const client = new CompletingClient();
  const pump = createImageJobPump(repositories, {
    fallbackSettings: { baseUrl: "http://fallback.test:8188", timeoutMs: 999 }, mediaRoot: "unused",
    createClient: (settings) => { seen.push({ baseUrl: settings.baseUrl, timeoutMs: settings.timeoutMs }); return client; },
  });
  const result = await pump.runOnce();
  assert.deepEqual(seen, [{ baseUrl: "http://configured-comfy.test:8188", timeoutMs: 1234 }]);
  assert.equal(result.queued, 1);
  assert.equal(result.submitted, 1);
  assert.equal(result.completed, 1);
  assert.equal((await repositories.imageJobs?.getById(job.id))?.status, "SUCCEEDED");
  assert.equal(client.request?.workflowVersion, "moment@v1");
  assert.deepEqual(client.request?.workflow, { prompt: { inputs: { text: "astronomer, night observatory" } } });
});

test("image job pump leaves retryable ComfyUI submit failures queued for the next tick", async () => {
  const { repositories, job } = fixture();
  const pump = createImageJobPump(repositories, {
    fallbackSettings: { baseUrl: "http://fallback.test:8188", timeoutMs: 999 }, mediaRoot: "unused",
    createClient: () => ({
      async submit() { throw new ComfyUiError("NETWORK_ERROR", "offline", { retryable: true }); },
      async getResult() { throw new Error("unreachable"); },
      async *watchProgress() { yield* []; },
    }),
  });
  const result = await pump.runOnce();
  assert.equal(result.deferred, 1);
  assert.equal((await repositories.imageJobs?.getById(job.id))?.status, "QUEUED");
});
