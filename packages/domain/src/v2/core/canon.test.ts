import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonTimelineEvent,
  createV2CanonWorld,
} from "./canon.ts";
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
});
