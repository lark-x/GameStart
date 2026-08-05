import {
  createMomentInteraction as createMomentInteractionDomain,
  createConversation as createConversationDomain,
  createMessage as createMessageDomain,
  switchActorCharacter as applyActorCharacterSwitch,
  type ActorSession,
  type Character,
  type ConversationAggregate,
  type Message,
  type Moment,
  type MomentInteraction,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type WorldEventDefinition,
  isMomentVisibleTo,
  cloneJsonObject,
  createSticker as createStickerDomain,
  createStickerPack as createStickerPackDomain,
  createImageWorkflowTemplate,
  assertImageWorkflowTemplateBindings,
  type JsonObject,
  type StoryWorld,
} from "../../../packages/domain/src/index.ts";
import {
  ProviderError,
  type ChatDelta,
  type ChatProvider,
} from "../../../packages/ai/src/index.ts";
import type {
  ActorSessionDto,
  ActorSessionSwitchRequest,
  CharacterDto,
  CharacterId,
  ConversationDetailDto,
  CreateConversationRequest,
  MessageDto,
  SendMessageRequest,
  SendMessageResultDto,
  StoryWorldDto,
  CreateMomentInteractionRequest,
  MomentDto,
  MomentInteractionDto,
  MomentInteractionWriteResultDto,
  CharacterVisualIdentityDto,
  ImageWorkflowTemplateDto,
  ImageJobDto,
  StickerPackDto,
  StickerDto,
  CreateStickerPackRequest,
  StickerPackImportResultDto,
  RelationshipEdgeDto,
  WorldCalendarDto,
  ScheduledOccurrenceDto,
  WorldEventDefinitionDto,
  ValidateImageWorkflowRequest,
  ValidateImageWorkflowResultDto,
} from "../../../packages/contracts/src/index.ts";
import {
  createInMemoryRepositories,
  type DomainRepositories,
  type InMemoryRepositorySeed,
} from "../../../packages/database/src/index.ts";
import { ConversationOrchestrator } from "./conversation-orchestrator.ts";
import type { ConversationOrchestratorOptions } from "./conversation-orchestrator.ts";

export type ApiSeed = InMemoryRepositorySeed;

export type ApiStore = DomainRepositories;

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly statusCode: 401 | 400 | 403 | 404 | 405 | 409 | 500 | 501 | 503;
  public readonly code: ApiErrorCode;

  public constructor(
    statusCode: 401 | 400 | 403 | 404 | 405 | 409 | 500 | 501 | 503,
    code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createApiStore(seed: ApiSeed = {}): ApiStore {
  return createInMemoryRepositories(seed);
}

function toWorldDto(world: StoryWorld): StoryWorldDto {
  return { ...world };
}

function toCharacterDto(character: Character): CharacterDto {
  return { ...character };
}

function toRelationshipEdgeDto(edge: RelationshipEdge): RelationshipEdgeDto {
  return { ...edge, initialState: { ...edge.initialState } };
}

function toWorldEventDefinitionDto(definition: WorldEventDefinition): WorldEventDefinitionDto {
  return {
    ...definition,
    recurrence: { ...definition.recurrence },
    targetCharacterIds: [...definition.targetCharacterIds],
  };
}

function toScheduledOccurrenceDto(occurrence: ScheduledOccurrence): ScheduledOccurrenceDto {
  return { ...occurrence };
}

function toSessionDto(session: ActorSession): ActorSessionDto {
  return { ...session };
}

function toConversationDto(aggregate: ConversationAggregate): ConversationDetailDto {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((member) => ({ ...member })),
  };
}

function toMessageDto(message: Message): MessageDto {
  return { ...message };
}

function toMomentDto(moment: Moment): MomentDto {
  return {
    ...moment,
    audienceCharacterIds: [...moment.audienceCharacterIds],
  };
}

function toMomentInteractionDto(interaction: MomentInteraction): MomentInteractionDto {
  return { ...interaction };
}

