import type { AppearanceSettingsId, StoryWorldId, WorldLoreEntryId } from "./ids.ts";

/** 聊天背景模式：跟随皮肤主题或使用自定义导入图�?*/
export const ChatBackgroundKindDto = {
  THEME: "theme",
  CUSTOM: "custom",
} as const;

export type ChatBackgroundKindDto =
  (typeof ChatBackgroundKindDto)[keyof typeof ChatBackgroundKindDto];

export interface ChatBackgroundItemDto {
  id: string;
  label: string;
  kind: typeof ChatBackgroundKindDto.CUSTOM;
  imageRef: string;
  createdAt: string;
}

export interface ChatBackgroundSettingsDto {
  kind: ChatBackgroundKindDto;
  /** kind �?custom 时必填：data:image/、media:// �?http(s) 图片引用 */
  imageRef?: string;
  /** 背景不透明�?0 ~ 1 */
  opacity: number;
  /** 背景虚化像素 0 ~ 40 */
  blur: number;
  /** 用户导入的可切换背景库；主题默认背景由前端合成 */
  items?: readonly ChatBackgroundItemDto[];
}

export interface AppearanceSettingsDto {
  id: AppearanceSettingsId;
  ownerKey: string;
  themeId: string;
  chatBackground: ChatBackgroundSettingsDto;
  updatedAt: string;
}

/** PUT /v1/appearance-settings 请求体：全量替换外观设置 */
export interface UpdateAppearanceSettingsRequest {
  themeId: string;
  chatBackground: ChatBackgroundSettingsDto;
}

export interface WorldLoreEntryDto {
  id: WorldLoreEntryId;
  storyWorldId: StoryWorldId;
  category: string;
  title: string;
  content: string;
  tags: readonly string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorldLoreEntryRequest {
  id: WorldLoreEntryId;
  storyWorldId: StoryWorldId;
  category: string;
  title: string;
  content: string;
  tags?: readonly string[];
  isEnabled?: boolean;
}

export interface UpdateWorldLoreEntryRequest {
  category?: string;
  title?: string;
  content?: string;
  tags?: readonly string[];
  isEnabled?: boolean;
}

export const LlmProviderProtocolDto = {
  OPENAI_COMPATIBLE: "OPENAI_COMPATIBLE",
  ANTHROPIC: "ANTHROPIC",
} as const;

export type LlmProviderProtocolDto = (typeof LlmProviderProtocolDto)[keyof typeof LlmProviderProtocolDto];

export interface LlmProviderProfileDto {
  id: string;
  name: string;
  protocol: LlmProviderProtocolDto;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMask?: string;
  source: "database" | "environment";
  createdAt: string;
  updatedAt: string;
}

export interface SaveLlmProviderProfileRequest {
  id: string;
  name: string;
  protocol: LlmProviderProtocolDto;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  apiKey?: string;
  isActive?: boolean;
}

export interface ComfyUiSettingsDto {
  id: "default";
  baseUrl: string;
  timeoutMs: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled: boolean;
  updatedAt: string;
}

export interface UpdateComfyUiSettingsRequest {
  baseUrl: string;
  timeoutMs?: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled?: boolean;
}
