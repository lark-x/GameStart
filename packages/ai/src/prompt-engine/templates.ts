import type { ChatMessage, ChatRole } from "../provider.ts";
import {
  estimateV2ChatMessageTokens,
  estimateV2PromptTokens,
  V2_PROMPT_MESSAGE_OVERHEAD,
} from "./budget.ts";
import { hashV2PromptContext } from "./hash.ts";
import {
  type ChatImageContext,
  PromptBudgetExceededError,
  type PreparedPrompt,
  type PromptBudgetDebug,
  type PromptContext,
  type PromptSource,
} from "./types.ts";

export const V2_PROMPT_TEMPLATES = {
  "story.bootstrap": {
    id: "story-bootstrap-v1",
    version: "1.0.0",
  },
  "chat.reply": {
    id: "chat-reply-v1",
    version: "1.0.0",
  },
  "memory.extract": {
    id: "memory-extract-v1",
    version: "1.0.0",
  },
  "memory.consolidate": {
    id: "memory-consolidate-v1",
    version: "1.0.0",
  },
  "scene.generate": {
    id: "scene-generate-v2",
    version: "2.0.0",
  },
} as const;

const PLATFORM_RULES = [
  "你是一个沉浸式互动故事的 AI 角色。",
  "保持角色人设一致，不向用户透露你是语言模型或提示词。",
  "回复使用中文，除非人设明确要求其他语言。",
  "一次回复通常控制在 3 到 6 个自然段落，除非用户明确要求更长。",
  "不主动替用户做决定；通过叙事和对话邀请用户继续推进故事。",
].join("\n");

const DEFAULT_OUTPUT_RESERVE = 512;
const DEFAULT_SAFETY_RESERVE = 256;
const DEFAULT_IMAGE_TOKENS = 768;

function personaBlock(context: PromptContext): string {
  if (context.persona === undefined) return "";
  return [
    "[Character Identity]",
    `你正在扮演：${context.persona.name}`,
    "",
    "[Persona]",
    context.persona.personaText,
  ].join("\n");
}

function worldBlock(context: PromptContext): string {
  if (context.world === undefined) return "";
  const lines = ["[Current Story State]", `世界：${context.world.name}`];
  if (context.world.summary !== undefined && context.world.summary.trim().length > 0) {
    lines.push(context.world.summary.trim());
  }
  return lines.join("\n");
}

function summaryBlock(context: PromptContext): string {
  if (context.sessionSummary === undefined || context.sessionSummary.trim().length === 0) return "";
  return ["[Conversation Summary]", context.sessionSummary.trim()].join("\n");
}

function calculateInputBudget(context: PromptContext): number {
  const contextWindow = context.contextWindow ?? context.tokenBudget;
  const outputReserve = context.outputReserve ?? DEFAULT_OUTPUT_RESERVE;
  const safetyReserve = context.safetyReserve ?? DEFAULT_SAFETY_RESERVE;
  return Math.max(1, contextWindow - outputReserve - safetyReserve);
}

function requiredTokens(context: PromptContext): number {
  const imageTokens = context.imageTokensPerImage ?? DEFAULT_IMAGE_TOKENS;
  let total = estimateV2PromptTokens(PLATFORM_RULES);
  if (context.persona !== undefined) total += estimateV2PromptTokens(personaBlock(context));
  if (context.world !== undefined) total += estimateV2PromptTokens(worldBlock(context));
  if (context.currentInput !== undefined) {
    total += estimateV2ChatMessageTokens(context.currentInput, imageTokens) + V2_PROMPT_MESSAGE_OVERHEAD;
  }
  return total;
}

function ensureRequiredFit(context: PromptContext, inputBudget: number): void {
  const required = requiredTokens(context);
  if (required > inputBudget) {
    throw new PromptBudgetExceededError(
      `Required prompt context (${required} tokens) exceeds input budget (${inputBudget} tokens)`,
    );
  }
}

