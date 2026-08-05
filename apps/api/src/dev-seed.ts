import {
  CharacterRole,
  ConversationType,
  MessageKind,
  StoryMode,
  createActorSession,
  createCharacter,
  createCharacterVisualIdentity,
  createConversation,
  createImageWorkflowTemplate,
  createMessage,
  createRelationshipEdge,
  createSticker,
  createStickerPack,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import {
  createInMemoryRepositories,
  type DomainRepositories,
} from "../../../packages/database/src/index.ts";

const createdAt = "2026-08-05T00:00:00.000Z";

/**
 * Deterministic local data for the development server.
 *
 * This is intentionally explicit: production runtime wiring must provide a
 * real repository implementation instead of silently falling back to this
 * seed or to an in-memory store.
 */
export function createDevelopmentRepositories(): DomainRepositories {
  const world = createStoryWorld({
    id: "dev-world",
    name: "开发故事世界",
    timezone: "Asia/Shanghai",
    storyMode: StoryMode.STATIC,
    relationshipDynamicsEnabled: false,
  });
  const user = createCharacter({
    id: "dev-user",
    displayName: "体验者",
    role: CharacterRole.USER,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const secondUser = createCharacter({
    id: "dev-user-second",
    displayName: "另一位体验者",
    role: CharacterRole.USER,
    storyWorldId: world.id,
    timezone: world.timezone,
  });
  const character = createCharacter({
    id: "dev-character",
    displayName: "林遥",
    role: CharacterRole.AI,
    storyWorldId: world.id,
    timezone: world.timezone,
    personaPromptRef: "persona://dev-character",
  });
  const session = createActorSession({
    id: "dev-session",
    storyWorld: world,
    userCharacter: user,
    startedAt: createdAt,
  });
  const relationship = createRelationshipEdge({
    id: "dev-relationship",
    source: user,
    target: character,
    storyWorld: world,
    relationshipType: "friend",
    initialState: { affinity: 58, trust: 42, conflict: 0, dependency: 8 },
    isPublic: true,
    isBidirectional: true,
  });
  const conversation = createConversation({
    id: "dev-conversation",
    storyWorld: world,
    type: ConversationType.PRIVATE,
    title: "和林遥聊天",
    createdAt,
    members: [user, character],
  });
  const welcome = createMessage({
    id: "dev-message-welcome",
    conversation,
    author: character,
    kind: MessageKind.TEXT,
    text: "今天想从哪里开始？我在这里。",
    createdAt,
    idempotencyKey: "dev-message-welcome",
  });
  const prompt = createMessage({
    id: "dev-message-prompt",
    conversation,
    author: user,
    kind: MessageKind.TEXT,
    text: "带我看看这个世界。",
    createdAt: "2026-08-05T00:01:00.000Z",
    idempotencyKey: "dev-message-prompt",
  });
  const visualIdentity = createCharacterVisualIdentity({
    id: "dev-visual-identity",
    characterId: character.id,
    storyWorldId: world.id,
    positivePrompt: "warm portrait of a thoughtful young writer",
    negativePrompt: "blurry, low quality, watermark",
    styleTags: ["soft light", "editorial illustration"],
    referenceImageRefs: ["media://dev/lin-yao-reference.png"],
    updatedAt: createdAt,
  });
  const userVisualIdentity = createCharacterVisualIdentity({
    id: "dev-user-visual-identity",
    characterId: user.id,
    storyWorldId: world.id,
    positivePrompt: "portrait of a curious traveler in a living story world",
    styleTags: ["warm light", "natural portrait"],
    referenceImageRefs: [],
    updatedAt: createdAt,
  });
  const workflow = createImageWorkflowTemplate({
    id: "dev-moment",
    version: "v1",
    workflow: {
      "6": { inputs: { text: "placeholder-positive" } },
      "7": { inputs: { text: "placeholder-negative" } },
      "9": { inputs: { seed: 1 } },
    },
    positivePromptPath: ["6", "inputs", "text"],
    negativePromptPath: ["7", "inputs", "text"],
    seedPath: ["9", "inputs", "seed"],
  });
  const stickerPack = createStickerPack({
    id: "dev-sticker-pack",
    storyWorld: world,
    name: "开发表情",
    sourceRef: "local://dev",
    createdAt,
  });
  const sticker = createSticker({
    id: "dev-sticker-wave",
    pack: stickerPack,
    label: "挥手",
    mediaRef: "media://dev/stickers/wave.png",
    tags: ["hello", "friendly"],
    createdAt,
  });

  return createInMemoryRepositories({
    worlds: [world],
    characters: [user, secondUser, character],
    relationshipEdges: [relationship],
    actorSessions: [session],
    conversations: [conversation],
    messages: [welcome, prompt],
    characterVisualIdentities: [visualIdentity, userVisualIdentity],
    imageWorkflowTemplates: [workflow],
    stickerPacks: [stickerPack],
    stickers: [sticker],
  });
}
