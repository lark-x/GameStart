import assert from "node:assert/strict";
import test from "node:test";

import {
  ChatBackgroundKind,
  createAppearanceSettings,
  createDefaultAppearanceSettings,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const settings = createAppearanceSettings({
  id: "appearance-local-user",
  ownerKey: "local-user",
  themeId: "blossom",
  chatBackground: {
    kind: ChatBackgroundKind.CUSTOM,
    imageRef: "data:image/jpeg;base64,aGVsbG8=",
    opacity: 0.55,
    blur: 6,
    items: [{ id: "bg-1", label: "夜色窗边", kind: ChatBackgroundKind.CUSTOM, imageRef: "data:image/png;base64,aGVsbG8=", createdAt: "2026-08-08T10:01:00.000Z" }],
  },
  updatedAt: "2026-08-08T10:00:00.000Z",
});

test("stores appearance settings by owner key with defensive copies", async () => {
  const repositories = createInMemoryRepositories({ appearanceSettings: [settings] });
  assert.ok(repositories.appearanceSettings);
  assert.equal(
    await repositories.appearanceSettings.getByOwnerKey("missing"),
    undefined,
  );
  const loaded = await repositories.appearanceSettings.getByOwnerKey("local-user");
  assert.deepEqual(loaded, settings);
  assert.ok(loaded);
  loaded.chatBackground.opacity = 0.01;
  (loaded.chatBackground.items?.[0] as { label: string }).label = "mutated";
  assert.equal(
    (await repositories.appearanceSettings.getByOwnerKey("local-user"))?.chatBackground.opacity,
    0.55,
  );
  assert.equal(
    (await repositories.appearanceSettings.getByOwnerKey("local-user"))?.chatBackground.items?.[0]?.label,
    "夜色窗边",
  );
});

test("saves new appearance settings and upserts by owner key", async () => {
  const repositories = createInMemoryRepositories();
  assert.ok(repositories.appearanceSettings);
  const initial = createDefaultAppearanceSettings("local-user", "2026-08-08T10:00:00.000Z");
  await repositories.appearanceSettings.save(initial);
  assert.equal(
    (await repositories.appearanceSettings.getByOwnerKey("local-user"))?.themeId,
    "dawn",
  );
  const updated = createAppearanceSettings({
    ...settings,
    chatBackground: { kind: ChatBackgroundKind.THEME, opacity: 0.4, blur: 0 },
    updatedAt: "2026-08-08T11:00:00.000Z",
  });
  await repositories.appearanceSettings.save(updated);
  const loaded = await repositories.appearanceSettings.getByOwnerKey("local-user");
  assert.equal(loaded?.chatBackground.kind, ChatBackgroundKind.THEME);
  assert.equal(loaded?.updatedAt, "2026-08-08T11:00:00.000Z");
});

test("rejects duplicate owner keys across different ids", async () => {
  const repositories = createInMemoryRepositories({ appearanceSettings: [settings] });
  assert.ok(repositories.appearanceSettings);
  await assert.rejects(
    repositories.appearanceSettings.save(
      createAppearanceSettings({
        ...settings,
        id: "appearance-other",
        themeId: "ocean",
      }),
    ),
    { name: "TypeError", message: /owner key/ },
  );
  assert.throws(
    () =>
      createInMemoryRepositories({
        appearanceSettings: [
          settings,
          createAppearanceSettings({ ...settings, id: "appearance-other" }),
        ],
      }),
    { name: "TypeError", message: /owner key/ },
  );
});

test("rejects invalid appearance settings on save and seed", async () => {
  const repositories = createInMemoryRepositories();
  assert.ok(repositories.appearanceSettings);
  await assert.rejects(
    repositories.appearanceSettings.save({ ...settings, themeId: "INVALID THEME" }),
    { name: "TypeError" },
  );
  assert.throws(
    () =>
      createInMemoryRepositories({
        appearanceSettings: [{ ...settings, themeId: "INVALID THEME" }],
      }),
    { name: "TypeError" },
  );
  assert.throws(
    () =>
      createInMemoryRepositories({
        appearanceSettings: [settings, { ...settings }],
      }),
    { name: "TypeError", message: /Duplicate appearanceSettings id/ },
  );
});
