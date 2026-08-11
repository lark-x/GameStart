import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  ChatBackgroundKindDto,
  StoryMode,
  actorSessionSchema,
  actorSessionSwitchRequestSchema,
  appearanceSettingsSchema,
  characterSchema,
  characterVisualIdentitySchema,
  chatBackgroundSettingsSchema,
  updateAppearanceSettingsRequestSchema,
  imageWorkflowTemplateSchema,
  compiledImageWorkflowSchema,
  validateImageWorkflowResultSchema,
  stickerPackSchema,
  stickerSchema,
  createStickerInputSchema,
  createStickerPackRequestSchema,
  conversationMemberSchema,
  conversationSchema,
  contractSchemas,
  createConversationRequestSchema,
  messageSchema,
  MessageKind,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  memoryItemSchema,
  eventRecurrenceSchema,
  ScheduledOccurrenceStatus,
  scheduledOccurrenceSchema,
  worldCalendarSchema,
  TriggerSource,
  worldEventDefinitionSchema,
  createWorldEventDefinitionRequestSchema,
  updateWorldEventDefinitionRequestSchema,
  characterPlanSchema,
  eventExecutionSchema,
  proactiveMessageBudgetSchema,
  PlanInterruptibility,
  EventExecutionStatus,
  ActionKind,
  ActionStatus,
  ImageJobKind,
  ImageJobStatus,
  ImageAssetCategory,
  MomentDraftStatus,
  MomentVisibility,
  behaviorActionSchema,
  imageJobSchema,
  imageAssetSchema,
  momentDraftSchema,
  momentSchema,
  momentInteractionSchema,
  createMomentInteractionRequestSchema,
  MomentInteractionKind,
  relationshipEdgeSchema,
  createRelationshipEdgeRequestSchema,
  updateRelationshipEdgeRequestSchema,
  relationshipStateSchema,
  sendMessageRequestSchema,
  requestConversationImageRequestSchema,
  storyWorldSchema,
} from "./index.ts";

test("exports the role and story mode enums used by API payloads", () => {
  assert.deepEqual(CharacterRole, { AI: "AI", USER: "USER" });
  assert.deepEqual(StoryMode, { STATIC: "STATIC", DYNAMIC: "DYNAMIC" });
});

test("character and world schemas define closed objects with required identity fields", () => {
  assert.equal(characterSchema.type, "object");
  assert.equal(characterSchema.additionalProperties, false);
  assert.deepEqual(characterSchema.properties?.role.enum, ["AI", "USER"]);
  assert.deepEqual(characterSchema.required, [
    "id",
    "displayName",
    "role",
    "storyWorldId",
    "timezone",
  ]);

  assert.equal(storyWorldSchema.additionalProperties, false);
  assert.deepEqual(storyWorldSchema.properties?.storyMode.enum, ["STATIC", "DYNAMIC"]);
  assert.deepEqual(storyWorldSchema.required, [
    "id",
    "name",
    "timezone",
    "storyMode",
    "relationshipDynamicsEnabled",
  ]);
});

test("visual identity and workflow schemas keep prompt layers and injection paths explicit", () => {
  assert.equal(characterVisualIdentitySchema.additionalProperties, false);
  assert.deepEqual(characterVisualIdentitySchema.required, [
    "id",
    "characterId",
    "storyWorldId",
    "positivePrompt",
    "styleTags",
    "referenceImageRefs",
    "revision",
    "updatedAt",
  ]);
  assert.equal(imageWorkflowTemplateSchema.properties?.workflow.additionalProperties, true);
  assert.equal(imageWorkflowTemplateSchema.properties?.positivePromptPath.items?.type, "string");
  assert.deepEqual(compiledImageWorkflowSchema.required, ["workflowVersion", "prompt", "workflow"]);
  assert.deepEqual(validateImageWorkflowResultSchema.required, [
    "valid",
    "id",
    "version",
    "checkedBindings",
  ]);
});

