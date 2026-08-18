import type { ChatMessage } from "../../provider.ts";

export interface FactExtractionPromptInput {
  readonly messages: readonly {
    readonly role: "user" | "assistant" | "system";
    readonly messageId: string;
    readonly text?: string;
  }[];
  readonly extractorVersion: string;
}

export function buildFactExtractionPrompt(input: FactExtractionPromptInput): { readonly system: string; readonly user: string } {
  const system = [
    "你是一个事实抽取代理（Fact Extractor）。",
    "你的职责是从一段聊天对话中抽取确定、离散、可验证的事实断言（Fact Assertions）。",
    "",
    "【输出格式规范】",
    "必须严格返回纯 JSON 数组，不要输出任何额外解释。每个元素结构如下：",
    JSON.stringify({
      subject: {
        entityType: "user | character | location | item | faction | concept",
        entityId: "实体的稳定 ID（如 user:local / character:alice）",
        label: "实体显示名（可选）",
      },
      predicate: "关系谓词（如 preferred_coffee / knows / located_at）",
      object: {
        type: "text | number | boolean | entity",
        value: "对象值；entity 类型时为实体 ID",
        entityId: "当 type=entity 时必填",
      },
      kind: "profile | preference | relationship | episodic | world_fact",
      text: "自然语言表述的事实",
      changeHint: "new | restate | corrects | replaces_previous | unknown",
      epistemicStatus: "asserted | observed | reported | inferred | unknown（可选，默认 asserted）",
      confidence: "0 到 1 之间的数字",
      importanceHint: "0 到 1 之间的数字，表示该事实对长期记忆的重要性",
      sourceMessageIds: ["引用的消息 ID 数组，必须来自给定对话"],
    }, null, 2),
    "",
    "规则：",
    "1. 只抽取明确陈述或可明确推断的事实；不确定时降低 confidence。",
    "2. 用户偏好/角色关系发生变化时，使用 changeHint=replaces_previous 表示新事实取代旧事实，不要删除旧事实。",
    "3. 每条事实必须引用至少一条 sourceMessageId。",
    "4. 不要编造实体或事实。",
  ].join("\n");

  const lines = input.messages.map((message) => {
    const roleLabel = message.role === "user" ? "USER" : message.role === "assistant" ? "ASSISTANT" : "SYSTEM";
    return `[ID: ${message.messageId}] ${roleLabel}: ${message.text ?? ""}`;
  });
  const user = [
    `Extractor version: ${input.extractorVersion}`,
    "",
    "【待抽取的对话实录】",
    ...lines,
    "",
    "请输出事实断言 JSON 数组：",
  ].join("\n");

  return { system, user };
}
