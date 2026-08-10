import assert from "node:assert/strict";
import test from "node:test";

import {
  ChatBackgroundKind,
  DEFAULT_APPEARANCE_OWNER_KEY,
  MAX_BACKGROUND_IMAGE_REF_LENGTH,
  MAX_CHAT_BACKGROUND_ITEMS,
  createAppearanceSettings,
  createDefaultAppearanceSettings,
  defaultChatBackground,
} from "./index.ts";

const VALID_INPUT = {
  id: "appearance-local-user",
  ownerKey: DEFAULT_APPEARANCE_OWNER_KEY,
  themeId: "blossom",
  chatBackground: {
    kind: ChatBackgroundKind.CUSTOM,
    imageRef: "data:image/jpeg;base64,aGVsbG8=",
    opacity: 0.6,
    blur: 4,
  },
  updatedAt: "2026-08-08T10:00:00.000Z",
} as const;

test("creates appearance settings with a custom chat background", () => {
  const settings = createAppearanceSettings({ ...VALID_INPUT });
  assert.equal(settings.themeId, "blossom");
  assert.equal(settings.chatBackground.kind, ChatBackgroundKind.CUSTOM);
  assert.equal(settings.chatBackground.imageRef, "data:image/jpeg;base64,aGVsbG8=");
  assert.equal(settings.chatBackground.opacity, 0.6);
  assert.equal(settings.chatBackground.blur, 4);
});

test("accepts imported chat background library items", () => {
  const settings = createAppearanceSettings({
    ...VALID_INPUT,
    chatBackground: {
      ...VALID_INPUT.chatBackground,
      items: [
        {
          id: "bg-1",
          label: "夜色窗边",
          kind: ChatBackgroundKind.CUSTOM,
          imageRef: "data:image/png;base64,aGVsbG8=",
          createdAt: "2026-08-08T10:01:00.000Z",
        },
      ],
    },
  });
  assert.equal(settings.chatBackground.items?.[0]?.label, "夜色窗边");
  settings.chatBackground.items?.length && ((settings.chatBackground.items[0] as { label: string }).label = "changed");
  const copied = createAppearanceSettings({ ...settings });
  assert.equal(copied.chatBackground.items?.[0]?.label, "changed");
});

test("rejects too many or invalid background library items", () => {
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          ...VALID_INPUT.chatBackground,
          items: Array.from({ length: MAX_CHAT_BACKGROUND_ITEMS + 1 }, (_, index) => ({
            id: `bg-${index}`,
            label: `背景 ${index}`,
            kind: ChatBackgroundKind.CUSTOM,
            imageRef: "data:image/png;base64,aGVsbG8=",
            createdAt: "2026-08-08T10:01:00.000Z",
          })),
        },
      }),
    { name: "TypeError", message: /cannot contain more/ },
  );
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          ...VALID_INPUT.chatBackground,
          items: [{ id: "bg-1", label: "bad", kind: "theme", imageRef: "data:image/png;base64,aGVsbG8=", createdAt: "2026-08-08T10:01:00.000Z" } as never],
        },
      }),
    { name: "TypeError", message: /kind/ },
  );
});

test("creates default appearance settings for an owner", () => {
  const settings = createDefaultAppearanceSettings("local-user", "2026-08-08T10:00:00.000Z");
  assert.equal(settings.id, "appearance-local-user");
  assert.equal(settings.themeId, "dawn");
  assert.deepEqual(settings.chatBackground, {
    kind: ChatBackgroundKind.THEME,
    opacity: 0.4,
    blur: 0,
  });
  assert.equal(defaultChatBackground().kind, ChatBackgroundKind.THEME);
});

test("accepts theme background without an image reference", () => {
  const settings = createAppearanceSettings({
    ...VALID_INPUT,
    chatBackground: { kind: ChatBackgroundKind.THEME, opacity: 0.3, blur: 0 },
  });
  assert.equal(settings.chatBackground.imageRef, undefined);
});

test("validates an optional image reference even on theme backgrounds", () => {
  // 主题背景下若提供 imageRef，仍应走 assertBackgroundImageRef 的放行分支
  const settings = createAppearanceSettings({
    ...VALID_INPUT,
    chatBackground: {
      kind: ChatBackgroundKind.THEME,
      imageRef: "data:image/png;base64,aGVsbG8=",
      opacity: 0.3,
      blur: 0,
    },
  });
  assert.equal(settings.chatBackground.imageRef, "data:image/png;base64,aGVsbG8=");

  // 主题背景下若提供非法 imageRef，仍应抛出校验错误
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          kind: ChatBackgroundKind.THEME,
          imageRef: "javascript:alert(1)",
          opacity: 0.3,
          blur: 0,
        },
      }),
    { name: "TypeError", message: /data:image/ },
  );
});

test("rejects invalid theme ids", () => {
  for (const themeId of ["", "Blossom", "樱语", "-bad", "a".repeat(65)]) {
    assert.throws(
      () => createAppearanceSettings({ ...VALID_INPUT, themeId }),
      { name: "TypeError" },
      `themeId=${themeId}`,
    );
  }
});

test("requires an image reference for custom backgrounds", () => {
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: { kind: ChatBackgroundKind.CUSTOM, opacity: 0.5, blur: 0 },
      }),
    { name: "TypeError", message: /imageRef/ },
  );
});

test("rejects disallowed image reference sources and oversized payloads", () => {
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          kind: ChatBackgroundKind.CUSTOM,
          imageRef: "file:///etc/passwd",
          opacity: 0.5,
          blur: 0,
        },
      }),
    { name: "TypeError", message: /data:image/ },
  );
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          kind: ChatBackgroundKind.CUSTOM,
          imageRef: `data:image/png;base64,${"a".repeat(MAX_BACKGROUND_IMAGE_REF_LENGTH)}`,
          opacity: 0.5,
          blur: 0,
        },
      }),
    { name: "TypeError", message: /maximum allowed length/ },
  );
});

test("rejects out-of-range opacity, blur and unknown background kinds", () => {
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: { kind: ChatBackgroundKind.THEME, opacity: 1.2, blur: 0 },
      }),
    { name: "TypeError", message: /opacity/ },
  );
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: { kind: ChatBackgroundKind.THEME, opacity: 0.5, blur: 99 },
      }),
    { name: "TypeError", message: /blur/ },
  );
  assert.throws(
    () =>
      createAppearanceSettings({
        ...VALID_INPUT,
        chatBackground: {
          kind: "wallpaper",
          opacity: 0.5,
          blur: 0,
        } as never,
      }),
    { name: "TypeError", message: /kind/ },
  );
});

test("rejects malformed timestamps and non-object backgrounds", () => {
  assert.throws(
    () => createAppearanceSettings({ ...VALID_INPUT, updatedAt: "not-a-date" }),
    { name: "TypeError", message: /updatedAt/ },
  );
  assert.throws(
    () => createAppearanceSettings({ ...VALID_INPUT, chatBackground: null as never }),
    { name: "TypeError", message: /chatBackground/ },
  );
});
