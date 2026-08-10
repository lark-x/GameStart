import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

/**
 * 界面外观设置：皮肤主题、聊天背景等"应用级"偏好。
 * 与角色/世界无关，按 ownerKey 归属（本地单用户默认 "local-user"），
 * 通过 API 持久化到数据库，避免只停留在浏览器存储里。
 */
export const ChatBackgroundKind = {
  /** 跟随当前皮肤的主题默认背景 */
  THEME: "theme",
  /** 用户导入的自定义背景图 */
  CUSTOM: "custom",
} as const;

export type ChatBackgroundKind =
  (typeof ChatBackgroundKind)[keyof typeof ChatBackgroundKind];

/** 背景图引用允许的来源前缀（data URL、媒体库引用或 http(s) 链接） */
const ALLOWED_IMAGE_REF_PREFIXES = ["data:image/", "media://", "https://", "http://"] as const;

/** 背景图引用最大长度（约容纳 1.5MB 的 base64 图片，防止超大请求体写库） */
export const MAX_BACKGROUND_IMAGE_REF_LENGTH = 2_000_000;

export const MAX_CHAT_BACKGROUND_BLUR = 40;

export const MAX_CHAT_BACKGROUND_ITEMS = 12;

export const DEFAULT_APPEARANCE_OWNER_KEY = "local-user";

export const DEFAULT_THEME_ID = "dawn";

const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface ChatBackgroundItem {
  id: string;
  label: string;
  kind: typeof ChatBackgroundKind.CUSTOM;
  imageRef: string;
  createdAt: string;
}

export interface ChatBackgroundSettings {
  kind: ChatBackgroundKind;
  /** kind 为 custom 时必填：图片引用（data:image/、media:// 或 http(s) URL） */
  imageRef?: string;
  /** 背景不透明度，0（全透明）~ 1（全显） */
  opacity: number;
  /** 背景虚化像素，0 ~ 40 */
  blur: number;
  /** 用户导入的可切换背景库；主题默认背景由客户端合成，不存入列表 */
  items?: readonly ChatBackgroundItem[];
}

export interface AppearanceSettings {
  id: string;
  ownerKey: string;
  themeId: string;
  chatBackground: ChatBackgroundSettings;
  updatedAt: string;
}

export interface AppearanceSettingsInput {
  id: string;
  ownerKey: string;
  themeId: string;
  chatBackground: ChatBackgroundSettings;
  updatedAt: string;
}

export function assertThemeId(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);
  if (!THEME_ID_PATTERN.test(value)) {
    throw new TypeError(
      `${field} must be 1-64 lowercase alphanumeric characters or hyphens`,
    );
  }
}

export function assertBackgroundImageRef(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);
  if (value.length > MAX_BACKGROUND_IMAGE_REF_LENGTH) {
    throw new TypeError(`${field} exceeds the maximum allowed length`);
  }
  if (!ALLOWED_IMAGE_REF_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    throw new TypeError(
      `${field} must start with data:image/, media://, https:// or http://`,
    );
  }
}

function assertRatio(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new TypeError(`${field} must be a number between 0 and 1`);
  }
}

function assertBlur(value: unknown, field: string): asserts value is number {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    value < 0 ||
    value > MAX_CHAT_BACKGROUND_BLUR
  ) {
    throw new TypeError(`${field} must be a number between 0 and ${MAX_CHAT_BACKGROUND_BLUR}`);
  }
}