test("sticker schemas keep imported media metadata and tags explicit", () => {
  assert.deepEqual(stickerPackSchema.required, ["id", "storyWorldId", "name", "createdAt"]);
  assert.deepEqual(stickerSchema.required, [
    "id",
    "packId",
    "storyWorldId",
    "label",
    "mediaRef",
    "tags",
    "createdAt",
  ]);
  assert.equal(stickerSchema.additionalProperties, false);
  assert.deepEqual(createStickerInputSchema.required, ["id", "label", "mediaRef"]);
  assert.deepEqual(createStickerPackRequestSchema.required, [
    "id",
    "storyWorldId",
    "name",
    "createdAt",
    "stickers",
  ]);
});

test("relationship schemas expose all metrics and their domain range", () => {
  assert.deepEqual(Object.keys(relationshipStateSchema.properties ?? {}).sort(), [
    "affinity",
    "conflict",
    "dependency",
    "trust",
  ]);
  const metrics = ["affinity", "trust", "conflict", "dependency"] as const;
  for (const metric of metrics) {
    const metricSchema = relationshipStateSchema.properties?.[metric];
    assert.equal(metricSchema?.minimum, -100);
    assert.equal(metricSchema?.maximum, 100);
  }

  assert.equal(relationshipEdgeSchema.properties?.initialState, relationshipStateSchema);
  assert.deepEqual(relationshipEdgeSchema.required, [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ]);
});

test("relationship CRUD schemas keep identity and partial update boundaries explicit", () => {
  assert.equal(createRelationshipEdgeRequestSchema.additionalProperties, false);
  assert.deepEqual(createRelationshipEdgeRequestSchema.required, [
    "id",
    "sourceCharacterId",
    "targetCharacterId",
    "storyWorldId",
    "relationshipType",
    "initialState",
    "isPublic",
    "isBidirectional",
  ]);
  assert.equal(updateRelationshipEdgeRequestSchema.additionalProperties, false);
  assert.equal("required" in updateRelationshipEdgeRequestSchema, false);
});

test("event CRUD schemas keep required creation fields and partial updates explicit", () => {
  assert.equal(createWorldEventDefinitionRequestSchema.additionalProperties, false);
  assert.deepEqual(createWorldEventDefinitionRequestSchema.required, [
    "id",
    "storyWorldId",
    "eventKey",
    "name",
    "triggerSource",
    "recurrence",
    "targetCharacterIds",
    "createdAt",
  ]);
  assert.equal(updateWorldEventDefinitionRequestSchema.additionalProperties, false);
  assert.equal("required" in updateWorldEventDefinitionRequestSchema, false);
});

test("actor session schemas keep switching ID-based and timestamps explicit", () => {
  assert.equal(actorSessionSchema.properties?.startedAt.format, "date-time");
  assert.equal(actorSessionSchema.properties?.endedAt.format, "date-time");
  assert.deepEqual(actorSessionSchema.required, [
    "id",
    "storyWorldId",
    "userCharacterId",
    "startedAt",
  ]);
  assert.deepEqual(actorSessionSwitchRequestSchema.required, [
    "actorSessionId",
    "nextCharacterId",
  ]);
});

test("conversation and message schemas cover chat membership, media, and idempotency", () => {
  assert.deepEqual(conversationSchema.properties?.type.enum, ["PRIVATE", "GROUP"]);
  assert.deepEqual(conversationSchema.required, [
    "id",
    "storyWorldId",
    "type",
    "createdAt",
  ]);
  assert.equal(conversationMemberSchema.properties?.joinedAt.format, "date-time");
  assert.equal(conversationMemberSchema.properties?.leftAt.format, "date-time");
  assert.deepEqual(messageSchema.properties?.kind.enum, [
    MessageKind.TEXT,
    MessageKind.IMAGE,
    MessageKind.STICKER,
    MessageKind.SYSTEM,
  ]);
  assert.deepEqual(messageSchema.required, [
    "id",
    "conversationId",
    "kind",
    "createdAt",
    "idempotencyKey",
  ]);
});

test("chat request schemas keep creation member IDs and message idempotency explicit", () => {
  assert.equal(createConversationRequestSchema.properties?.memberCharacterIds.type, "array");
  assert.equal(
    createConversationRequestSchema.properties?.memberCharacterIds.items?.type,
    "string",
  );
  assert.deepEqual(createConversationRequestSchema.required, [
    "id",
    "storyWorldId",
    "type",
    "createdAt",
    "memberCharacterIds",
  ]);
  assert.deepEqual(sendMessageRequestSchema.required, [
    "id",
    "kind",
    "createdAt",
    "idempotencyKey",
  ]);
});