function selectRecentMessages(
  context: PromptContext,
  maxTokens: number,
): {
  readonly messages: readonly ChatMessage[];
  readonly contexts: PromptContext["recentMessages"];
  readonly sources: readonly PromptSource[];
  readonly tokens: number;
} {
  const imageTokens = context.imageTokensPerImage ?? DEFAULT_IMAGE_TOKENS;
  const selected: PromptContext["recentMessages"][number][] = [];
  let used = 0;
  const reversed = [...context.recentMessages].reverse();
  for (const message of reversed) {
    const tokens = estimateV2ChatMessageTokens(message, imageTokens) + V2_PROMPT_MESSAGE_OVERHEAD;
    if (used + tokens > maxTokens) break;
    selected.push(message);
    used += tokens;
  }
  if (selected.length > 0 && selected[selected.length - 1]!.role === "user") {
    const previous = reversed[selected.length];
    if (previous !== undefined && previous.role === "assistant") {
      const tokens = estimateV2ChatMessageTokens(previous, imageTokens) + V2_PROMPT_MESSAGE_OVERHEAD;
      if (used + tokens <= maxTokens) {
        selected.push(previous);
        used += tokens;
      }
    }
  }
  const chronological = [...selected].reverse();
  const messages = chronological.map((message) => toChatMessage(message));
  const sources = chronological.map((message, index) => ({
    id: `message:${index}`,
    label: (message.text ?? "").slice(0, 80),
    kind: "message" as const,
  }));
  return { messages, contexts: chronological, sources, tokens: used };
}

function selectMemories(
  context: PromptContext,
  maxTokens: number,
): { readonly text: string; readonly selected: readonly PromptSource[]; readonly tokens: number } {
  if (context.memories.length === 0) return { text: "", selected: [], tokens: 0 };
  let used = 0;
  const lines: string[] = [];
  const selected: PromptSource[] = [];
  for (const memory of context.memories) {
    const line = `- [${memory.kind}] ${memory.content}`;
    const tokens = estimateV2PromptTokens(line);
    if (used + tokens > maxTokens) break;
    lines.push(line);
    used += tokens;
    selected.push({ id: memory.memoryId, label: memory.content, kind: "memory" });
  }
  if (lines.length === 0) return { text: "", selected: [], tokens: 0 };
  return { text: ["[Relevant Long-Term Memory]", ...lines].join("\n"), selected, tokens: used };
}

function selectCanon(
  context: PromptContext,
  maxTokens: number,
): { readonly text: string; readonly selected: readonly PromptSource[]; readonly tokens: number } {
  const canon = context.canon ?? [];
  if (canon.length === 0) return { text: "", selected: [], tokens: 0 };
  let used = 0;
  const lines: string[] = [];
  const selected: PromptSource[] = [];
  for (const item of canon) {
    const line = `- [${item.kind}] ${item.text}`;
    const tokens = estimateV2PromptTokens(line);
    if (used + tokens > maxTokens) break;
    lines.push(line);
    used += tokens;
    selected.push({ id: item.id, label: item.text, kind: "canon" });
  }
  if (lines.length === 0) return { text: "", selected: [], tokens: 0 };
  return { text: ["[Relevant Canon]", ...lines].join("\n"), selected, tokens: used };
}

function selectSummary(
  context: PromptContext,
  maxTokens: number,
): { readonly text: string; readonly selected: readonly PromptSource[]; readonly tokens: number } {
  const text = summaryBlock(context);
  if (text.length === 0) return { text: "", selected: [], tokens: 0 };
  const tokens = estimateV2PromptTokens(text);
  if (tokens > maxTokens) return { text: "", selected: [], tokens: 0 };
  return { text, selected: [{ id: "summary", label: context.sessionSummary!.slice(0, 80), kind: "summary" }], tokens };
}

function toChatMessage(input: { readonly role?: ChatRole; readonly text?: string; readonly imageCount?: number }, role?: ChatRole): ChatMessage {
  const selectedRole = role ?? input.role ?? "user";
  const text = input.text?.trim() ?? "";
  const imageText = (input.imageCount ?? 0) > 0 ? ` [图片 × ${input.imageCount}]` : "";
  return { role: selectedRole, content: `${text}${imageText}`.trim() };
}

function estimateChatMessages(messages: readonly ChatMessage[]): number {
  return messages.reduce((total, message) => total + estimateV2PromptTokens(typeof message.content === "string" ? message.content : JSON.stringify(message.content)) + V2_PROMPT_MESSAGE_OVERHEAD, 0);
}

