import {
  CharacterRole,
  MessageKind,
  createMessage,
  createMemoryItem,
  type Character,
  type ConversationAggregate,
  type Message,
  type MemoryItem,
  type MemoryVisibility,
} from "../../../packages/domain/src/index.ts";
import type {
  ChatDelta,
  ChatMessage,
  ChatProvider,
} from "../../../packages/ai/src/index.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";

export interface ConversationOrchestratorOptions {
  readonly memoryRetrievalEnabled?: boolean;
  readonly memoryWriteEnabled?: boolean;
  readonly maxMemories?: number;
}

export interface ConversationReply {
  readonly message: Message;
  readonly inserted: boolean;
}

function messageContent(message: Message): string {
  if (message.text !== undefined) return message.text;
  if (message.mediaRef !== undefined) return `[image:${message.mediaRef}]`;
  return `[sticker:${message.stickerId ?? "unknown"}]`;
}

function toChatMessage(message: Message, author: Character | undefined): ChatMessage {
  if (message.kind === MessageKind.SYSTEM) return { role: "system", content: messageContent(message) };
  return {
    role: author?.role === CharacterRole.USER ? "user" : "assistant",
    content: messageContent(message),
  };
}

function memorySystemPrompt(memories: readonly MemoryItem[]): string | undefined {
  if (memories.length === 0) return undefined;
  const lines = memories.map((memory) => `- ${memory.content}`);
  return `Only use the following as remembered facts when relevant:\n${lines.join("\n")}`;
}

export class ConversationOrchestrator {
  private readonly repositories: DomainRepositories;
  private readonly provider: ChatProvider;
  private readonly options: Required<ConversationOrchestratorOptions>;

  public constructor(
    repositories: DomainRepositories,
    provider: ChatProvider,
    options: ConversationOrchestratorOptions = {},
  ) {
    if (!repositories.conversations || !repositories.messages) {
      throw new TypeError("Conversation repositories are not configured");
    }
    this.repositories = repositories;
    this.provider = provider;
    this.options = {
      memoryRetrievalEnabled: options.memoryRetrievalEnabled ?? false,
      memoryWriteEnabled: options.memoryWriteEnabled ?? false,
      maxMemories: options.maxMemories ?? 5,
    };
    if (!Number.isSafeInteger(this.options.maxMemories) || this.options.maxMemories < 1 || this.options.maxMemories > 20) {
      throw new RangeError("maxMemories must be an integer between 1 and 20");
    }
  }

  private async context(
    conversationId: string,
    readerCharacterId: string,
  ): Promise<{ conversation: ConversationAggregate; messages: readonly Message[]; ai: Character; chat: readonly ChatMessage[] }> {
    const conversation = await this.repositories.conversations!.getById(conversationId);
    if (!conversation) throw new TypeError("Conversation not found");
    const member = conversation.members.find(
      (candidate) => candidate.characterId === readerCharacterId && candidate.leftAt === undefined,
    );
    if (!member) throw new TypeError("Character is not an active member");
    const messages = await this.repositories.messages!.listByConversation(conversationId);
    if (messages.length === 0) throw new TypeError("Conversation has no messages to reply to");
    const characters = await Promise.all(
      conversation.members
        .filter((candidate) => candidate.leftAt === undefined)
        .map((candidate) => this.repositories.characters.getById(candidate.characterId)),
    );
    const byId = new Map(characters.filter((value): value is Character => value !== undefined).map((value) => [value.id, value]));
    const ai = [...byId.values()].find((character) => character.role === CharacterRole.AI);
    if (!ai) throw new TypeError("Conversation has no active AI member");
    const latestUser = [...messages].reverse().find((message) => {
      const author = message.authorCharacterId === undefined ? undefined : byId.get(message.authorCharacterId);
      return author?.role === CharacterRole.USER;
    });
    let memories: readonly MemoryItem[] = [];
    if (this.options.memoryRetrievalEnabled && this.repositories.memories && latestUser?.text) {
      memories = (await this.repositories.memories.search({
        storyWorldId: conversation.conversation.storyWorldId,
        readerCharacterId,
        queryText: latestUser.text,
        limit: this.options.maxMemories,
      })).map((result) => result.memory);
    }
    const systemPrompt = memorySystemPrompt(memories);
    const chat = [
      ...(systemPrompt === undefined ? [] : [{ role: "system" as const, content: systemPrompt }]),
      ...messages.map((message) => toChatMessage(message, message.authorCharacterId === undefined ? undefined : byId.get(message.authorCharacterId))),
    ];
    return { conversation, messages, ai, chat };
  }

  private async saveReply(
    context: { conversation: ConversationAggregate; messages: readonly Message[]; ai: Character },
    content: string,
  ): Promise<ConversationReply> {
    if (content.trim().length === 0) throw new TypeError("LLM reply is empty");
    const source = [...context.messages].reverse().find((message) => message.authorCharacterId !== context.ai.id) ?? context.messages[context.messages.length - 1];
    if (!source) throw new TypeError("Conversation has no source message");
    const message = createMessage({
      id: `assistant:${context.conversation.conversation.id}:${source.id}`,
      conversation: context.conversation,
      author: context.ai,
      kind: MessageKind.TEXT,
      text: content,
      createdAt: new Date().toISOString(),
      idempotencyKey: `assistant:${context.conversation.conversation.id}:${source.id}`,
    });
    let result: ConversationReply;
    try {
      const saved = await this.repositories.messages!.save(message);
      result = saved;
    } catch (error) {
      if (!(error instanceof TypeError) || !error.message.includes("idempotency")) throw error;
      const existing = (await this.repositories.messages!.listByConversation(
        context.conversation.conversation.id,
      )).find((candidate) => candidate.idempotencyKey === message.idempotencyKey);
      if (!existing || existing.text !== message.text) throw error;
      result = { message: existing, inserted: false };
    }
    if (this.options.memoryWriteEnabled && this.repositories.memories) {
      const reader = context.messages.find((candidate) => candidate.authorCharacterId !== context.ai.id)?.authorCharacterId;
      const readerCharacter = reader === undefined ? undefined : await this.repositories.characters.getById(reader);
      const world = await this.repositories.storyWorlds.getById(context.conversation.conversation.storyWorldId);
      if (readerCharacter && world) {
        const audience = [readerCharacter, context.ai];
        const memory = createMemoryItem({
          id: `memory:${message.id}`,
          storyWorld: world,
          kind: "CONVERSATION_SUMMARY",
          visibility: "RELATION" as MemoryVisibility,
          source: "LLM_DERIVED",
          content: content.slice(0, 1000),
          confidence: 0.35,
          createdAt: message.createdAt,
          subjectCharacter: context.ai,
          audienceCharacters: audience,
          sourceRef: message.id,
        });
        await this.repositories.memories.save(memory);
      }
    }
    return result;
  }

  public async completeReply(conversationId: string, readerCharacterId: string): Promise<ConversationReply> {
    const context = await this.context(conversationId, readerCharacterId);
    const result = await this.provider.complete({ messages: context.chat });
    return this.saveReply(context, result.content);
  }

  public async *streamReply(
    conversationId: string,
    readerCharacterId: string,
  ): AsyncGenerator<ChatDelta> {
    const context = await this.context(conversationId, readerCharacterId);
    let content = "";
    for await (const delta of this.provider.stream({ messages: context.chat })) {
      if (delta.content !== undefined) content += delta.content;
      yield delta;
    }
    await this.saveReply(context, content);
  }
}
