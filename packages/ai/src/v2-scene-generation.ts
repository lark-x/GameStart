import type { ChatProvider } from "./provider.ts";

export interface V2SceneGenerationRequest {
  readonly context: V2GenerationContextSnapshot;
  readonly model?: string;
  readonly temperature?: number;
}

export interface V2GenerationContextSnapshot {
  readonly storyWorldId: string;
  readonly baseCanonRevision: number;
  readonly prompt: string;
  readonly tokenBudget: number;
  readonly contextHash: string;
  readonly facts: readonly unknown[];
  readonly characters: readonly unknown[];
  readonly scenes: readonly unknown[];
}

export interface V2SceneGenerationResult {
  readonly providerResponseId: string;
  readonly model: string;
  readonly content: string;
  readonly rawTextPreview: string;
  readonly finishReason?: string;
}

function contextPrompt(context: V2GenerationContextSnapshot): string {
  return [
    "Generate exactly one V2 scene candidate as JSON.",
    "The JSON shape must be {\"scene\":{\"sceneId\",\"title\",\"body\",\"participantCharacterIds\"},\"choices\":[{\"label\"}],\"validationNotes\":[]}.",
    "Do not include markdown fences or commentary.",
    `storyWorldId: ${context.storyWorldId}`,
    `baseCanonRevision: ${context.baseCanonRevision}`,
    `contextHash: ${context.contextHash}`,
    `creatorPrompt: ${context.prompt}`,
    `facts: ${JSON.stringify(context.facts)}`,
    `characters: ${JSON.stringify(context.characters)}`,
    `existingScenes: ${JSON.stringify(context.scenes)}`,
  ].join("\n");
}

export async function generateV2SceneCandidate(
  provider: ChatProvider,
  request: V2SceneGenerationRequest,
): Promise<V2SceneGenerationResult> {
  const response = await provider.complete({
    ...(request.model === undefined ? {} : { model: request.model }),
    temperature: request.temperature ?? 0.2,
    maxTokens: request.context.tokenBudget,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content: "You produce candidate JSON for a local creator-reviewed interactive fiction tool. Output only valid JSON.",
      },
      {
        role: "user",
        content: contextPrompt(request.context),
      },
    ],
    trace: {
      correlationId: `v2:generation:${request.context.contextHash}`,
    },
  });
  return {
    providerResponseId: response.id,
    model: response.model,
    content: response.content,
    rawTextPreview: response.content.slice(0, 1000),
    ...(response.finishReason === undefined ? {} : { finishReason: response.finishReason }),
  };
}