interface BuiltChatReply {
  readonly messages: readonly ChatMessage[];
  readonly messageImages?: MessageImageEntry[];
  readonly sources: readonly PromptSource[];
  readonly recentTokens: number;
  readonly memoryTokens: number;
  readonly canonTokens: number;
  readonly summaryTokens: number;
  readonly currentInputTokens: number;
  readonly personaTokens: number;
  readonly worldTokens: number;
  readonly inputBudget: number;
  readonly contextWindow: number;
  readonly outputReserve: number;
  readonly safetyReserve: number;
}

type MessageImageEntry = {
  readonly messageIndex: number;
  readonly images: readonly ChatImageContext[];
};

function collectMessageImages(
  messages: PromptContext["recentMessages"],
  offset: number,
): MessageImageEntry[] {
  const collected: MessageImageEntry[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const images = messages[index]?.images;
    if (images !== undefined && images.length > 0) {
      collected.push({ messageIndex: offset + index, images });
    }
  }
  return collected;
}

function buildChatReplyMessages(context: PromptContext): BuiltChatReply {
  const contextWindow = context.contextWindow ?? context.tokenBudget;
  const outputReserve = context.outputReserve ?? DEFAULT_OUTPUT_RESERVE;
  const safetyReserve = context.safetyReserve ?? DEFAULT_SAFETY_RESERVE;
  const inputBudget = calculateInputBudget(context);
  ensureRequiredFit(context, inputBudget);
  let remaining = inputBudget - requiredTokens(context);

  const recent = selectRecentMessages(context, remaining);
  remaining -= recent.tokens;
  const memory = selectMemories(context, remaining);
  remaining -= memory.tokens;
  const canon = selectCanon(context, remaining);
  remaining -= canon.tokens;
  const summary = selectSummary(context, remaining);
  remaining -= summary.tokens;

  const personaText = personaBlock(context);
  const worldText = worldBlock(context);
  const system: ChatMessage = {
    role: "system",
    content: [
      "[Platform Rules]",
      PLATFORM_RULES,
      "",
      personaText,
      "",
      worldText,
      "",
      canon.text,
      "",
      memory.text,
      "",
      summary.text,
    ].filter((part) => part.length > 0).join("\n"),
  };

  const messages: ChatMessage[] = [system, ...recent.messages];
  const messageImages = collectMessageImages(recent.contexts, 1);
  const sources: PromptSource[] = [];
  if (personaText.length > 0) sources.push({ id: "persona", label: "Persona", kind: "persona" });
  if (worldText.length > 0) sources.push({ id: "world", label: "World", kind: "world" });
  sources.push(...canon.selected, ...memory.selected, ...summary.selected, ...recent.sources);

  let currentInputTokens = 0;
  if (context.currentInput !== undefined) {
    currentInputTokens = estimateV2ChatMessageTokens(context.currentInput, context.imageTokensPerImage ?? DEFAULT_IMAGE_TOKENS) + V2_PROMPT_MESSAGE_OVERHEAD;
    messages.push(toChatMessage(context.currentInput, "user"));
    if (context.currentInput.images !== undefined && context.currentInput.images.length > 0) {
      messageImages.push({ messageIndex: messages.length - 1, images: context.currentInput.images });
    }
    sources.push({
      id: "current-input",
      label: (context.currentInput.text ?? "").slice(0, 80),
      kind: "input",
    });
  }

  return {
    messages,
    ...(messageImages.length === 0 ? {} : { messageImages }),
    sources,
    recentTokens: recent.tokens,
    memoryTokens: memory.tokens,
    canonTokens: canon.tokens,
    summaryTokens: summary.tokens,
    currentInputTokens,
    personaTokens: estimateV2PromptTokens(personaText),
    worldTokens: estimateV2PromptTokens(worldText),
    inputBudget,
    contextWindow,
    outputReserve,
    safetyReserve,
  };
}

