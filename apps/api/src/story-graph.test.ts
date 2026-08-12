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
  id: "sg-api-world",
  name: "Story Graph API",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});

const user = createCharacter({
  id: "sg-api-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});

const ai = createCharacter({
  id: "sg-api-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});

const session = createActorSession({
  id: "sg-api-session",
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

test("creates, lists, updates, and deletes story arcs", async () => {
  const app = createApp();
  const createRes = await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "arc-1", storyWorldId: world.id, title: "Act I" }),
  }));
  assert.equal(createRes.status, 201);
  const created = (await json(createRes)).data as { id: string; status: string };
  assert.equal(created.id, "arc-1");
  assert.equal(created.status, "DRAFT");

  const listRes = await app.handle(new Request(`http://localhost/v1/story-arcs?storyWorldId=${world.id}`));
  assert.equal(listRes.status, 200);
  const listData = (await json(listRes)).data as { id: string }[];
  assert.equal(listData.length, 1);

  const updateRes = await app.handle(new Request("http://localhost/v1/story-arcs/arc-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Act I Updated", status: "ACTIVE" }),
  }));
  assert.equal(updateRes.status, 200);
  const updated = (await json(updateRes)).data as { title: string; status: string };
  assert.equal(updated.title, "Act I Updated");
  assert.equal(updated.status, "ACTIVE");

  const dupRes = await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "arc-1", storyWorldId: world.id, title: "Dup" }),
  }));
  assert.equal(dupRes.status, 409);

  const deleteRes = await app.handle(new Request("http://localhost/v1/story-arcs/arc-1", { method: "DELETE" }));
  assert.equal(deleteRes.status, 204);

  const afterDelete = await app.handle(new Request(`http://localhost/v1/story-arcs?storyWorldId=${world.id}`));
  assert.equal(((await json(afterDelete)).data as unknown[]).length, 0);
});

test("returns 404 for missing story arc", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-arcs/nope", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "X" }),
  }));
  assert.equal(res.status, 404);
});

test("returns 400 for story arc without storyWorldId", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-arcs"));
  assert.equal(res.status, 400);
});

test("creates, lists, and deletes story nodes with arc", async () => {
  const app = createApp();

  await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "arc-n", storyWorldId: world.id, title: "Node Arc" }),
  }));

  const createRes = await app.handle(new Request("http://localhost/v1/story-nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "node-1",
      storyWorldId: world.id,
      arcId: "arc-n",
      title: "Opening",
      nodeType: "SCENE_SEED",
      timeMode: "FLOATING",
    }),
  }));
  assert.equal(createRes.status, 201);
  const created = (await json(createRes)).data as { id: string; nodeType: string };
  assert.equal(created.nodeType, "SCENE_SEED");

  const listByArc = await app.handle(new Request(`http://localhost/v1/story-nodes?storyWorldId=${world.id}&arcId=arc-n`));
  assert.equal(((await json(listByArc)).data as unknown[]).length, 1);

  const listByWorld = await app.handle(new Request(`http://localhost/v1/story-nodes?storyWorldId=${world.id}`));
  assert.equal(((await json(listByWorld)).data as unknown[]).length, 1);

  const deleteRes = await app.handle(new Request("http://localhost/v1/story-nodes/node-1", { method: "DELETE" }));
  assert.equal(deleteRes.status, 204);
});

test("returns 409 for duplicate story node", async () => {
  const app = createApp();
  await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "arc-dup", storyWorldId: world.id, title: "Dup Arc" }),
  }));
  const body = JSON.stringify({
    id: "node-dup",
    storyWorldId: world.id,
    arcId: "arc-dup",
    title: "Dup",
    nodeType: "MILESTONE",
    timeMode: "ABSOLUTE",
  });
  await app.handle(new Request("http://localhost/v1/story-nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }));
  const dupRes = await app.handle(new Request("http://localhost/v1/story-nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  }));
  assert.equal(dupRes.status, 409);
});

test("creates and deletes story edges", async () => {
  const app = createApp();
  await app.handle(new Request("http://localhost/v1/story-arcs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "arc-e", storyWorldId: world.id, title: "Edge Arc" }),
  }));
  for (const nodeId of ["e-from", "e-to"]) {
    await app.handle(new Request("http://localhost/v1/story-nodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: nodeId,
        storyWorldId: world.id,
        arcId: "arc-e",
        title: nodeId,
        nodeType: "SCENE_SEED",
        timeMode: "FLOATING",
      }),
    }));
  }
  const createRes = await app.handle(new Request("http://localhost/v1/story-edges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "edge-1",
      storyWorldId: world.id,
      arcId: "arc-e",
      fromNodeId: "e-from",
      toNodeId: "e-to",
      edgeType: "LEADS_TO",
    }),
  }));
  assert.equal(createRes.status, 201);
  const listRes = await app.handle(new Request("http://localhost/v1/story-edges?arcId=arc-e"));
  assert.equal(((await json(listRes)).data as unknown[]).length, 1);

  const deleteRes = await app.handle(new Request("http://localhost/v1/story-edges/edge-1", { method: "DELETE" }));
  assert.equal(deleteRes.status, 204);
});