test("registry exposes every schema by its stable contract name", () => {
  assert.deepEqual(Object.keys(contractSchemas).sort(), [
    "actorSession",
    "actorSessionSwitchRequest",
    "appearanceSettings",
    "behaviorAction",
    "character",
    "characterPlan",
    "characterVisualIdentity",
    "chatBackgroundItem",
    "chatBackgroundSettings",
    "compiledImageWorkflow",
    "conversation",
    "conversationMember",
    "createConversationRequest",
    "createMomentInteractionRequest",
    "createRelationshipEdgeRequest",
    "createStickerInput",
    "createStickerPackRequest",
    "createWorldEventDefinitionRequest",
    "createWorldLoreEntryRequest",
    "eventExecution",
    "eventRecurrence",
    "imageAsset",
    "imageJob",
    "imageWorkflowTemplate",
    "memoryItem",
    "message",
    "moment",
    "momentDraft",
    "momentInteraction",
    "proactiveMessageBudget",
    "relationshipEdge",
    "relationshipState",
    "requestConversationImageRequest",
    "scheduledOccurrence",
    "sendMessageRequest",
    "sticker",
    "stickerPack",
    "storyWorld",
    "updateAppearanceSettingsRequest",
    "updateRelationshipEdgeRequest",
    "updateWorldEventDefinitionRequest",
    "updateWorldLoreEntryRequest",
    "validateImageWorkflowResult",
    "worldCalendar",
    "worldEventDefinition",
    "worldLoreEntry",
  ]);
});

test("appearance schemas lock theme id format and chat background ranges", () => {
  assert.deepEqual(appearanceSettingsSchema.required, [
    "id",
    "ownerKey",
    "themeId",
    "chatBackground",
    "updatedAt",
  ]);
  assert.equal(appearanceSettingsSchema.additionalProperties, false);
  assert.equal(appearanceSettingsSchema.properties?.themeId.pattern, "^[a-z0-9][a-z0-9-]{0,63}$");
  assert.deepEqual(chatBackgroundSettingsSchema.required, ["kind", "opacity", "blur"]);
  assert.deepEqual(
    chatBackgroundSettingsSchema.properties?.kind.enum,
    Object.values(ChatBackgroundKindDto),
  );
  assert.equal(chatBackgroundSettingsSchema.properties?.opacity.maximum, 1);
  assert.equal(chatBackgroundSettingsSchema.properties?.blur.maximum, 40);
  assert.equal(chatBackgroundSettingsSchema.properties?.imageRef.maxLength, 2_000_000);
  assert.deepEqual(updateAppearanceSettingsRequestSchema.required, ["themeId", "chatBackground"]);
  assert.equal(updateAppearanceSettingsRequestSchema.additionalProperties, false);
});

test("memory schema exposes visibility, source, confidence, and audience", () => {
  assert.deepEqual(memoryItemSchema.properties?.kind.enum, Object.values(MemoryKind));
  assert.deepEqual(memoryItemSchema.properties?.visibility.enum, Object.values(MemoryVisibility));
  assert.deepEqual(memoryItemSchema.properties?.source.enum, Object.values(MemorySource));
  assert.equal(memoryItemSchema.properties?.confidence.minimum, 0);
  assert.equal(memoryItemSchema.properties?.confidence.maximum, 1);
  assert.equal(memoryItemSchema.properties?.audienceCharacterIds.items?.type, "string");
});

