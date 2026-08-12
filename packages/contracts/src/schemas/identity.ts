import { CharacterRole, StoryMode } from "../character.ts";
import { ImageAssetCategory } from "../dispatch.ts";
import { ChatBackgroundKindDto } from "../settings.ts";
import type { CreateStickerInput, CreateStickerPackRequest } from "../media.ts";
import type { ActorSessionSwitchRequest, CreateRelationshipEdgeRequest, UpdateRelationshipEdgeRequest } from "../world.ts";
import type { CreateWorldLoreEntryRequest, UpdateAppearanceSettingsRequest, UpdateWorldLoreEntryRequest } from "../settings.ts";
import { type JsonSchema, idSchema, nonEmptyStringSchema, timestampSchema, stringListSchema, workflowObjectSchema } from "./shared.ts";

export const characterSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character",
  title: "Character",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    displayName: nonEmptyStringSchema,
    role: {
      type: "string",
      enum: [CharacterRole.AI, CharacterRole.USER],
    },
    storyWorldId: idSchema,
    timezone: nonEmptyStringSchema,
    birthDate: { type: "string", format: "date" },
    personaPromptRef: nonEmptyStringSchema,
    visualPromptRef: nonEmptyStringSchema,
  },
  required: ["id", "displayName", "role", "storyWorldId", "timezone"],
} as const satisfies JsonSchema;

export const characterVisualIdentitySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:character-visual-identity",
  title: "CharacterVisualIdentity",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    characterId: idSchema,
    storyWorldId: idSchema,
    positivePrompt: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    styleTags: stringListSchema,
    referenceImageRefs: stringListSchema,
    revision: { type: "number", minimum: 1 },
    updatedAt: timestampSchema,
  },
  required: [
    "id",
    "characterId",
    "storyWorldId",
    "positivePrompt",
    "styleTags",
    "referenceImageRefs",
    "revision",
    "updatedAt",
  ],
} as const satisfies JsonSchema;

export const imageWorkflowTemplateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:image-workflow-template",
  title: "ImageWorkflowTemplate",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    version: nonEmptyStringSchema,
    workflow: workflowObjectSchema,
    positivePromptPath: stringListSchema,
    negativePromptPath: stringListSchema,
    seedPath: stringListSchema,
  },
  required: ["id", "version", "workflow", "positivePromptPath"],
} as const satisfies JsonSchema;

export const compiledImageWorkflowSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:compiled-image-workflow",
  title: "CompiledImageWorkflow",
  type: "object",
  additionalProperties: false,
  properties: {
    workflowVersion: nonEmptyStringSchema,
    prompt: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    seed: { type: "number", minimum: 0 },
    workflow: workflowObjectSchema,
  },
  required: ["workflowVersion", "prompt", "workflow"],
} as const satisfies JsonSchema;

export const validateImageWorkflowResultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:validate-image-workflow-result",
  title: "ValidateImageWorkflowResult",
  type: "object",
  additionalProperties: false,
  properties: {
    valid: { type: "boolean", enum: [true] },
    id: idSchema,
    version: nonEmptyStringSchema,
    checkedBindings: stringListSchema,
  },
  required: ["valid", "id", "version", "checkedBindings"],
} as const satisfies JsonSchema;

export const stickerPackSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:sticker-pack",
  title: "StickerPack",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    name: nonEmptyStringSchema,
    sourceRef: nonEmptyStringSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "name", "createdAt"],
} as const satisfies JsonSchema;

export const stickerSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:sticker",
  title: "Sticker",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    packId: idSchema,
    storyWorldId: idSchema,
    label: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    tags: stringListSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "packId", "storyWorldId", "label", "mediaRef", "tags", "createdAt"],
} as const satisfies JsonSchema;

export const createStickerInputSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-sticker-input",
  title: "CreateStickerInput",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    label: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    tags: stringListSchema,
  },
  required: ["id", "label", "mediaRef"],
} as const satisfies JsonSchema;

export const createStickerPackRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-sticker-pack-request",
  title: "CreateStickerPackRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    name: nonEmptyStringSchema,
    sourceRef: nonEmptyStringSchema,
    createdAt: timestampSchema,
    stickers: { type: "array", items: createStickerInputSchema },
  },
  required: ["id", "storyWorldId", "name", "createdAt", "stickers"],
} as const satisfies JsonSchema;

export const worldLoreEntrySchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:world-lore-entry",
  title: "WorldLoreEntry",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "category", "title", "content", "tags", "isEnabled", "createdAt", "updatedAt"],
} as const satisfies JsonSchema;

