export interface StoryAnalyzerChoiceOutput {
  readonly label: string;
  readonly consequenceSummary?: string | undefined;
}

export interface StoryAnalyzerSceneOutput {
  readonly title: string;
  readonly body: string;
  readonly choices: readonly StoryAnalyzerChoiceOutput[];
}

export interface StoryAnalyzerOutput {
  readonly scenes: readonly StoryAnalyzerSceneOutput[];
}

export type V2StoryAnalyzeResult = StoryAnalyzerOutput;

export class StructuredOutputError extends Error {
  public readonly code: "EMPTY_OUTPUT" | "INVALID_JSON" | "INVALID_SCHEMA";

  public constructor(code: "EMPTY_OUTPUT" | "INVALID_JSON" | "INVALID_SCHEMA", message: string) {
    super(message);
    this.name = "StructuredOutputError";
    this.code = code;
  }
}

export interface StoryAnalyzerPromptInput {
  readonly worldName?: string | undefined;
  readonly worldSummary?: string | undefined;
  readonly characterName?: string | undefined;
  readonly personaText?: string | undefined;
  readonly conversationSummary?: string | undefined;
  readonly memories?: readonly string[] | undefined;
  readonly messages: readonly { readonly role: string; readonly text?: string | undefined }[];
}

export function buildStoryAnalyzerPrompt(input: StoryAnalyzerPromptInput): {
  readonly system: string;
  readonly user: string;
} {
  const systemLines: string[] = [
    "你是一个资深互动叙事剧情分析专家（Story Analyzer）。",
    "你的职责是从玩家与角色的一段互动对话/故事历程中，提炼出可沉淀入正式剧本（Narrative Graph）的「剧情场景（Scenes）」和「关键分支选择（Choices）」。",
    "",
    "【输出格式规范】",
    "必须严格返回纯 JSON 格式（不得包含 markdown 外部包裹外的多余解释），结构如下：",
    JSON.stringify(
      {
        scenes: [
          {
            title: "场景标题（简明扼要，如：茶馆密谈）",
            body: "场景的核心叙事文本与对话回顾（200-500字），生动概括本幕剧情进展与角色互动。",
            choices: [
              {
                label: "玩家/故事可走向的分支选项 1",
                consequenceSummary: "该选择可能导致的剧情后果",
              },
              {
                label: "玩家/故事可走向的分支选项 2",
                consequenceSummary: "该选择可能导致的剧情后果",
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
  ];

  const userLines: string[] = [];
  if (input.worldName || input.worldSummary) {
    userLines.push(`【世界观背景】: ${input.worldName ?? "未知世界"}`);
    if (input.worldSummary) userLines.push(input.worldSummary);
  }
  if (input.characterName || input.personaText) {
    userLines.push(`【核心角色】: ${input.characterName ?? "角色"}`);
    if (input.personaText) userLines.push(`人设: ${input.personaText}`);
  }
  if (input.conversationSummary) {
    userLines.push(`【已有会话历史摘要】:\n${input.conversationSummary}`);
  }
  if (input.memories && input.memories.length > 0) {
    userLines.push(`【关键长期记忆】:\n${input.memories.map((m) => `- ${m}`).join("\n")}`);
  }

  userLines.push("【待分析的对话实录】:");
  for (const m of input.messages) {
    const roleLabel = m.role === "user" ? "玩家" : input.characterName ?? "角色";
    userLines.push(`${roleLabel}: ${m.text ?? "(多模态内容)"}`);
  }

  userLines.push("\n请基于以上对话分析并生成结构化的剧情场景与分支候选 JSON。");

  return {
    system: systemLines.join("\n"),
    user: userLines.join("\n"),
  };
}

export function parseStoryAnalyzerOutput(rawText: string): V2StoryAnalyzeResult {
  let cleaned = rawText.trim();
  // Strip Markdown code block if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") {
      throw new StructuredOutputError("INVALID_SCHEMA", "Story analyzer output must be a JSON object");
    }

    if (!Array.isArray(parsed.scenes)) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Story analyzer output is missing a scenes array");
    }
    const scenes = parsed.scenes.map((s: unknown) => {
      if (!s || typeof s !== "object" || !("title" in s) || !("body" in s)) {
        throw new StructuredOutputError("INVALID_SCHEMA", "Story analyzer scene must have title and body strings");
      }
      const scene = s as { readonly title: unknown; readonly body: unknown; readonly choices?: unknown };
      if (typeof scene.title !== "string" || typeof scene.body !== "string") {
        throw new StructuredOutputError("INVALID_SCHEMA", "Story analyzer scene title and body must be strings");
      }
      const choices = Array.isArray(scene.choices)
        ? scene.choices.map((c: unknown) => {
            if (!c || typeof c !== "object" || !("label" in c) || typeof c.label !== "string") {
              throw new StructuredOutputError("INVALID_SCHEMA", "Story analyzer choice must have a string label");
            }
            const choice = c as { readonly label: string; readonly consequenceSummary?: unknown };
            return {
              label: choice.label.trim(),
              ...(typeof choice.consequenceSummary === "string" ? { consequenceSummary: choice.consequenceSummary.trim() } : {}),
            };
          })
        : [];
      return {
        title: scene.title.trim(),
        body: scene.body.trim(),
        choices,
      };
    });
    if (scenes.length === 0) {
      throw new StructuredOutputError("EMPTY_OUTPUT", "Story analyzer returned no scenes");
    }

    return { scenes };
  } catch (error) {
    if (error instanceof StructuredOutputError) throw error;
    throw new StructuredOutputError("INVALID_JSON", "Story analyzer output is not valid JSON");
  }
}