test("returns 400 for story edge without arcId", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/story-edges"));
  assert.equal(res.status, 400);
});

test("creates, lists, and deletes prompt templates", async () => {
  const app = createApp();
  const createRes = await app.handle(new Request("http://localhost/v1/prompt-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "pt-1",
      storyWorldId: world.id,
      type: "STORY_NODE",
      name: "Node Template",
      content: "Write a scene.",
    }),
  }));
  assert.equal(createRes.status, 201);

  const listRes = await app.handle(new Request(`http://localhost/v1/prompt-templates?storyWorldId=${world.id}`));
  assert.equal(((await json(listRes)).data as unknown[]).length, 1);

  const deleteRes = await app.handle(new Request("http://localhost/v1/prompt-templates/pt-1", { method: "DELETE" }));
  assert.equal(deleteRes.status, 204);
});

test("creates memory candidates and reviews with APPROVED", async () => {
  const app = createApp();
  const createRes = await app.handle(new Request("http://localhost/v1/memory-candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "mc-1",
      storyWorldId: world.id,
      sourceRef: "test:api",
      content: "Alice remembers tea",
      confidence: 0.8,
    }),
  }));
  assert.equal(createRes.status, 201);
  const created = (await json(createRes)).data as { id: string; status: string };
  assert.equal(created.status, "PENDING");

  const listRes = await app.handle(new Request(`http://localhost/v1/memory-candidates?storyWorldId=${world.id}`));
  assert.equal(((await json(listRes)).data as unknown[]).length, 1);

  const reviewRes = await app.handle(new Request("http://localhost/v1/memory-candidates/mc-1/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "APPROVED" }),
  }));
  assert.equal(reviewRes.status, 200);
  const reviewed = (await json(reviewRes)).data as { status: string; proposedMemoryId?: string };
  assert.equal(reviewed.status, "APPROVED");
  assert.ok(reviewed.proposedMemoryId);
});

test("returns 404 for missing memory candidate review", async () => {
  const app = createApp();
  const res = await app.handle(new Request("http://localhost/v1/memory-candidates/nope/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "REJECTED" }),
  }));
  assert.equal(res.status, 404);
});

test("memory candidate review is idempotent for same status", async () => {
  const app = createApp();
  await app.handle(new Request("http://localhost/v1/memory-candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "mc-idem",
      storyWorldId: world.id,
      sourceRef: "test:idem",
      content: "Idempotent memory",
      confidence: 0.7,
    }),
  }));

  const first = await app.handle(new Request("http://localhost/v1/memory-candidates/mc-idem/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "REJECTED" }),
  }));
  assert.equal(first.status, 200);

  const second = await app.handle(new Request("http://localhost/v1/memory-candidates/mc-idem/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "REJECTED" }),
  }));
  assert.equal(second.status, 200);
});

test("memory candidate review rejects conflicting status on already-reviewed candidate", async () => {
  const app = createApp();
  await app.handle(new Request("http://localhost/v1/memory-candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "mc-conflict",
      storyWorldId: world.id,
      sourceRef: "test:conflict",
      content: "Conflict memory",
      confidence: 0.6,
    }),
  }));

  await app.handle(new Request("http://localhost/v1/memory-candidates/mc-conflict/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "APPROVED" }),
  }));

  const conflict = await app.handle(new Request("http://localhost/v1/memory-candidates/mc-conflict/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "REJECTED" }),
  }));
  assert.equal(conflict.status, 409);
});
