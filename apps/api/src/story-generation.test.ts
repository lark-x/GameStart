import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createActorSession,
  createCharacter,
  createStoryWorld,
} from "@living-network/domain";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "sgen-world",
  name: "Story Generation World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.DYNAMIC,
  relationshipDynamicsEnabled: true,
});

const user = createCharacter({
  id: "sgen-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});

const ai = createCharacter({
  id: "sgen-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});

const session = createActorSession({
  id: "sgen-session",
  storyWorld: world,
  userCharacter: user,
  startedAt: "2026-08-01T00:00:00.000Z",
});

function createApp() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [user, ai],
    actorSessions: [session],
  }));
}

async function json(res: Response) {
  return res.json() as Promise<{ data?: unknown; error?: { code: string; message: string } }>;
}

async function setupArcAndNode(app: ApiApplication) {
  const arcRes = await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "sgen-arc", storyWorldId: world.id, title: "Test Arc" }),
  }));
  assert.equal(arcRes.status, 201);

  const nodeRes = await app.handle(new Request("http://localhost/v1/story-nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "sgen-node",
      storyWorldId: world.id,
      arcId: "sgen-arc",
      title: "Test Node",
      nodeType: "SCENE_SEED",
      timeMode: "FLOATING",
    }),
  }));
  assert.equal(nodeRes.status, 201);
}

// ── World Context Policy ──

test("GET /v1/worlds/:id/context-policy returns default policy when none exists", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`));
  assert.equal(res.status, 200);
  const body = await json(res);
  const policy = body.data as { worldLoreEnabled: boolean; relationshipsEnabled: boolean };
  assert.equal(policy.worldLoreEnabled, false);
  assert.equal(policy.relationshipsEnabled, false);
});

test("PUT /v1/worlds/:id/context-policy creates or updates the policy", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worldLoreEnabled: true, memoriesEnabled: true }),
  }));
  assert.equal(res.status, 200);
  const body = await json(res);
  const policy = body.data as {
    worldLoreEnabled: boolean;
    relationshipsEnabled: boolean;
    schedulesEnabled: boolean;
    memoriesEnabled: boolean;
  };
  assert.equal(policy.worldLoreEnabled, true);
  assert.equal(policy.relationshipsEnabled, false);
  assert.equal(policy.schedulesEnabled, false);
  assert.equal(policy.memoriesEnabled, true);
});

test("PUT /v1/worlds/:id/context-policy preserves unmentioned fields", async () => {
  const app = createApp();
  await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worldLoreEnabled: true }),
  }));
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memoriesEnabled: true }),
  }));
  const body = await json(res);
  const policy = body.data as { worldLoreEnabled: boolean; memoriesEnabled: boolean };
  assert.equal(policy.worldLoreEnabled, true);
  assert.equal(policy.memoriesEnabled, true);
});

test("PUT /v1/worlds/:id/context-policy rejects non-boolean values", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ worldLoreEnabled: "yes" }),
  }));
  assert.equal(res.status, 400);
});

test("PUT /v1/worlds/:id/context-policy rejects non-object body", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify("invalid"),
  }));
  assert.equal(res.status, 400);
});

test("context-policy returns 405 for unsupported methods", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/worlds/${world.id}/context-policy`, {
    method: "DELETE",
  }));
  assert.equal(res.status, 405);
});

// ── Story Generation Jobs ──

test("POST /v1/story-nodes/:id/generation-jobs creates a job", async () => {
  const app = createApp();
  await setupArcAndNode(app);
  const res = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "idem-1" }),
  }));
  assert.equal(res.status, 201);
  const body = await json(res);
  const job = body.data as { id: string; status: string; storyNodeId: string };
  assert.equal(job.status, "PENDING");
  assert.equal(job.storyNodeId, "sgen-node");
});

test("POST /v1/story-nodes/:id/generation-jobs is idempotent", async () => {
  const app = createApp();
  await setupArcAndNode(app);
  const first = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "idem-2" }),
  }));
  assert.equal(first.status, 201);
  const second = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "idem-2" }),
  }));
  assert.equal(second.status, 200);
  const firstBody = (await json(first)).data as { id: string };
  const secondBody = (await json(second)).data as { id: string };
  assert.equal(firstBody.id, secondBody.id);
});

test("POST /v1/story-nodes/:id/generation-jobs requires idempotencyKey", async () => {
  const app = createApp();
  await setupArcAndNode(app);
  const res = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert.equal(res.status, 400);
});

test("POST /v1/story-nodes/:id/generation-jobs returns 404 for unknown node", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-nodes/unknown-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "idem-x" }),
  }));
  assert.equal(res.status, 404);
});

test("GET /v1/story-generation-jobs/:id returns the job", async () => {
  const app = createApp();
  await setupArcAndNode(app);
  const create = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "idem-3" }),
  }));
  const created = (await json(create)).data as { id: string };
  const res = await app.handle(new Request(`http://localhost/v1/story-generation-jobs/${created.id}`));
  assert.equal(res.status, 200);
  const body = await json(res);
  const job = body.data as { id: string; status: string };
  assert.equal(job.id, created.id);
});

test("GET /v1/story-generation-jobs/:id returns 404 for unknown job", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-jobs/unknown"));
  assert.equal(res.status, 404);
});

test("generation-jobs returns 405 for unsupported methods", async () => {
  const app = createApp();
  await setupArcAndNode(app);
  const res = await app.handle(new Request("http://localhost/v1/story-nodes/sgen-node/generation-jobs", {
    method: "GET",
  }));
  assert.equal(res.status, 405);
});

// ── Story Generation Candidates ──

test("GET /v1/story-generation-candidates requires storyWorldId", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates"));
  assert.equal(res.status, 400);
});

test("GET /v1/story-generation-candidates returns empty list when none exist", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/story-generation-candidates?storyWorldId=${world.id}`));
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.deepEqual(body.data, []);
});

test("story-generation-candidates returns 405 for unsupported methods", async () => {
  const app = createApp();
  const res = await app.handle(new Request(`http://localhost/v1/story-generation-candidates?storyWorldId=${world.id}`, {
    method: "POST",
  }));
  assert.equal(res.status, 405);
});

// ── Candidate Review ──

test("POST /v1/story-generation-candidates/:id/review validates action", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates/fake-id/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "invalid", reviewerCharacterId: ai.id, idempotencyKey: "rk-1" }),
  }));
  assert.equal(res.status, 400);
});

test("POST /v1/story-generation-candidates/:id/review requires reviewerCharacterId", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates/fake-id/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", idempotencyKey: "rk-2" }),
  }));
  assert.equal(res.status, 400);
});

test("POST /v1/story-generation-candidates/:id/review requires idempotencyKey", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates/fake-id/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", reviewerCharacterId: ai.id }),
  }));
  assert.equal(res.status, 400);
});

test("POST /v1/story-generation-candidates/:id/review returns 404 for unknown candidate", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates/unknown/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", reviewerCharacterId: ai.id, idempotencyKey: "rk-3" }),
  }));
  assert.equal(res.status, 404);
});

test("review endpoint returns 405 for unsupported methods", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-generation-candidates/fake/review", {
    method: "GET",
  }));
  assert.equal(res.status, 405);
});
