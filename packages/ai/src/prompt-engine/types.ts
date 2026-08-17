import type { ChatMessage } from "../provider.ts";

export type PromptTask =
  | "story.bootstrap"
  | "chat.reply"
  | "memory.extract"
  | "memory.consolidate"
  | "scene.generate";

export interface PersonaContext {
  readonly name: string;
  readonly personaText: string;
}

export interface WorldContext {
  readonly storyWorldId: string;
  readonly name: string;
  readonly summary?: string;
}

export interface CanonContextItem {
  readonly id: string;
  readonly kind: "fact" | "rule" | "character";
  readonly text: string;
}

export interface MemoryContext {
  readonly memoryId: string;
  readonly kind: string;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
}

export interface ChatInput {
  readonly text?: string;
  readonly imageCount: number;
}

export interface ChatMessageContext {
  readonly role: "user" | "assistant" | "system";
  readonly text?: string;
  readonly imageCount: number;
}

export interface PromptContext {
  readonly task: PromptTask;
  readonly persona?: PersonaContext;
  readonly world?: WorldContext;
  readonly canon?: readonly CanonContextItem[];
  readonly memories: readonly MemoryContext[];
  readonly sessionSummary?: string;
  readonly recentMessages: readonly ChatMessageContext[];
  readonly currentInput?: ChatInput;
  readonly tokenBudget: number;
}

export interface PromptSource {
  readonly id: string;
  readonly label: string;
  readonly kind: "persona" | "world" | "canon" | "memory" | "summary" | "message" | "input";
}

export interface PreparedPrompt {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly messages: readonly ChatMessage[];
  readonly estimatedTokens: number;
  readonly contextHash: string;
  readonly sources: readonly PromptSource[];
}