function toCharacterVisualIdentityDto(
  identity: import("../../../packages/domain/src/index.ts").CharacterVisualIdentity,
): CharacterVisualIdentityDto {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

function toImageWorkflowTemplateDto(
  template: import("../../../packages/domain/src/index.ts").ImageWorkflowTemplate,
): ImageWorkflowTemplateDto {
  return {
    id: template.id,
    version: template.version,
    workflow: cloneJsonObject(template.workflow) as Record<string, unknown>,
    positivePromptPath: [...template.positivePromptPath],
    ...(template.negativePromptPath === undefined
      ? {}
      : { negativePromptPath: [...template.negativePromptPath] }),
    ...(template.seedPath === undefined ? {} : { seedPath: [...template.seedPath] }),
  };
}

function toImageJobDto(
  job: import("../../../packages/domain/src/index.ts").ImageJob,
): ImageJobDto {
  return { ...job };
}

function toStickerPackDto(
  pack: import("../../../packages/domain/src/index.ts").StickerPack,
): StickerPackDto {
  return { ...pack };
}

function toStickerDto(
  sticker: import("../../../packages/domain/src/index.ts").Sticker,
): StickerDto {
  return { ...sticker, tags: [...sticker.tags] };
}

function toStickerPackImportResult(
  pack: import("../../../packages/domain/src/index.ts").StickerPack,
  stickers: readonly import("../../../packages/domain/src/index.ts").Sticker[],
): StickerPackImportResultDto {
  return { pack: toStickerPackDto(pack), stickers: stickers.map(toStickerDto) };
}

type ChatStore = ApiStore & {
  conversations: NonNullable<ApiStore["conversations"]>;
  messages: NonNullable<ApiStore["messages"]>;
};

function requireChatStore(store: ApiStore): ChatStore {
  if (!store.conversations || !store.messages) {
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Chat repositories are not configured",
    );
  }
  return store as ChatStore;
}

type MomentStore = ApiStore & {
  moments: NonNullable<ApiStore["moments"]>;
  momentInteractions: NonNullable<ApiStore["momentInteractions"]>;
};

function requireMomentStore(store: ApiStore): MomentStore {
  if (!store.moments || !store.momentInteractions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Moment repositories are not configured");
  }
  return store as MomentStore;
}

type VisualWorkflowStore = ApiStore & {
  characterVisualIdentities: NonNullable<ApiStore["characterVisualIdentities"]>;
  imageWorkflowTemplates: NonNullable<ApiStore["imageWorkflowTemplates"]>;
};

type ImageJobStore = ApiStore & {
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
};

function requireImageJobStore(store: ApiStore): ImageJobStore {
  if (!store.imageJobs) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image job repository is not configured");
  }
  return store as ImageJobStore;
}

type StickerStore = ApiStore & {
  stickerPacks: NonNullable<ApiStore["stickerPacks"]>;
  stickers: NonNullable<ApiStore["stickers"]>;
};

function requireStickerStore(store: ApiStore): StickerStore {
  if (!store.stickerPacks || !store.stickers) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Sticker repositories are not configured");
  }
  return store as StickerStore;
}

type EventCalendarStore = ApiStore & {
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
};

function requireEventCalendarStore(store: ApiStore): EventCalendarStore {
  if (!store.worldEventDefinitions || !store.scheduledOccurrences) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Event repositories are not configured");
  }
  return store as EventCalendarStore;
}

function requireVisualWorkflowStore(store: ApiStore): VisualWorkflowStore {
  if (!store.characterVisualIdentities || !store.imageWorkflowTemplates) {
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Visual identity/workflow repositories are not configured",
    );
  }
  return store as VisualWorkflowStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSwitchRequest(value: unknown): ActorSessionSwitchRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }

  const allowedKeys = new Set(["actorSessionId", "nextCharacterId"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }

  if (
    typeof value.actorSessionId !== "string" ||
    value.actorSessionId.trim().length === 0 ||
    typeof value.nextCharacterId !== "string" ||
    value.nextCharacterId.trim().length === 0
  ) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "actorSessionId and nextCharacterId must be non-empty strings",
    );
  }

  return {
    actorSessionId: value.actorSessionId as ActorSessionSwitchRequest["actorSessionId"],
    nextCharacterId: value.nextCharacterId as CharacterId,
  };
}

function bodyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return value;
}

