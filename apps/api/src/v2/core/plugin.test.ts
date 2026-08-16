import assert from "node:assert/strict";
import test from "node:test";

import { createV2FastifyApp } from "../platform/index.ts";
import { v2CorePlugin } from "./plugin.ts";
import type { V2CoreUseCases } from "./use-cases.ts";

function fakeUseCases(): V2CoreUseCases {
  return new Proxy({}, { get: () => async () => ({}) }) as V2CoreUseCases;
}

test("V2 core plugin dispatches every core route through the use-case boundary", async () => {
  const app = createV2FastifyApp({ corePlugin: v2CorePlugin, coreOptions: { useCases: fakeUseCases() } });
  await app.ready();
  try {
    const requests: Array<{ method: "GET" | "POST" | "PATCH"; url: string; payload?: unknown }> = [
      { method: "GET", url: "/api/v2/core/worlds" },
      { method: "POST", url: "/api/v2/core/worlds", payload: { storyWorldId: "world", name: "World", idempotencyKey: "world" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world", payload: { name: "World", expectedRevision: 1, idempotencyKey: "update-world" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/locations/location", payload: { name: "Location", expectedRevision: 1, idempotencyKey: "update-location" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/characters/character", payload: { name: "Character", expectedRevision: 1, idempotencyKey: "update-character" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/facts/fact", payload: { text: "Fact", visibility: "player_visible", expectedRevision: 1, idempotencyKey: "update-fact" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/rules/rule", payload: { text: "Rule", severity: "required", expectedRevision: 1, idempotencyKey: "update-rule" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/timeline-events/event", payload: { localDate: "2026-01-01", title: "Event", expectedRevision: 1, idempotencyKey: "update-event" } },
      { method: "GET", url: "/api/v2/core/worlds/world/canon" },
      { method: "POST", url: "/api/v2/core/worlds/world/locations", payload: { locationId: "location", name: "Location", expectedRevision: 1, idempotencyKey: "location" } },
      { method: "POST", url: "/api/v2/core/worlds/world/characters", payload: { characterId: "character", name: "Character", expectedRevision: 1, idempotencyKey: "character" } },
      { method: "POST", url: "/api/v2/core/worlds/world/facts", payload: { factId: "fact", text: "Fact", visibility: "player_visible", expectedRevision: 1, idempotencyKey: "fact" } },
      { method: "POST", url: "/api/v2/core/worlds/world/rules", payload: { ruleId: "rule", text: "Rule", severity: "required", expectedRevision: 1, idempotencyKey: "rule" } },
      { method: "POST", url: "/api/v2/core/worlds/world/timeline-events", payload: { timelineEventId: "event", localDate: "2026-01-01", title: "Event", expectedRevision: 1, idempotencyKey: "event" } },
      { method: "GET", url: "/api/v2/core/worlds/world/graph" },
      { method: "GET", url: "/api/v2/core/worlds/world/graph/validation" },
      { method: "POST", url: "/api/v2/core/worlds/world/arcs", payload: { arcId: "arc", title: "Arc", expectedRevision: 1, idempotencyKey: "arc" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/arcs/arc", payload: { title: "Arc", expectedRevision: 1, idempotencyKey: "update-arc" } },
      { method: "POST", url: "/api/v2/core/worlds/world/scenes", payload: { sceneId: "scene", title: "Scene", expectedRevision: 1, idempotencyKey: "scene" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/scenes/scene", payload: { title: "Scene", isEntry: true, expectedRevision: 1, idempotencyKey: "update-scene" } },
      { method: "POST", url: "/api/v2/core/worlds/world/choices", payload: { choiceId: "choice", sourceSceneId: "scene", label: "Choice", expectedRevision: 1, idempotencyKey: "choice" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/choices/choice", payload: { sourceSceneId: "scene", label: "Choice", expectedRevision: 1, idempotencyKey: "update-choice" } },
      { method: "GET", url: "/api/v2/core/worlds/world/state/variables" },
      { method: "POST", url: "/api/v2/core/worlds/world/state/variables", payload: { key: "Trust", valueType: "number", defaultValue: 0, expectedRevision: 1, idempotencyKey: "state" } },
      { method: "PATCH", url: "/api/v2/core/worlds/world/state/variables/Trust", payload: { defaultValue: 1, expectedRevision: 1, idempotencyKey: "update-state" } },
      { method: "GET", url: "/api/v2/core/worlds/world/state/initial" },
      { method: "POST", url: "/api/v2/core/worlds/world/state/preview-delta", payload: { deltas: [] } },
      { method: "GET", url: "/api/v2/core/worlds/world/candidates/scenes" },
      { method: "POST", url: "/api/v2/core/worlds/world/candidates/scenes", payload: { candidateId: "candidate", baseCanonRevision: 1, payload: { scene: { sceneId: "candidate_scene", title: "Scene", body: "Body", participantCharacterIds: [] }, choices: [], validationNotes: [] }, provenance: { source: "human" }, idempotencyKey: "candidate" } },
      { method: "GET", url: "/api/v2/core/worlds/world/candidates/scenes/candidate" },
      { method: "POST", url: "/api/v2/core/worlds/world/candidates/scenes/candidate/review", payload: { action: "approve", reviewer: "creator", expectedRevision: 1, idempotencyKey: "review" } },
      { method: "GET", url: "/api/v2/core/worlds/world/candidates/scenes/candidate/audits" },
      { method: "GET", url: "/api/v2/core/worlds/world/releases" },
      { method: "GET", url: "/api/v2/core/worlds/world/releases/preflight" },
      { method: "POST", url: "/api/v2/core/worlds/world/releases", payload: { releaseId: "release", version: "1.0.0", sourceRevision: 1, idempotencyKey: "release" } },
      { method: "POST", url: "/api/v2/core/runtime/runs", payload: { runId: "run", releaseId: "release", idempotencyKey: "run" } },
      { method: "GET", url: "/api/v2/core/runtime/runs/run/scene" },
      { method: "POST", url: "/api/v2/core/runtime/runs/run/choices", payload: { choiceId: "choice", idempotencyKey: "runtime-choice" } },
      { method: "POST", url: "/api/v2/core/runtime/runs/run/saves", payload: { saveId: "save", idempotencyKey: "save" } },
      { method: "GET", url: "/api/v2/core/runtime/saves/save" },
      { method: "POST", url: "/api/v2/core/runtime/saves/save/load", payload: { runId: "loaded", idempotencyKey: "load" } },
      { method: "GET", url: "/api/v2/core/worlds/world/export?revision=1" },
      { method: "GET", url: "/api/v2/core/releases/release/export" },
    ];
    for (const request of requests) {
      const response = request.method === "GET"
        ? await app.inject({ method: "GET", url: request.url })
        : await app.inject({ method: request.method, url: request.url, payload: request.payload ?? {} });
      assert.notEqual(response.statusCode, 500, `${request.method} ${request.url}: ${response.body}`);
      assert.equal(response.statusCode === 201 || response.statusCode === 200, true);
    }
    const invalidRouteParam = await app.inject({ method: "PATCH", url: "/api/v2/core/worlds/world/locations/%20", payload: { name: "Location", expectedRevision: 1, idempotencyKey: "bad" } });
    assert.equal(invalidRouteParam.statusCode, 400);
    const invalidRevision = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world/export?revision=0" });
    assert.equal(invalidRevision.statusCode, 400);
  } finally {
    await app.close();
  }
});