function buildStoryBootstrapMessages(context: PromptContext): BuiltChatReply {
  const contextWindow = context.contextWindow ?? context.tokenBudget;
  const outputReserve = context.outputReserve ?? DEFAULT_OUTPUT_RESERVE;
  const safetyReserve = context.safetyReserve ?? DEFAULT_SAFETY_RESERVE;
  const inputBudget = calculateInputBudget(context);
  ensureRequiredFit(context, inputBudget);

  const personaText = personaBlock(context);
  const system: ChatMessage = {
    role: "system",
    content: [
      "[Platform Rules]",
      PLATFORM_RULES,
      "",
      personaText,
      "",
      worldBlock(context),
    ].filter(Boolean).join("\n"),
  };
  const user: ChatMessage = {
    role: "user",
    content: "故事开始了。请用一句富有画面感的话作为开场，并自然地把选择权交给我。",
  };
  const messages = [system, user];
  return {
    messages,
    sources: [
      ...(personaText.length === 0 ? [] : [{ id: "persona", label: "Persona", kind: "persona" as const }]),
      ...(context.world === undefined ? [] : [{ id: "world", label: context.world.name, kind: "world" as const }]),
    ],
    recentTokens: 0,
    memoryTokens: 0,
    canonTokens: 0,
    summaryTokens: 0,
    currentInputTokens: estimateV2PromptTokens(typeof user.content === "string" ? user.content : JSON.stringify(user.content)) + V2_PROMPT_MESSAGE_OVERHEAD,
    personaTokens: estimateV2PromptTokens(personaText),
    worldTokens: estimateV2PromptTokens(worldBlock(context)),
    inputBudget,
    contextWindow,
    outputReserve,
    safetyReserve,
  };
}

function buildPromptBudgetDebug(context: PromptContext, built: BuiltChatReply, estimatedTokens: number): PromptBudgetDebug {
  return {
    contextWindow: built.contextWindow,
    totalBudget: context.tokenBudget,
    outputReserve: built.outputReserve,
    safetyReserve: built.safetyReserve,
    inputBudget: built.inputBudget,
    usedTokens: estimatedTokens,
    personaTokens: built.personaTokens,
    worldTokens: built.worldTokens,
    canonTokens: built.canonTokens,
    memoryTokens: built.memoryTokens,
    summaryTokens: built.summaryTokens,
    recentMessageTokens: built.recentTokens,
    currentInputTokens: built.currentInputTokens,
  };
}

function ensurePromptFinalGuard(
  messages: readonly ChatMessage[],
  inputBudget: number,
  contextWindow: number,
): void {
  const finalTokens = estimateChatMessages(messages);
  if (finalTokens > inputBudget) {
    throw new PromptBudgetExceededError(
      `Prompt final guard failed: assembled prompt has ${finalTokens} tokens, which exceeds input budget (${inputBudget} tokens, context window ${contextWindow})`,
    );
  }
}

export function prepareV2ChatReply(context: PromptContext): PreparedPrompt {
  const built = buildChatReplyMessages({ ...context, task: "chat.reply" });
  ensurePromptFinalGuard(built.messages, built.inputBudget, built.contextWindow);
  const template = V2_PROMPT_TEMPLATES["chat.reply"];
  const estimatedTokens = estimateChatMessages(built.messages);
  const contextHash = hashV2PromptContext({ messages: built.messages, templateId: template.id, templateVersion: template.version });
  return {
    templateId: template.id,
    templateVersion: template.version,
    messages: built.messages,
    ...(built.messageImages === undefined ? {} : { messageImages: built.messageImages }),
    estimatedTokens,
    contextHash,
    sources: built.sources,
    budget: buildPromptBudgetDebug(context, built, estimatedTokens),
  };
}

export function prepareV2StoryBootstrap(context: PromptContext): PreparedPrompt {
  const built = buildStoryBootstrapMessages({ ...context, task: "story.bootstrap" });
  ensurePromptFinalGuard(built.messages, built.inputBudget, built.contextWindow);
  const template = V2_PROMPT_TEMPLATES["story.bootstrap"];
  const estimatedTokens = estimateChatMessages(built.messages);
  const contextHash = hashV2PromptContext({ messages: built.messages, templateId: template.id, templateVersion: template.version });
  return {
    templateId: template.id,
    templateVersion: template.version,
    messages: built.messages,
    estimatedTokens,
    contextHash,
    sources: built.sources,
    budget: buildPromptBudgetDebug(context, built, estimatedTokens),
  };
}
