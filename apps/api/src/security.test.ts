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

test("trusted actor mode rejects missing and mismatched identity headers", async () => {
  const world = createStoryWorld({ id: "security-world", name: "Security", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "security-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const other = createCharacter({ id: "security-other", displayName: "Other", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "security-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const session = createActorSession({ id: "security-session", storyWorld: world, userCharacter: user, startedAt: "2026-08-05T00:00:00.000Z" });
  const app = new ApiApplication(
    createApiStore({ worlds: [world], characters: [user, other, ai], actorSessions: [session] }),
    undefined,
    {},
    { requireTrustedActor: true },
  );
  const missing = await app.handle(new Request("http://localhost/v1/conversations?characterId=security-user"));
  assert.equal(missing.status, 401);
  const mismatch = await app.handle(new Request("http://localhost/v1/conversations?characterId=security-user", {
    headers: { "x-actor-character-id": other.id },
  }));
  assert.equal(mismatch.status, 403);
  const allowed = await app.handle(new Request("http://localhost/v1/conversations?characterId=security-user", {
    headers: { "x-actor-character-id": user.id },
  }));
  assert.equal(allowed.status, 200);
  const switchMismatch = await app.handle(new Request("http://localhost/v1/actor-sessions/switch", {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor-character-id": other.id },
    body: JSON.stringify({ actorSessionId: session.id, nextCharacterId: other.id }),
  }));
  assert.equal(switchMismatch.status, 403);
  const anonymousWorkflowImport = await app.handle(new Request("http://localhost/v1/comfyui/workflows/import", {
    method: "POST",
    body: JSON.stringify({ id: "anonymous", version: "v1", workflow: {} }),
  }));
  assert.equal(anonymousWorkflowImport.status, 401);
});
