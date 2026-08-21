import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonRule,
  createV2CanonTimelineEvent,
  createV2CanonWorld,
  assertV2ExpectedRevision,
} from "./canon.ts";
import { buildV2CharacterContext } from "./character-context.ts";
import { V2DomainError } from "../shared/index.ts";

test("V2 canon domain creates immutable world and trims user text", () => {
  const world = createV2CanonWorld({
    storyWorldId: "world_a" as never,
    name: "  World A  ",
    summary: "  Local creator world  ",
  });
  assert.deepEqual(world, {
    storyWorldId: "world_a",
    name: "World A",
    summary: "Local creator world",
    revision: 1,
  });
});

test("V2 canon domain rejects cross-world character home locations", () => {
  const homeLocation = createV2CanonLocation({
    storyWorldId: "world_a" as never,
    locationId: "loc_a" as never,
    name: "A",
  });
  assert.throws(
    () => createV2CanonCharacter({
      storyWorldId: "world_b" as never,
      characterId: "char_b" as never,
      name: "B",
      homeLocation,
    }),
    (error) => error instanceof V2DomainError && error.code === "CROSS_WORLD_REFERENCE",
  );
});

test("V2 canon domain validates enum and date boundaries", () => {
  assert.throws(
    () => createV2CanonFact({
      storyWorldId: "world_a" as never,
      factId: "fact_a",
      text: "Fact",
      visibility: "public" as never,
    }),
    (error) => error instanceof V2DomainError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () => createV2CanonTimelineEvent({
      storyWorldId: "world_a" as never,
      timelineEventId: "event_a",
      localDate: "tomorrow",
      title: "Bad date",
    }),
    (error) => error instanceof V2DomainError && error.code === "INVALID_INPUT",
  );
  assert.throws(() => createV2CanonWorld({ storyWorldId: "", name: "World" }), /storyWorldId/);
  assert.throws(() => createV2CanonWorld({ storyWorldId: "world", name: "" }), /name/);
  assert.throws(() => createV2CanonLocation({ storyWorldId: "world", locationId: "location", name: "x".repeat(121) }), /name/);
  assert.throws(() => createV2CanonCharacter({ storyWorldId: "world", characterId: "character", name: "Character", homeLocationId: "" }), /homeLocationId/);
  assert.throws(() => createV2CanonRule({ storyWorldId: "world", ruleId: "rule", text: "Rule", severity: "invalid" as never }), /severity/);
  assert.throws(() => createV2CanonTimelineEvent({ storyWorldId: "world", timelineEventId: "event", localDate: "2026-01-01", title: "Event", summary: "x".repeat(1201) }), /summary/);
});

test("V2 canon domain rejects stale expected revisions", () => {
  assert.throws(() => assertV2ExpectedRevision(2, 1), (error) => error instanceof V2DomainError && error.code === "STALE_REVISION");
});

test("character profile and context builder remain scoped and deterministic", () => {
  const world = createV2CanonWorld({ storyWorldId: "world", name: "World" });
  const primary = createV2CanonCharacter({ storyWorldId: "world", characterId: "a", name: "A", profile: { aliases: ["Alpha"], tags: ["hero"], persona: { traits: ["brave"] } } });
  const other = createV2CanonCharacter({ storyWorldId: "world", characterId: "b", name: "B" });
  const input = { world, characters: [primary, other], relationships: [], task: "chat" as const, primaryCharacterId: "a", currentInput: "hello" };
  const context = buildV2CharacterContext(input);
  assert.deepEqual(context.stable.characters.map((character) => character.characterId), ["a"]);
  assert.equal(context.contextHash, buildV2CharacterContext(input).contextHash);
});

test("character context builder omits dynamic fields from snapshot when budget excludes them", () => {
  const world = createV2CanonWorld({ storyWorldId: "world_budget", name: "World" });
  const character = createV2CanonCharacter({ storyWorldId: "world_budget", characterId: "char_budget", name: "A" });
  const context = buildV2CharacterContext({
    world,
    characters: [character],
    relationships: [],
    task: "chat",
    primaryCharacterId: "char_budget",
    tokenBudget: 1,
    conversationSummary: "this summary should not fit",
    recentMessages: ["this message should not fit"],
    currentInput: "this input should not fit",
  });
  assert.equal(context.dynamic.conversationSummary, undefined);
  assert.deepEqual(context.dynamic.recentMessages, []);
  assert.equal(context.runtime.currentInput, undefined);
  assert.ok(context.omittedSources.some((source) => source.path === "conversation.summary"));
  assert.ok(context.omittedSources.some((source) => source.path === "conversation.messages.0"));
  assert.ok(context.omittedSources.some((source) => source.path === "runtime.currentInput"));
});
