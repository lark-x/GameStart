import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteCanonRepository,
  V2SqliteCanonUnitOfWork,
  createV2TempSqliteDatabase,
} from "../index.ts";
import {
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonWorld,
  createV2CanonRule,
  createV2CanonTimelineEvent,
  V2DomainError,
} from "@living-network/domain/v2";

test("V2 canon SQLite migration applies, indexes FTS facts, and rolls back", async () => {
  const { path, cleanup } = createV2TempSqliteDatabase();
  const db = openV2SqliteConnection({ path });
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteCanonRepository(db);
    const world = createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" });
    db.exec("BEGIN IMMEDIATE");
    try {
      await repository.createWorld(world);
      await repository.createFact(createV2CanonFact({
        storyWorldId: "world_a" as never,
        factId: "fact_a",
        text: "The lighthouse is haunted",
        visibility: "player_visible",
      }));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const fts = db.prepare("SELECT fact_id FROM v2_facts_fts WHERE v2_facts_fts MATCH 'lighthouse'").get();
    assert.equal((fts as { readonly fact_id?: string } | undefined)?.fact_id, "fact_a");
    revertV2Migrations(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_worlds'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon SQLite repository enforces revision, idempotency, and recovery after reopen", async () => {
  const { path, cleanup } = createV2TempSqliteDatabase();
  let db = openV2SqliteConnection({ path });
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCanonUnitOfWork(db);
    await unit.withCanonTransaction(async ({ canon }) => {
      const world = await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" }));
      assert.equal(world.revision, 1);
      await canon.saveMutation({
        key: "key_create_world" as never,
        operation: "createWorld",
        payloadHash: "same",
        result: { revision: world.revision },
      });
    });
    db.close();

    db = openV2SqliteConnection({ path });
    const reopened = new V2SqliteCanonRepository(db);
    assert.equal((await reopened.getWorld("world_a" as never))?.name, "World A");
    const existing = await reopened.readMutation<{ readonly revision: number }>({
      key: "key_create_world" as never,
      operation: "createWorld",
    });
    assert.deepEqual(existing?.result, { revision: 1 });

    await assert.rejects(
      () => reopened.advanceRevision("world_a" as never, 5 as never),
      (error) => error instanceof V2DomainError && error.code === "STALE_REVISION",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon SQLite repository rejects cross-world character location references", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCanonUnitOfWork(db);
    await assert.rejects(
      () => unit.withCanonTransaction(async ({ canon }) => {
        await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" }));
        await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_b" as never, name: "World B" }));
        await canon.createLocation(createV2CanonLocation({
          storyWorldId: "world_a" as never,
          locationId: "loc_a" as never,
          name: "A",
        }));
        await canon.createCharacter(createV2CanonCharacter({
          storyWorldId: "world_b" as never,
          characterId: "char_b" as never,
          name: "B",
          homeLocationId: "loc_a" as never,
        }));
      }),
      /constraint/i,
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 character visual variants enforce one default per character at the database boundary", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteCanonRepository(db);
    const world = await repository.createWorld(createV2CanonWorld({ storyWorldId: "world_visual_default" as never, name: "World" }));
    await repository.createCharacter(createV2CanonCharacter({ storyWorldId: world.storyWorldId, characterId: "char_visual" as never, name: "Visual" }));
    db.prepare(`
      INSERT INTO v2_character_visual_variants (visual_variant_id, story_world_id, character_id, name, is_default)
      VALUES (?, ?, ?, ?, 1)
    `).run("variant_one", "world_visual_default", "char_visual", "One");
    assert.throws(() => db.prepare(`
      INSERT INTO v2_character_visual_variants (visual_variant_id, story_world_id, character_id, name, is_default)
      VALUES (?, ?, ?, ?, 1)
    `).run("variant_two", "world_visual_default", "char_visual", "Two"));
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon repository handles missing revision worlds and typed row failures", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteCanonRepository(db);
    await assert.rejects(() => repository.advanceRevision("missing" as never, 1 as never), /does not exist/);
    db.prepare("INSERT INTO v2_worlds (story_world_id, name, summary, revision) VALUES (?, ?, ?, ?)").run("bad", "Bad", null, "not-a-number");
    await assert.rejects(() => repository.getWorld("bad" as never), /revision/);
    db.prepare("INSERT INTO v2_facts (fact_id, story_world_id, text, visibility) VALUES (?, ?, ?, ?)").run("bad-fact", "bad", "bad", "player_visible");
    db.prepare("INSERT INTO v2_rules (rule_id, story_world_id, text, severity) VALUES (?, ?, ?, ?)").run("bad-rule", "bad", "bad", "guideline");
    db.prepare("INSERT INTO v2_timeline_events (timeline_event_id, story_world_id, local_date, title, summary) VALUES (?, ?, ?, ?, ?)").run("bad-event", "bad", "2026-01-01", "bad", null);
    db.prepare("UPDATE v2_facts SET created_at = ? WHERE fact_id = 'bad-fact' AND story_world_id = 'bad'").run(Buffer.from("bad"));
    db.prepare("UPDATE v2_rules SET created_at = ? WHERE rule_id = 'bad-rule' AND story_world_id = 'bad'").run(Buffer.from("bad"));
    db.prepare("UPDATE v2_timeline_events SET created_at = ? WHERE timeline_event_id = 'bad-event' AND story_world_id = 'bad'").run(Buffer.from("bad"));
    await assert.rejects(() => repository.listFacts("bad" as never), /created_at/);
    await assert.rejects(() => repository.listRules("bad" as never), /created_at/);
    await assert.rejects(() => repository.listTimelineEvents("bad" as never), /created_at/);
    db.prepare("INSERT INTO v2_worlds (story_world_id, name, summary, revision) VALUES (?, ?, ?, ?)").run("state", "State", null, 1);
    db.prepare("INSERT INTO v2_state_variables (story_world_id, key, value_type, default_json) VALUES (?, ?, ?, ?)").run("state", "Bad", "number", JSON.stringify({ bad: true }));
    const graph = new (await import("./canon-repository.ts")).V2SqliteGraphStateRepository(db);
    await assert.rejects(() => graph.getStateVariable({ storyWorldId: "state" as never, key: "Bad" }), /typed state scalar/);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon repositories map all persisted canon and graph row shapes", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const canon = new V2SqliteCanonRepository(db);
    const graph = new (await import("./canon-repository.ts")).V2SqliteGraphStateRepository(db);
    await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_rows" as never, name: "Rows", summary: "Summary" }));
    await canon.createLocation(createV2CanonLocation({ storyWorldId: "world_rows" as never, locationId: "loc" as never, name: "Location", summary: "Loc summary" }));
    await canon.createCharacter(createV2CanonCharacter({ storyWorldId: "world_rows" as never, characterId: "char" as never, name: "Character", summary: "Char summary", homeLocationId: "loc" as never }));
    await canon.createFact(createV2CanonFact({ storyWorldId: "world_rows" as never, factId: "fact", text: "Fact", visibility: "creator_only" }));
    await canon.createRule(createV2CanonRule({ storyWorldId: "world_rows" as never, ruleId: "rule", text: "Rule", severity: "guideline" }));
    await canon.createTimelineEvent(createV2CanonTimelineEvent({ storyWorldId: "world_rows" as never, timelineEventId: "event", localDate: "2026-08-13", title: "Event", summary: "Event summary" }));
    const arc = await graph.createArc({ storyWorldId: "world_rows", arcId: "arc", title: "Arc", summary: "Arc summary" });
    const scene = await graph.createScene({ storyWorldId: "world_rows", sceneId: "scene", arcId: arc.arcId, title: "Scene", body: "Body", isEntry: true });
    await graph.createChoice({ storyWorldId: "world_rows", choiceId: "choice", sourceSceneId: scene.sceneId, targetSceneId: scene.sceneId, label: "Choice", gates: [], consequences: [] });
    await graph.createStateVariable({ storyWorldId: "world_rows", key: "Flag", valueType: "boolean", defaultValue: false });
    assert.equal((await canon.listWorlds())[0]?.summary, "Summary");
    assert.equal((await canon.listLocations("world_rows" as never))[0]?.summary, "Loc summary");
    assert.equal((await canon.listCharacters("world_rows" as never))[0]?.homeLocationId, "loc");
    assert.equal((await canon.listFacts("world_rows" as never))[0]?.visibility, "creator_only");
    assert.equal((await canon.listRules("world_rows" as never))[0]?.severity, "guideline");
    assert.equal((await canon.listTimelineEvents("world_rows" as never))[0]?.summary, "Event summary");
    assert.equal((await graph.listArcs("world_rows" as never))[0]?.summary, "Arc summary");
    assert.equal((await graph.listScenes("world_rows" as never))[0]?.body, "Body");
    assert.equal((await graph.listChoices("world_rows" as never))[0]?.targetSceneId, "scene");
  } finally {
    db.close();
    cleanup();
  }
});
