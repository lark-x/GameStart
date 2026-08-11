import {
  CharacterRole,
  MessageKind,
  createMessage,
  type Character,
  type ConversationAggregate,
  type EventExecution,
  type Message,
} from "@living-network/domain";
import type { ChatMessage, ChatProvider } from "@living-network/ai";
import type { DomainRepositories } from "@living-network/database";

export interface ProactiveMessageInput {
  readonly executionId: string;
  readonly conversationId: string;
  readonly actorCharacterId: string;
  readonly createdAt: string;
}

export interface ProactiveMessageResult {
  readonly message: Message;
  readonly inserted: boolean;
  readonly imagePrompt?: string;
  readonly workflowVersion?: string;
}

function toChatMessage(message: Message, character: Character | undefined): ChatMessage {
  if (message.kind === MessageKind.SYSTEM) return { role: "system", content: message.text ?? "" };
  return {
    role: character?.role === CharacterRole.USER ? "user" : "assistant",
    content: message.text ?? (message.mediaRef === undefined ? "" : `[image:${message.mediaRef}]`),
  };
}

function parseStructuredReply(content: string): { text: string; imagePrompt?: string; workflowVersion?: string } {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) return { text: content };
    return {
      text: parsed.text,
      ...(typeof parsed.imagePrompt === "string" ? { imagePrompt: parsed.imagePrompt } : {}),
      ...(typeof parsed.workflowVersion === "string" ? { workflowVersion: parsed.workflowVersion } : {}),
    };
  } catch {
    return { text: content };
  }
}

export class ProactiveMessageCoordinator {
  private readonly repositories: DomainRepositories;
  private readonly provider: ChatProvider;

  public constructor(repositories: DomainRepositories, provider: ChatProvider) {
    if (!repositories.eventExecutions || !repositories.conversations || !repositories.messages) {
      throw new TypeError("Proactive message repositories are not configured");
    }
    this.repositories = repositories;
    this.provider = provider;
  }

  public async generate(input: ProactiveMessageInput): Promise<ProactiveMessageResult> {
    const execution = await this.repositories.eventExecutions!.getById(input.executionId);
    if (!execution) throw new TypeError(`Unknown event execution: ${input.executionId}`);
    const conversation = await this.repositories.conversations!.getById(input.conversationId);
    if (!conversation) throw new TypeError(`Unknown conversation: ${input.conversationId}`);
    const actor = await this.repositories.characters.getById(input.actorCharacterId);
    if (!actor || actor.role !== CharacterRole.AI) throw new TypeError("Proactive actor must be an AI character");
    if (!conversation.members.some((member) => member.characterId === actor.id && member.leftAt === undefined)) {
      throw new TypeError("Proactive actor must be an active conversation member");
    }
    const history = await this.repositories.messages!.listByConversation(conversation.conversation.id);
    const characters = await Promise.all(history.map((message) =>
      message.authorCharacterId === undefined ? Promise.resolve(undefined) : this.repositories.characters.getById(message.authorCharacterId)));
    const characterById = new Map(characters.filter((character): character is Character => character !== undefined).map((character) => [character.id, character]));
    const prompt: ChatMessage = {
      role: "system",
      content: `Generate a proactive in-world reply for event ${execution.definitionId}. Keep it concise. Snapshot: ${JSON.stringify(execution.inputSnapshot)}`,
    };
    const completion = await this.provider.complete({
      messages: [prompt, ...history.map((message) => toChatMessage(message, message.authorCharacterId === undefined ? undefined : characterById.get(message.authorCharacterId)))],
      responseFormat: "json_object",
    });
    const reply = parseStructuredReply(completion.content);
    const message = createMessage({
      id: `proactive:${input.executionId}:${input.conversationId}`,
      conversation,
      author: actor,
      kind: MessageKind.TEXT,
      text: reply.text,
      createdAt: input.createdAt,
      idempotencyKey: `proactive:${input.executionId}:${input.conversationId}`,
    });
    let saved: { message: Message; inserted: boolean };
    try {
      saved = await this.repositories.messages!.save(message);
    } catch (error) {
      if (!(error instanceof TypeError) || !error.message.includes("idempotency")) throw error;
      const existing = (await this.repositories.messages!.listByConversation(conversation.conversation.id)).find((candidate) => candidate.idempotencyKey === message.idempotencyKey);
      if (!existing) throw error;
      saved = { message: existing, inserted: false };
    }
    return {
      ...saved,
      ...(reply.imagePrompt === undefined ? {} : { imagePrompt: reply.imagePrompt }),
      ...(reply.workflowVersion === undefined ? {} : { workflowVersion: reply.workflowVersion }),
    };
  }
}