export function assertChatBackgroundItem(value: unknown, field = "chatBackground.items[]"): asserts value is ChatBackgroundItem {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${field} must be an object`);
  }
  const item = value as ChatBackgroundItem;
  assertNonEmptyString(item.id, `${field}.id`);
  assertNonEmptyString(item.label, `${field}.label`);
  if (item.kind !== ChatBackgroundKind.CUSTOM) {
    throw new TypeError(`${field}.kind must be custom`);
  }
  assertBackgroundImageRef(item.imageRef, `${field}.imageRef`);
  assertIsoTimestamp(item.createdAt, `${field}.createdAt`);
}

export function assertChatBackgroundItems(value: unknown, field = "chatBackground.items"): asserts value is readonly ChatBackgroundItem[] {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
  if (value.length > MAX_CHAT_BACKGROUND_ITEMS) {
    throw new TypeError(`${field} cannot contain more than ${MAX_CHAT_BACKGROUND_ITEMS} items`);
  }
  const ids = new Set<string>();
  for (const [index, item] of value.entries()) {
    assertChatBackgroundItem(item, `${field}[${index}]`);
    if (ids.has(item.id)) {
      throw new TypeError(`${field} contains duplicate item ids`);
    }
    ids.add(item.id);
  }
}

export function assertChatBackground(value: unknown, field = "chatBackground"): asserts value is ChatBackgroundSettings {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`${field} must be an object`);
  }
  const background = value as ChatBackgroundSettings;
  if (!Object.values(ChatBackgroundKind).includes(background.kind)) {
    throw new TypeError(`${field}.kind must be one of ${Object.values(ChatBackgroundKind).join(", ")}`);
  }
  if (background.kind === ChatBackgroundKind.CUSTOM) {
    assertBackgroundImageRef(background.imageRef, `${field}.imageRef`);
  } else if (background.imageRef !== undefined) {
    assertBackgroundImageRef(background.imageRef, `${field}.imageRef`);
  }
  assertRatio(background.opacity, `${field}.opacity`);
  assertBlur(background.blur, `${field}.blur`);
  assertChatBackgroundItems(background.items, `${field}.items`);
}

export function defaultChatBackground(): ChatBackgroundSettings {
  return { kind: ChatBackgroundKind.THEME, opacity: 0.4, blur: 0 };
}

/** 指定属主不存在记录时使用的默认外观设置。 */
export function createDefaultAppearanceSettings(
  ownerKey: string,
  updatedAt: string,
): AppearanceSettings {
  return createAppearanceSettings({
    id: `appearance-${ownerKey}`,
    ownerKey,
    themeId: DEFAULT_THEME_ID,
    chatBackground: defaultChatBackground(),
    updatedAt,
  });
}

export function createAppearanceSettings(input: AppearanceSettingsInput): AppearanceSettings {
  assertNonEmptyString(input.id, "appearanceSettings.id");
  assertNonEmptyString(input.ownerKey, "appearanceSettings.ownerKey");
  assertThemeId(input.themeId, "appearanceSettings.themeId");
  assertChatBackground(input.chatBackground, "appearanceSettings.chatBackground");
  assertIsoTimestamp(input.updatedAt, "appearanceSettings.updatedAt");
  const background: ChatBackgroundSettings = {
    kind: input.chatBackground.kind,
    opacity: input.chatBackground.opacity,
    blur: input.chatBackground.blur,
  };
  if (input.chatBackground.imageRef !== undefined) {
    background.imageRef = input.chatBackground.imageRef;
  }
  if (input.chatBackground.items !== undefined) {
    background.items = input.chatBackground.items.map((item) => ({ ...item }));
  }
  const settings: AppearanceSettings = {
    id: input.id,
    ownerKey: input.ownerKey,
    themeId: input.themeId,
    chatBackground: background,
    updatedAt: input.updatedAt,
  };
  assertAppearanceSettings(settings);
  return settings;
}

export function assertAppearanceSettings(settings: AppearanceSettings): void {
  assertNonEmptyString(settings.id, "appearanceSettings.id");
  assertNonEmptyString(settings.ownerKey, "appearanceSettings.ownerKey");
  assertThemeId(settings.themeId, "appearanceSettings.themeId");
  assertChatBackground(settings.chatBackground, "appearanceSettings.chatBackground");
  assertIsoTimestamp(settings.updatedAt, "appearanceSettings.updatedAt");
}