export const createWorldLoreEntryRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-world-lore-entry-request",
  title: "CreateWorldLoreEntryRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
  },
  required: ["id", "storyWorldId", "category", "title", "content"],
} as const satisfies JsonSchema;

export const updateWorldLoreEntryRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-world-lore-entry-request",
  title: "UpdateWorldLoreEntryRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    category: nonEmptyStringSchema,
    title: nonEmptyStringSchema,
    content: nonEmptyStringSchema,
    tags: stringListSchema,
    isEnabled: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const chatBackgroundItemSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:chat-background-item",
  title: "ChatBackgroundItem",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    label: nonEmptyStringSchema,
    kind: { type: "string", enum: [ChatBackgroundKindDto.CUSTOM] },
    imageRef: { type: "string", minLength: 1, maxLength: 2_000_000 },
    createdAt: timestampSchema,
  },
  required: ["id", "label", "kind", "imageRef", "createdAt"],
} as const satisfies JsonSchema;

export const chatBackgroundSettingsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:chat-background-settings",
  title: "ChatBackgroundSettings",
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [ChatBackgroundKindDto.THEME, ChatBackgroundKindDto.CUSTOM],
    },
    imageRef: { type: "string", minLength: 1, maxLength: 2_000_000 },
    opacity: { type: "number", minimum: 0, maximum: 1 },
    blur: { type: "number", minimum: 0, maximum: 40 },
    items: { type: "array", items: chatBackgroundItemSchema },
  },
  required: ["kind", "opacity", "blur"],
} as const satisfies JsonSchema;

export const appearanceSettingsSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:appearance-settings",
  title: "AppearanceSettings",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    ownerKey: nonEmptyStringSchema,
    themeId: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
    chatBackground: chatBackgroundSettingsSchema,
    updatedAt: timestampSchema,
  },
  required: ["id", "ownerKey", "themeId", "chatBackground", "updatedAt"],
} as const satisfies JsonSchema;

export const updateAppearanceSettingsRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-appearance-settings-request",
  title: "UpdateAppearanceSettingsRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    themeId: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
    chatBackground: chatBackgroundSettingsSchema,
  },
  required: ["themeId", "chatBackground"],
} as const satisfies JsonSchema;

export const storyWorldSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:story-world",
  title: "StoryWorld",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    name: nonEmptyStringSchema,
    timezone: nonEmptyStringSchema,
    storyMode: {
      type: "string",
      enum: [StoryMode.STATIC, StoryMode.DYNAMIC],
    },
    relationshipDynamicsEnabled: { type: "boolean" },
  },
  required: [
    "id",
    "name",
    "timezone",
    "storyMode",
    "relationshipDynamicsEnabled",
  ],
} as const satisfies JsonSchema;

export const relationshipStateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:relationship-state",
  title: "RelationshipState",
  type: "object",
  additionalProperties: false,
  properties: {
    affinity: { type: "number", minimum: -100, maximum: 100 },
    trust: { type: "number", minimum: -100, maximum: 100 },
    conflict: { type: "number", minimum: -100, maximum: 100 },
    dependency: { type: "number", minimum: -100, maximum: 100 },
  },
  required: ["affinity", "trust", "conflict", "dependency"],
} as const satisfies JsonSchema;

export const relationshipEdgeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:relationship-edge",
  title: "RelationshipEdge",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    sourceCharacterId: idSchema,
    targetCharacterId: idSchema,
    storyWorldId: idSchema,
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
  required: [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ],
} as const satisfies JsonSchema;

export const createRelationshipEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-relationship-edge-request",
  title: "CreateRelationshipEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    sourceCharacterId: idSchema,
    targetCharacterId: idSchema,
    storyWorldId: idSchema,
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
  required: [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ],
} as const satisfies JsonSchema;

export const updateRelationshipEdgeRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:update-relationship-edge-request",
  title: "UpdateRelationshipEdgeRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    relationshipType: nonEmptyStringSchema,
    initialState: relationshipStateSchema,
    isPublic: { type: "boolean" },
    isBidirectional: { type: "boolean" },
  },
} as const satisfies JsonSchema;

export const actorSessionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:actor-session",
  title: "ActorSession",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    userCharacterId: idSchema,
    startedAt: timestampSchema,
    endedAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "userCharacterId", "startedAt"],
} as const satisfies JsonSchema;

export const actorSessionSwitchRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:actor-session-switch-request",
  title: "ActorSessionSwitchRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    actorSessionId: idSchema,
    nextCharacterId: idSchema,
  },
  required: ["actorSessionId", "nextCharacterId"],
} as const satisfies JsonSchema;
