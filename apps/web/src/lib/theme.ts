import { computed, reactive, ref } from "vue";
import type { ApiClient } from "../api.js";

/**
 * 界面外观管理：皮肤主题 + 主题装饰 + 聊天背景。
 * 皮肤令牌定义在 src/tailwind.css 的 [data-theme] 块中；
 * 外观设置通过 /v1/appearance-settings 持久化到服务端数据库，
 * localStorage 仅作为首屏防闪烁缓存。
 */
export type ThemeDecoration =
  | "rays"
  | "embers"
  | "petals"
  | "leaves"
  | "bubbles"
  | "stars";

export interface ThemeDefinition {
  id: string;
  label: string;
  /** 切换器色点展示色 */
  dot: string;
  /** 全屏点缀粒子类型 */
  decoration: ThemeDecoration;
  /** 主题符号（横幅、空态等点缀） */
  symbol: string;
  /** 朋友圈横幅标语 */
  tagline: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  { id: "dawn", label: "暖阳", dot: "#b6624b", decoration: "rays", symbol: "☀", tagline: "把今天晒得暖洋洋的。" },
  { id: "dusk", label: "夜幕", dot: "#d98a6f", decoration: "embers", symbol: "☾", tagline: "炉火未熄，故事正好。" },
  { id: "blossom", label: "樱语", dot: "#c05c7a", decoration: "petals", symbol: "❀", tagline: "花瓣落下的时候，心事也被记住了。" },
  { id: "forest", label: "青野", dot: "#5d8a66", decoration: "leaves", symbol: "❦", tagline: "风穿过叶子，生活长出新的枝桠。" },
  { id: "ocean", label: "海盐", dot: "#4e7d96", decoration: "bubbles", symbol: "◌", tagline: "气泡升起来，日子清清爽爽。" },
  { id: "midnight", label: "星夜", dot: "#8f94d8", decoration: "stars", symbol: "✦", tagline: "星星值班的时候，灵感不会打烊。" },
];

export interface ChatBackgroundItem {
  id: string;
  label: string;
  kind: "custom";
  imageRef: string;
  createdAt: string;
}

export interface ChatBackgroundState {
  kind: "theme" | "custom";
  imageRef?: string;
  opacity: number;
  blur: number;
  items: ChatBackgroundItem[];
}

const THEME_STORAGE_KEY = "living-network-theme";
const APPEARANCE_STORAGE_KEY = "living-network-appearance-v1";
const DEFAULT_THEME = "dawn";
export const MAX_CHAT_BACKGROUND_ITEMS = 12;

const DEFAULT_BACKGROUND: ChatBackgroundState = {
  kind: "theme",
  opacity: 0.4,
  blur: 0,
  items: [],
};

/** 自定义聊天背景图压缩参数（服务端上限约 2MB base64） */
const BACKGROUND_MAX_EDGE = 1600;
const BACKGROUND_MAX_LENGTH = 1_500_000;
const BACKGROUND_QUALITIES = [0.82, 0.7, 0.58] as const;

const currentTheme = ref(DEFAULT_THEME);
const chatBackground = reactive<ChatBackgroundState>({ ...DEFAULT_BACKGROUND });
/** none=未连接服务端 synced=已同步 loading=读取中 saving=保存中 error=同步失败（本地缓存仍生效） */
const syncState = ref<"none" | "loading" | "synced" | "saving" | "error">("none");

type AppearanceApi = Pick<
  ApiClient,
  "getAppearanceSettings" | "updateAppearanceSettings"
>;

let apiClient: AppearanceApi | null = null;
/** 本地有未确认同步到服务端的改动时，不用服务端数据覆盖本地 */
let localDirty = false;

const currentThemeMeta = computed<ThemeDefinition>(() => {
  return THEMES.find((theme) => theme.id === currentTheme.value) ?? THEMES[0]!;
});

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function themeExists(id: unknown): id is string {
  return typeof id === "string" && THEMES.some((theme) => theme.id === id);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function isImageRef(value: unknown): value is string {
  return typeof value === "string" && /^(?:data:image\/|media:\/\/|https?:\/\/)/i.test(value);
}

function normalizeBackgroundItem(value: unknown): ChatBackgroundItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!isImageRef(raw.imageRef)) return null;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `background-${Math.random().toString(36).slice(2)}`,
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 48) : "已导入背景",
    kind: "custom",
    imageRef: raw.imageRef,
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

function normalizeBackgroundItems(value: unknown): ChatBackgroundItem[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const items: ChatBackgroundItem[] = [];
  for (const item of source) {
    const normalized = normalizeBackgroundItem(item);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    items.push(normalized);
    if (items.length >= MAX_CHAT_BACKGROUND_ITEMS) break;
  }
  return items;
}

function cloneBackground(background: ChatBackgroundState): ChatBackgroundState {
  const next: ChatBackgroundState = {
    kind: background.kind,
    opacity: background.opacity,
    blur: background.blur,
    items: background.items.map((item) => ({ ...item })),
  };
  if (background.kind === "custom" && background.imageRef) next.imageRef = background.imageRef;
  return next;
}