test("event schemas expose trigger sources, recurrence variants, and occurrence lifecycle", () => {
  assert.deepEqual(worldEventDefinitionSchema.properties?.triggerSource.enum, Object.values(TriggerSource));
  assert.equal(worldEventDefinitionSchema.properties?.recurrence, eventRecurrenceSchema);
  assert.deepEqual(worldEventDefinitionSchema.required, [
    "id",
    "storyWorldId",
    "eventKey",
    "name",
    "triggerSource",
    "timezone",
    "recurrence",
    "targetCharacterIds",
    "recipientCharacterIds",
    "outputs",
    "priority",
    "enabled",
    "createdAt",
  ]);
  assert.equal(eventRecurrenceSchema.oneOf?.length, 2);
  assert.deepEqual(
    scheduledOccurrenceSchema.properties?.status.enum,
    Object.values(ScheduledOccurrenceStatus),
  );
  assert.deepEqual(scheduledOccurrenceSchema.required, [
    "id",
    "definitionId",
    "storyWorldId",
    "eventKey",
    "scheduledFor",
    "timezone",
    "occurrenceKey",
    "status",
    "createdAt",
  ]);
  assert.deepEqual(worldCalendarSchema.required, [
    "storyWorldId",
    "startsAt",
    "endsAt",
    "definitions",
    "occurrences",
  ]);
  assert.equal(worldCalendarSchema.properties?.definitions.items, worldEventDefinitionSchema);
  assert.equal(worldCalendarSchema.properties?.occurrences.items, scheduledOccurrenceSchema);
});

test("life simulation schemas expose plans, execution audit, and message budgets", () => {
  assert.deepEqual(
    characterPlanSchema.properties?.interruptibility.enum,
    Object.values(PlanInterruptibility),
  );
  assert.deepEqual(characterPlanSchema.required, [
    "id",
    "storyWorldId",
    "characterId",
    "startsAt",
    "endsAt",
    "timezone",
    "activity",
    "interruptibility",
    "createdAt",
  ]);
  assert.deepEqual(
    eventExecutionSchema.properties?.status.enum,
    Object.values(EventExecutionStatus),
  );
  assert.equal(eventExecutionSchema.properties?.inputSnapshot.type, "object");
  assert.equal(proactiveMessageBudgetSchema.properties?.consumed.minimum, 0);
  assert.deepEqual(proactiveMessageBudgetSchema.required, [
    "id",
    "storyWorldId",
    "characterId",
    "windowStartsAt",
    "windowEndsAt",
    "limit",
    "consumed",
    "updatedAt",
  ]);
});

test("behavior and media schemas expose structured actions, drafts, and image lifecycle", () => {
  assert.deepEqual(behaviorActionSchema.properties?.kind.enum, Object.values(ActionKind));
  assert.deepEqual(behaviorActionSchema.properties?.status.enum, Object.values(ActionStatus));
  assert.equal(behaviorActionSchema.properties?.payload.type, "object");
  assert.deepEqual(momentDraftSchema.properties?.visibility.enum, Object.values(MomentVisibility));
  assert.deepEqual(momentDraftSchema.properties?.status.enum, Object.values(MomentDraftStatus));
  assert.deepEqual(imageJobSchema.properties?.kind.enum, Object.values(ImageJobKind));
  assert.deepEqual(imageJobSchema.properties?.status.enum, Object.values(ImageJobStatus));
  assert.equal(imageJobSchema.properties?.prompt.minLength, 1);
  assert.deepEqual(imageAssetSchema.properties?.category.enum, Object.values(ImageAssetCategory));
  assert.ok(imageAssetSchema.required.includes("mediaRef"));
});

test("conversation image requests require both private-chat participants and an idempotency key", () => {
  assert.deepEqual(requestConversationImageRequestSchema.required, [
    "actorCharacterId", "recipientCharacterId", "prompt", "workflowVersion",
    "createdAt", "idempotencyKey",
  ]);
  assert.deepEqual(worldEventDefinitionSchema.properties?.outputs.required, ["sendMessage", "publishMoment", "generateImage"]);
  assert.equal(requestConversationImageRequestSchema.properties?.seed.minimum, 0);
});

test("social feed schemas expose moments, interaction kinds, and idempotent requests", () => {
  assert.deepEqual(momentSchema.properties?.visibility.enum, Object.values(MomentVisibility));
  assert.equal(momentSchema.properties?.audienceCharacterIds.items?.type, "string");
  assert.deepEqual(
    momentInteractionSchema.properties?.kind.enum,
    Object.values(MomentInteractionKind),
  );
  assert.deepEqual(createMomentInteractionRequestSchema.required, [
    "id",
    "actorCharacterId",
    "kind",
    "createdAt",
    "idempotencyKey",
  ]);
});