function parseCreateStickerPackRequest(value: unknown): CreateStickerPackRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "name", "sourceRef", "createdAt", "stickers"]);
  if (!Array.isArray(value.stickers)) {
    throw new ApiError(400, "BAD_REQUEST", "stickers must be an array");
  }
  const stickers = value.stickers.map((item, index) => {
    if (!isRecord(item)) throw new ApiError(400, "BAD_REQUEST", `stickers[${index}] must be an object`);
    assertAllowedBodyKeys(item, ["id", "label", "mediaRef", "tags"]);
    const parsed: { id: string; label: string; mediaRef: string; tags?: string[] } = {
      id: bodyString(item.id, `stickers[${index}].id`),
      label: bodyString(item.label, `stickers[${index}].label`),
      mediaRef: bodyString(item.mediaRef, `stickers[${index}].mediaRef`),
    };
    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags)) throw new ApiError(400, "BAD_REQUEST", `stickers[${index}].tags must be an array`);
      parsed.tags = item.tags.map((tag, tagIndex) => bodyString(tag, `stickers[${index}].tags[${tagIndex}]`));
    }
    return parsed;
  });
  const result: CreateStickerPackRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    name: bodyString(value.name, "name"),
    createdAt: bodyString(value.createdAt, "createdAt"),
    stickers,
  };
  if (value.sourceRef !== undefined) result.sourceRef = bodyString(value.sourceRef, "sourceRef");
  return result;
}

function assertAllowedBodyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }
}

function bodyStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty array`);
  }
  return value.map((item, index) => bodyString(item, `${field}[${index}]`));
}

function parseValidateImageWorkflowRequest(value: unknown): ValidateImageWorkflowRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "version",
    "workflow",
    "positivePromptPath",
    "negativePromptPath",
    "seedPath",
  ]);
  if (!isRecord(value.workflow)) {
    throw new ApiError(400, "BAD_REQUEST", "workflow must be an object");
  }
  const result: ValidateImageWorkflowRequest = {
    id: bodyString(value.id, "id"),
    version: bodyString(value.version, "version"),
    workflow: value.workflow,
    positivePromptPath: bodyStringArray(value.positivePromptPath, "positivePromptPath"),
  };
  if (value.negativePromptPath !== undefined) {
    result.negativePromptPath = bodyStringArray(value.negativePromptPath, "negativePromptPath");
  }
  if (value.seedPath !== undefined) {
    result.seedPath = bodyStringArray(value.seedPath, "seedPath");
  }
  return result;
}

function parseCreateConversationRequest(value: unknown): CreateConversationRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "storyWorldId",
    "type",
    "title",
    "createdAt",
    "memberCharacterIds",
  ]);
  if (value.type !== "PRIVATE" && value.type !== "GROUP") {
    throw new ApiError(400, "BAD_REQUEST", "type must be PRIVATE or GROUP");
  }
  if (!Array.isArray(value.memberCharacterIds)) {
    throw new ApiError(400, "BAD_REQUEST", "memberCharacterIds must be an array");
  }
  const memberCharacterIds = value.memberCharacterIds.map((member, index) =>
    bodyString(member, `memberCharacterIds[${index}]`),
  );
  const result: CreateConversationRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    type: value.type,
    createdAt: bodyString(value.createdAt, "createdAt"),
    memberCharacterIds,
  };
  if (value.title !== undefined) result.title = bodyString(value.title, "title");
  return result;
}

function parseSendMessageRequest(value: unknown): SendMessageRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "authorCharacterId",
    "kind",
    "text",
    "mediaRef",
    "stickerId",
    "createdAt",
    "idempotencyKey",
  ]);
  if (
    value.kind !== "TEXT" &&
    value.kind !== "IMAGE" &&
    value.kind !== "STICKER" &&
    value.kind !== "SYSTEM"
  ) {
    throw new ApiError(400, "BAD_REQUEST", "kind must be TEXT, IMAGE, STICKER, or SYSTEM");
  }
  const result: SendMessageRequest = {
    id: bodyString(value.id, "id"),
    kind: value.kind,
    createdAt: bodyString(value.createdAt, "createdAt"),
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
  };
  if (value.authorCharacterId !== undefined) {
    result.authorCharacterId = bodyString(value.authorCharacterId, "authorCharacterId");
  }
  if (value.text !== undefined) result.text = bodyString(value.text, "text");
  if (value.mediaRef !== undefined) result.mediaRef = bodyString(value.mediaRef, "mediaRef");
  if (value.stickerId !== undefined) result.stickerId = bodyString(value.stickerId, "stickerId");
  return result;
}

function parseCreateMomentInteractionRequest(value: unknown): CreateMomentInteractionRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "actorCharacterId",
    "kind",
    "text",
    "createdAt",
    "idempotencyKey",
  ]);
  if (value.kind !== "LIKE" && value.kind !== "COMMENT") {
    throw new ApiError(400, "BAD_REQUEST", "kind must be LIKE or COMMENT");
  }
  const result: CreateMomentInteractionRequest = {
    id: bodyString(value.id, "id"),
    actorCharacterId: bodyString(value.actorCharacterId, "actorCharacterId"),
    kind: value.kind,
    createdAt: bodyString(value.createdAt, "createdAt"),
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
  };
  if (value.text !== undefined) result.text = bodyString(value.text, "text");
  return result;
}

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.statusCode,
    );
  }

  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
}

function sseData(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
}

function sseError(error: unknown): Uint8Array {
  const code = error instanceof ProviderError ? error.code : "STREAM_ERROR";
  const message = error instanceof ProviderError
    ? error.message
    : "Chat stream failed";
  return new TextEncoder().encode(
    `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`,
  );
}

function sseDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

function createSseResponse(source: AsyncIterable<ChatDelta>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for await (const delta of source) controller.enqueue(sseData(delta));
        } catch (error) {
          controller.enqueue(sseError(error));
        } finally {
          controller.enqueue(sseDone());
          controller.close();
        }
      })().catch(() => undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
    },
  });
}

export class ApiApplication {
  public readonly store: ApiStore;
  public readonly provider: ChatProvider | undefined;
  private readonly conversationOptions: ConversationOrchestratorOptions;
  private readonly requireTrustedActor: boolean;
  private readonly readiness: (() => Promise<void>) | undefined;

  public constructor(
    store: ApiStore,
    provider?: ChatProvider,
    conversationOptions: ConversationOrchestratorOptions = {},
    securityOptions: { requireTrustedActor?: boolean } = {},
    operationalOptions: { readiness?: () => Promise<void> } = {},
  ) {
    this.store = store;
    this.provider = provider;
    this.conversationOptions = conversationOptions;
    this.requireTrustedActor = securityOptions.requireTrustedActor ?? false;
    this.readiness = operationalOptions.readiness;
  }

  private trustedActor(request: Request, requestedCharacterId?: string): string | undefined {
    if (!this.requireTrustedActor) return requestedCharacterId;
    const actor = request.headers.get("x-actor-character-id")?.trim();
    if (!actor) throw new ApiError(401, "UNAUTHORIZED", "Trusted actor context is required");
    if (requestedCharacterId !== undefined && actor !== requestedCharacterId) {
      throw new ApiError(403, "FORBIDDEN", "Trusted actor does not match requested character");
    }
    return actor;
  }

  public async listWorlds(): Promise<StoryWorldDto[]> {
    const worlds = await this.store.storyWorlds.list();
    return worlds.map(toWorldDto);
  }

  public async listCharacters(storyWorldId?: string): Promise<CharacterDto[]> {
    const characters = await this.store.characters.listByStoryWorld(storyWorldId);
    return characters.map(toCharacterDto);
  }

  public async listRelationships(storyWorldId: string): Promise<RelationshipEdgeDto[]> {
    if (!(await this.store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    return (await this.store.relationshipEdges.listByStoryWorld(storyWorldId))
      .map(toRelationshipEdgeDto);
  }

  public async getWorldCalendar(
    storyWorldId: string,
    startsAt: string,
    endsAt: string,
    limit = 200,
  ): Promise<WorldCalendarDto> {
    const store = requireEventCalendarStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new ApiError(400, "BAD_REQUEST", "limit must be an integer between 1 and 500");
    }
    try {
      const [definitions, occurrences] = await Promise.all([
        store.worldEventDefinitions.listByStoryWorld(storyWorldId),
        store.scheduledOccurrences.listByWindow(storyWorldId, startsAt, endsAt, limit),
      ]);
      return {
        storyWorldId,
        startsAt,
        endsAt,
        definitions: definitions.map(toWorldEventDefinitionDto),
        occurrences: occurrences.map(toScheduledOccurrenceDto),
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async getCharacterVisualIdentity(
    characterId: string,
  ): Promise<CharacterVisualIdentityDto> {
    const store = requireVisualWorkflowStore(this.store);
    if (!(await store.characters.getById(characterId))) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }
    const identity = await store.characterVisualIdentities.getByCharacterId(characterId);
    if (!identity) throw new ApiError(404, "NOT_FOUND", "Character visual identity not found");
    return toCharacterVisualIdentityDto(identity);
  }

  public async listImageWorkflowTemplates(): Promise<ImageWorkflowTemplateDto[]> {
    const store = requireVisualWorkflowStore(this.store);
    return (await store.imageWorkflowTemplates.list()).map(toImageWorkflowTemplateDto);
  }

  public validateImageWorkflow(
    input: ValidateImageWorkflowRequest,
  ): ValidateImageWorkflowResultDto {
    try {
      const template = createImageWorkflowTemplate({
        id: input.id,
        version: input.version,
        workflow: input.workflow as JsonObject,
        positivePromptPath: input.positivePromptPath,
        ...(input.negativePromptPath === undefined
          ? {}
          : { negativePromptPath: input.negativePromptPath }),
        ...(input.seedPath === undefined ? {} : { seedPath: input.seedPath }),
      });
      assertImageWorkflowTemplateBindings(template);
      return {
        valid: true,
        id: template.id,
        version: template.version,
        checkedBindings: [
          "positivePromptPath",
          ...(template.negativePromptPath === undefined ? [] : ["negativePromptPath"]),
          ...(template.seedPath === undefined ? [] : ["seedPath"]),
        ],
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async getImageJob(jobId: string): Promise<ImageJobDto> {
    const store = requireImageJobStore(this.store);
    const job = await store.imageJobs.getById(jobId);
    if (!job) throw new ApiError(404, "NOT_FOUND", "Image job not found");
    return toImageJobDto(job);
  }

  public async listStickerPacks(storyWorldId: string): Promise<StickerPackDto[]> {
    const store = requireStickerStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    return (await store.stickerPacks.listByStoryWorld(storyWorldId)).map(toStickerPackDto);
  }

  public async listStickers(packId: string): Promise<StickerDto[]> {
    const store = requireStickerStore(this.store);
    if (!(await store.stickerPacks.getById(packId))) {
      throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
    }
    return (await store.stickers.listByPack(packId)).map(toStickerDto);
  }

  public async importStickerPack(input: CreateStickerPackRequest): Promise<StickerPackImportResultDto> {
    const store = requireStickerStore(this.store);
    const world = await store.storyWorlds.getById(input.storyWorldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    try {
      const pack = createStickerPackDomain({
        id: input.id,
        storyWorld: world,
        name: input.name,
        createdAt: input.createdAt,
        ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }),
      });
      const stickers = input.stickers.map((sticker) => createStickerDomain({
        id: sticker.id,
        pack,
        label: sticker.label,
        mediaRef: sticker.mediaRef,
        ...(sticker.tags === undefined ? {} : { tags: sticker.tags }),
        createdAt: input.createdAt,
      }));
      await store.stickerPacks.save(pack);
      for (const sticker of stickers) await store.stickers.save(sticker);
      return toStickerPackImportResult(pack, stickers);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async switchActorCharacter(
    input: ActorSessionSwitchRequest,
  ): Promise<ActorSessionDto> {
    const session = await this.store.actorSessions.getById(input.actorSessionId);
    if (!session) {
      throw new ApiError(404, "NOT_FOUND", "Actor session not found");
    }

    const nextCharacter = await this.store.characters.getById(input.nextCharacterId);
    if (!nextCharacter) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }

    try {
      const switched = applyActorCharacterSwitch(session, nextCharacter);
      await this.store.actorSessions.save(switched);
      return toSessionDto(switched);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async createConversation(
    input: CreateConversationRequest,
  ): Promise<ConversationDetailDto> {
    const store = requireChatStore(this.store);
    const storyWorld = await store.storyWorlds.getById(input.storyWorldId);
    if (!storyWorld) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const members = await Promise.all(
      input.memberCharacterIds.map(async (id) => {
        const character = await store.characters.getById(id);
        if (!character) throw new ApiError(404, "NOT_FOUND", `Character not found: ${id}`);
        return character;
      }),
    );
    try {
      const aggregate = createConversationDomain({
        id: input.id,
        storyWorld,
        type: input.type,
        createdAt: input.createdAt,
        members,
        ...(input.title === undefined ? {} : { title: input.title }),
      });
      await store.conversations.save(aggregate);
      return toConversationDto(aggregate);
    } catch (error) {
      if (error instanceof TypeError && error.message.startsWith("Duplicate")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async listConversations(characterId: string): Promise<ConversationDetailDto[]> {
    const store = requireChatStore(this.store);
    if (!(await store.characters.getById(characterId))) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }
    const conversations = await store.conversations.listByCharacter(characterId);
    return conversations.map(toConversationDto);
  }

  private async getConversationForMember(
    conversationId: string,
    characterId: string,
  ): Promise<{ store: ChatStore; conversation: ConversationAggregate }> {
    const store = requireChatStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    const member = conversation.members.some(
      (candidate) => candidate.characterId === characterId && candidate.leftAt === undefined,
    );
    if (!member) throw new ApiError(403, "FORBIDDEN", "Character is not an active member");
    return { store, conversation };
  }

  public async listMessages(
    conversationId: string,
    characterId: string,
  ): Promise<MessageDto[]> {
    const { store } = await this.getConversationForMember(conversationId, characterId);
    const messages = await store.messages.listByConversation(conversationId);
    return messages.map(toMessageDto);
  }

  public async sendMessage(
    conversationId: string,
    authorCharacterId: string | undefined,
    input: SendMessageRequest,
  ): Promise<SendMessageResultDto> {
    const store = requireChatStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    const author = authorCharacterId === undefined
      ? undefined
      : await store.characters.getById(authorCharacterId);
    if (authorCharacterId !== undefined && !author) {
      throw new ApiError(404, "NOT_FOUND", "Author character not found");
    }
    try {
      const message = createMessageDomain({
        id: input.id,
        conversation,
        kind: input.kind,
        createdAt: input.createdAt,
        idempotencyKey: input.idempotencyKey,
        ...(author === undefined ? {} : { author }),
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.mediaRef === undefined ? {} : { mediaRef: input.mediaRef }),
        ...(input.stickerId === undefined ? {} : { stickerId: input.stickerId }),
      });
      const result = await store.messages.save(message);
      return { message: toMessageDto(result.message), inserted: result.inserted };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async streamConversation(
    conversationId: string,
    characterId: string,
  ): Promise<Response> {
    if (!this.provider) {
      throw new ApiError(501, "NOT_IMPLEMENTED", "Chat provider is not configured");
    }
    try {
      const orchestrator = new ConversationOrchestrator(
        this.store,
        this.provider,
        this.conversationOptions,
      );
      return createSseResponse(orchestrator.streamReply(conversationId, characterId));
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async listMoments(
    storyWorldId: string,
    readerCharacterId: string,
    limit = 20,
  ): Promise<MomentDto[]> {
    const store = requireMomentStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    if (!(await store.characters.getById(readerCharacterId))) {
      throw new ApiError(404, "NOT_FOUND", "Reader character not found");
    }
    try {
      return (await store.moments.listFeed(storyWorldId, readerCharacterId, limit)).map(toMomentDto);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async listMomentInteractions(
    momentId: string,
    readerCharacterId: string,
  ): Promise<MomentInteractionDto[]> {
    const store = requireMomentStore(this.store);
    const moment = await store.moments.getById(momentId);
    if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
    if (!(await store.characters.getById(readerCharacterId))) {
      throw new ApiError(404, "NOT_FOUND", "Reader character not found");
    }
    if (!isMomentVisibleTo(moment, readerCharacterId)) {
      throw new ApiError(403, "FORBIDDEN", "Character cannot view this moment");
    }
    return (await store.momentInteractions.listByMoment(momentId)).map(toMomentInteractionDto);
  }

  public async createMomentInteraction(
    momentId: string,
    input: CreateMomentInteractionRequest,
  ): Promise<MomentInteractionWriteResultDto> {
    const store = requireMomentStore(this.store);
    const moment = await store.moments.getById(momentId);
    if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
    const actor = await store.characters.getById(input.actorCharacterId);
    if (!actor) throw new ApiError(404, "NOT_FOUND", "Actor character not found");
    if (!isMomentVisibleTo(moment, actor.id)) {
      throw new ApiError(403, "FORBIDDEN", "Character cannot interact with this moment");
    }
    try {
      const interaction = createMomentInteractionDomain({
        id: input.id,
        moment,
        actor,
        kind: input.kind,
        createdAt: input.createdAt,
        idempotencyKey: input.idempotencyKey,
        ...(input.text === undefined ? {} : { text: input.text }),
      });
      const result = await store.momentInteractions.save(interaction);
      return { interaction: toMomentInteractionDto(result.interaction), inserted: result.inserted };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await this.readiness?.();
        } catch {
          throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not ready");
        }
        return jsonResponse({ status: "ready" });
      }

      if (request.method === "GET" && url.pathname === "/v1/worlds") {
        return jsonResponse({ data: await this.listWorlds() });
      }

      const calendarPath = /^\/v1\/worlds\/([^/]+)\/calendar$/.exec(url.pathname);
      if (calendarPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const startsAt = url.searchParams.get("startsAt");
        const endsAt = url.searchParams.get("endsAt");
        if (!startsAt || !endsAt) {
          throw new ApiError(400, "BAD_REQUEST", "startsAt and endsAt are required");
        }
        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null ? 200 : Number(rawLimit);
        return jsonResponse({
          data: await this.getWorldCalendar(
            decodeURIComponent(calendarPath[1] ?? ""),
            startsAt,
            endsAt,
            limit,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/v1/characters") {
        return jsonResponse({
          data: await this.listCharacters(url.searchParams.get("storyWorldId") ?? undefined),
        });
      }

      if (url.pathname === "/v1/relationships") {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const storyWorldId = url.searchParams.get("storyWorldId");
        if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
        return jsonResponse({ data: await this.listRelationships(storyWorldId) });
      }

      const visualIdentityPath = /^\/v1\/characters\/([^/]+)\/visual-identity$/.exec(url.pathname);
      if (visualIdentityPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.getCharacterVisualIdentity(
            decodeURIComponent(visualIdentityPath[1] ?? ""),
          ),
        });
      }

      if (url.pathname === "/v1/comfyui/workflows") {
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          return jsonResponse({
            data: this.validateImageWorkflow(parseValidateImageWorkflowRequest(body)),
          });
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({ data: await this.listImageWorkflowTemplates() });
      }

      const imageJobPath = /^\/v1\/image-jobs\/([^/]+)$/.exec(url.pathname);
      if (imageJobPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.getImageJob(decodeURIComponent(imageJobPath[1] ?? "")),
        });
      }

      if (url.pathname === "/v1/sticker-packs") {
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const actor = this.trustedActor(request);
          const input = parseCreateStickerPackRequest(body);
          if (this.requireTrustedActor && actor !== undefined) {
            const character = await this.store.characters.getById(actor);
            if (!character || character.storyWorldId !== input.storyWorldId) {
              throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot import into this story world");
            }
          }
          return jsonResponse({ data: await this.importStickerPack(input) });
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const storyWorldId = url.searchParams.get("storyWorldId");
        if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
        return jsonResponse({ data: await this.listStickerPacks(storyWorldId) });
      }

      const stickerPath = /^\/v1\/sticker-packs\/([^/]+)\/stickers$/.exec(url.pathname);
      if (stickerPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.listStickers(decodeURIComponent(stickerPath[1] ?? "")),
        });
      }

      if (request.method === "GET" && url.pathname === "/v1/moments") {
        const storyWorldId = url.searchParams.get("storyWorldId");
        const readerCharacterId = url.searchParams.get("readerCharacterId");
        if (!storyWorldId || !readerCharacterId) {
          throw new ApiError(
            400,
            "BAD_REQUEST",
            "storyWorldId and readerCharacterId are required",
          );
        }
        this.trustedActor(request, readerCharacterId);
        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null ? 20 : Number(rawLimit);
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new ApiError(400, "BAD_REQUEST", "limit must be a positive integer");
        }
        return jsonResponse({
          data: await this.listMoments(storyWorldId, readerCharacterId, limit),
        });
      }

      const momentInteractionsPath = /^\/v1\/moments\/([^/]+)\/interactions$/.exec(url.pathname);
      if (momentInteractionsPath) {
        const momentId = decodeURIComponent(momentInteractionsPath[1] ?? "");
        if (request.method === "GET") {
          const readerCharacterId = url.searchParams.get("readerCharacterId");
          if (!readerCharacterId) throw new ApiError(400, "BAD_REQUEST", "readerCharacterId is required");
          this.trustedActor(request, readerCharacterId);
          return jsonResponse({ data: await this.listMomentInteractions(momentId, readerCharacterId) });
        }
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const input = parseCreateMomentInteractionRequest(body);
          this.trustedActor(request, input.actorCharacterId);
          return jsonResponse({
            data: await this.createMomentInteraction(momentId, input),
          });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      if (request.method === "POST" && url.pathname === "/v1/conversations") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseCreateConversationRequest(body);
        const actor = this.trustedActor(request);
        if (this.requireTrustedActor && actor !== undefined && !input.memberCharacterIds.includes(actor)) {
          throw new ApiError(403, "FORBIDDEN", "Trusted actor must be a conversation member");
        }
        return jsonResponse({ data: await this.createConversation(input) });
      }

      if (url.pathname === "/v1/conversations" && request.method === "GET") {
        const characterId = url.searchParams.get("characterId");
        if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
        this.trustedActor(request, characterId);
        return jsonResponse({ data: await this.listConversations(characterId) });
      }

      const messagePath = /^\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
      if (messagePath) {
        const conversationId = decodeURIComponent(messagePath[1] ?? "");
        if (request.method === "GET") {
          const characterId = url.searchParams.get("characterId");
          if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
          this.trustedActor(request, characterId);
          return jsonResponse({ data: await this.listMessages(conversationId, characterId) });
        }
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const input = parseSendMessageRequest(body);
          const actor = this.trustedActor(request, input.authorCharacterId);
          if (this.requireTrustedActor && actor !== undefined && input.authorCharacterId === undefined) {
            throw new ApiError(403, "FORBIDDEN", "Public API cannot create system messages");
          }
          return jsonResponse({
            data: await this.sendMessage(conversationId, input.authorCharacterId, input),
          });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const streamPath = /^\/v1\/conversations\/([^/]+)\/stream$/.exec(url.pathname);
      if (streamPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const characterId = url.searchParams.get("characterId");
        if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
        this.trustedActor(request, characterId);
        return await this.streamConversation(
          decodeURIComponent(streamPath[1] ?? ""),
          characterId,
        );
      }

      if (request.method === "POST" && url.pathname === "/v1/actor-sessions/switch") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseSwitchRequest(body);
        const actor = this.trustedActor(request);
        if (this.requireTrustedActor) {
          const session = await this.store.actorSessions.getById(input.actorSessionId);
          if (!session) throw new ApiError(404, "NOT_FOUND", "Actor session not found");
          if (actor !== session.userCharacterId) {
            throw new ApiError(403, "FORBIDDEN", "Trusted actor does not own this session");
          }
        }
        return jsonResponse({ data: await this.switchActorCharacter(input) });
      }

      const knownPath =
        url.pathname === "/health" ||
        url.pathname === "/v1/worlds" ||
        url.pathname === "/v1/characters" ||
        url.pathname === "/v1/relationships" ||
        url.pathname === "/v1/comfyui/workflows" ||
        url.pathname === "/v1/sticker-packs" ||
        url.pathname === "/v1/moments" ||
        url.pathname === "/v1/conversations" ||
        url.pathname === "/v1/actor-sessions/switch";
      if (knownPath) {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }
      throw new ApiError(404, "NOT_FOUND", "Route not found");
    } catch (error) {
      return errorResponse(error);
    }
  }
}