function normalizeBackground(value: unknown): ChatBackgroundState {
  if (typeof value !== "object" || value === null) return cloneBackground(DEFAULT_BACKGROUND);
  const raw = value as Record<string, unknown>;
  const items = normalizeBackgroundItems(raw.items);
  const hasCustom = raw.kind === "custom" && isImageRef(raw.imageRef);
  if (hasCustom && !items.some((item) => item.imageRef === raw.imageRef)) {
    items.unshift({
      id: "legacy-custom-background",
      label: "已导入背景",
      kind: "custom",
      imageRef: raw.imageRef as string,
      createdAt: new Date().toISOString(),
    });
  }
  const next: ChatBackgroundState = {
    kind: hasCustom ? "custom" : "theme",
    opacity: clampNumber(raw.opacity, 0, 1, DEFAULT_BACKGROUND.opacity),
    blur: clampNumber(raw.blur, 0, 40, DEFAULT_BACKGROUND.blur),
    items: items.slice(0, MAX_CHAT_BACKGROUND_ITEMS),
  };
  if (next.kind === "custom") next.imageRef = raw.imageRef as string;
  return next;
}

function applyState(themeId: string, background: ChatBackgroundState): void {
  currentTheme.value = themeId;
  const next = cloneBackground(background);
  chatBackground.kind = next.kind;
  chatBackground.opacity = next.opacity;
  chatBackground.blur = next.blur;
  chatBackground.items = next.items;
  if (next.imageRef) chatBackground.imageRef = next.imageRef;
  else delete chatBackground.imageRef;
  if (isBrowser()) document.documentElement.dataset.theme = themeId;
}

function readCache(): { themeId: string; background: ChatBackgroundState } | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (themeExists(parsed.themeId)) {
        return { themeId: parsed.themeId, background: normalizeBackground(parsed.chatBackground) };
      }
    }
    // 兼容旧版本只存主题 id 的缓存
    const legacyTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (themeExists(legacyTheme)) {
      return { themeId: legacyTheme, background: cloneBackground(DEFAULT_BACKGROUND) };
    }
  } catch {
    // 缓存损坏时静默回退默认外观
  }
  return null;
}

function writeCache(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ themeId: currentTheme.value, chatBackground: cloneBackground(chatBackground) }),
    );
    window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme.value);
  } catch {
    // 存储配额不足时忽略缓存写入失败
  }
}

async function pullFromServer(): Promise<void> {
  if (!apiClient) return;
  syncState.value = "loading";
  try {
    const result = await apiClient.getAppearanceSettings();
    const data = result?.data;
    if (data && !localDirty) {
      applyState(
        themeExists(data.themeId) ? data.themeId : DEFAULT_THEME,
        normalizeBackground(data.chatBackground),
      );
      writeCache();
    }
    syncState.value = "synced";
  } catch {
    syncState.value = "error";
  }
}

function pushToServer(): void {
  writeCache();
  if (!apiClient) return;
  localDirty = true;
  syncState.value = "saving";
  const payload = {
    themeId: currentTheme.value,
    chatBackground: cloneBackground(chatBackground),
  };
  apiClient
    .updateAppearanceSettings(payload)
    .then(() => {
      localDirty = false;
      syncState.value = "synced";
    })
    .catch(() => {
      syncState.value = "error";
    });
}

/**
 * 应用启动时调用一次：先用本地缓存防闪烁，再从服务端拉取权威设置。
 * 传入 api 后所有外观变更都会持久化到服务端数据库。
 */
export function initTheme(api?: AppearanceApi): void {
  apiClient = api ?? null;
  const cached = readCache();
  if (cached) {
    applyState(cached.themeId, cached.background);
  } else if (isBrowser() && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    applyState("dusk", { ...DEFAULT_BACKGROUND });
  } else {
    applyState(DEFAULT_THEME, { ...DEFAULT_BACKGROUND });
  }
  if (apiClient) void pullFromServer();
}

export function setTheme(id: string): void {
  if (!themeExists(id) || id === currentTheme.value) return;
  applyState(id, { ...chatBackground });
  pushToServer();
}

export function setChatBackground(patch: Partial<ChatBackgroundState>): void {
  const next = normalizeBackground({ ...chatBackground, ...patch });
  applyState(currentTheme.value, next);
  pushToServer();
}

export function createChatBackgroundItem(label: string, imageRef: string): ChatBackgroundItem {
  const cleanLabel = label.replace(/\.[a-z0-9]+$/i, "").trim().slice(0, 48) || "聊天背景";
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return {
    id: `background-${randomId}`,
    label: cleanLabel,
    kind: "custom",
    imageRef,
    createdAt: new Date().toISOString(),
  };
}

/** 读取本地图片文件，压缩为适合做聊天背景的 data URL。 */
export async function importChatBackgroundFile(file: File): Promise<string> {
  // SSR fallback — return data URL when canvas is unavailable
  if (typeof document === "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读取图片失败，请重试"));
      reader.readAsDataURL(file);
    });
  }
  const compressed = await compressChatBackgroundImage(file);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败，请重试"));
    reader.readAsDataURL(compressed);
  });
}

/** 压缩图片为适合上传的 JPEG File。 */
export async function compressChatBackgroundImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件作为聊天背景");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取图片失败，请重试"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解析失败，请换一张试试"));
    element.src = dataUrl;
  });
  const scale = Math.min(1, BACKGROUND_MAX_EDGE / Math.max(image.width, image.height, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(image, 0, 0, width, height);
  for (const quality of BACKGROUND_QUALITIES) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= BACKGROUND_MAX_LENGTH) {
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    }
  }
  throw new Error("图片体积过大，请选择更小的图片");
}

export function useTheme() {
  return {
    currentTheme,
    currentThemeMeta,
    chatBackground,
    syncState,
    setTheme,
    setChatBackground,
    createChatBackgroundItem,
    MAX_CHAT_BACKGROUND_ITEMS,
    THEMES,
  };
}
