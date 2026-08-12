import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
} from "@living-network/database";
import { createV2FastifyApp } from "../platform/index.ts";

test("V2 core API creates canon records with revision and idempotent replay", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    const createWorld = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_api",
        name: "API World",
        idempotencyKey: "key_world",
      },
    });
    assert.equal(createWorld.statusCode, 201);
    assert.equal(createWorld.json().revision, 1);

    const location = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/locations",
      payload: {
        locationId: "loc_gate",
        name: "Gate",
        expectedRevision: 1,
        idempotencyKey: "key_location",
      },
    });
    assert.equal(location.statusCode, 201);
    assert.equal(location.json().revision, 2);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/locations",
      payload: {
        locationId: "loc_gate",
        name: "Gate",
        expectedRevision: 1,
        idempotencyKey: "key_location",
      },
    });
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(replay.json(), location.json());

    const character = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/characters",
      payload: {
        characterId: "char_a",
        name: "Ada",
        homeLocationId: "loc_gate",
        expectedRevision: 2,
        idempotencyKey: "key_character",
      },
    });
    assert.equal(character.statusCode, 201);
    assert.equal(character.json().revision, 3);

    const snapshot = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_api/canon" });
    assert.equal(snapshot.statusCode, 200);
    assert.equal(snapshot.json().world.revision, 3);
    assert.equal(snapshot.json().locations.length, 1);
    assert.equal(snapshot.json().characters[0].homeLocationId, "loc_gate");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API maps stale revisions, idempotency conflicts, and unknown fields", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_api",
        name: "API World",
        idempotencyKey: "key_world",
      },
    });
    const stale = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/facts",
      payload: {
        factId: "fact_a",
        text: "Fact",
        visibility: "player_visible",
        expectedRevision: 5,
        idempotencyKey: "key_fact",
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, "STALE_REVISION");

    const first = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/rules",
      payload: {
        ruleId: "rule_a",
        text: "Keep it local",
        severity: "required",
        expectedRevision: 1,
        idempotencyKey: "key_rule",
      },
    });
    assert.equal(first.statusCode, 201);
    const conflict = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/rules",
      payload: {
        ruleId: "rule_b",
        text: "Changed",
        severity: "required",
        expectedRevision: 2,
        idempotencyKey: "key_rule",
      },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, "IDEMPOTENCY_CONFLICT");

    const bad = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_bad",
        name: "Bad",
        idempotencyKey: "key_bad",
        extra: true,
      },
    });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, "BAD_REQUEST");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});
