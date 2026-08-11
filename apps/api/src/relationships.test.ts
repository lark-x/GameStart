import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createCharacter,
  createRelationshipEdge,
  createStoryWorld,
} from "@living-network/domain";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "relationship-api-world",
  name: "Relationship API World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.DYNAMIC,
  relationshipDynamicsEnabled: true,
});
const source = createCharacter({
  id: "relationship-api-source",
  displayName: "Source",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const target = createCharacter({
  id: "relationship-api-target",
  displayName: "Target",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const edge = createRelationshipEdge({
  id: "relationship-api-edge",
  source,
  target,
  storyWorld: world,
  relationshipType: "trusted-friend",
  initialState: { affinity: 35, trust: 60, conflict: -10, dependency: 5 },
  isPublic: true,
  isBidirectional: true,
});

function application() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    characters: [source, target],
    relationshipEdges: [edge],
  }));
}

test("lists relationship edges for a story world", async () => {
  const response = await application().handle(
    new Request(`http://localhost/v1/relationships?storyWorldId=${world.id}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: [edge] });
});

test("bounds missing relationship world and unsupported methods", async () => {
  const missingQuery = await application().handle(
    new Request("http://localhost/v1/relationships"),
  );
  assert.equal(missingQuery.status, 400);
  const missingWorld = await application().handle(
    new Request("http://localhost/v1/relationships?storyWorldId=missing"),
  );
  assert.equal(missingWorld.status, 404);
  const method = await application().handle(
    new Request(`http://localhost/v1/relationships?storyWorldId=${world.id}`, { method: "PATCH" }),
  );
  assert.equal(method.status, 405);
});
