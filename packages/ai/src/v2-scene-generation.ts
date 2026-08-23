import type { ChatCompletionRequest, ChatProvider } from "./provider.ts";

export interface V2SceneGenerationRequest {
  readonly context: V2GenerationContextSnapshot;
  readonly jobId?: string;
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
  readonly narrativeSections?: readonly { readonly title: string; readonly content: string }[];
}

export interface V2SceneGenerationResult {
  readonly providerResponseId: string;
  readonly model: string;
  readonly content: string;
  readonly rawTextPreview: string;
  readonly finishReason?: string;
}

export function buildV2SceneGenerationUserPrompt(context: V2GenerationContextSnapshot): string {
  return [
    "Generate exactly one V2 scene candidate as JSON.",
    "The JSON shape must be {\"scene\":{\"sceneId\",\"title\",\"body\",\"document\":{\"mode\",\"blocks\"},\"participantCharacterIds\"},\"references\":[],\"choices\":[{\"label\"}],\"validationNotes\":[]}.",
    "Do not include markdown fences or commentary.",
    `storyWorldId: ${context.storyWorldId}`,
    `baseCanonRevision: ${context.baseCanonRevision}`,
    `contextHash: ${context.contextHash}`,
    `creatorPrompt: ${context.prompt}`,
    ...(context.narrativeSections && context.narrativeSections.length > 0
      ? [`narrativeContext: ${JSON.stringify(context.narrativeSections)}`]
      : [
          `facts: ${JSON.stringify(context.facts)}`,
          `characters: ${JSON.stringify(context.characters)}`,
          `existingScenes: ${JSON.stringify(context.scenes)}`,
        ]),
  ].join("\n");
}

export function buildV2SceneGenerationMessages(context: V2GenerationContextSnapshot) {
  return [
    {
      role: "system" as const,
      content: "You produce candidate JSON for a local creator-reviewed interactive fiction tool. Output only valid JSON.",
    },
    {
      role: "user" as const,
      content: buildV2SceneGenerationUserPrompt(context),
    },
  ];
}

export function buildV2SceneGenerationProviderRequest(
  request: V2SceneGenerationRequest,
): ChatCompletionRequest {
  return {
    ...(request.model === undefined ? {} : { model: request.model }),
    temperature: request.temperature ?? 0.2,
    maxTokens: request.context.tokenBudget,
    responseFormat: "json_object",
    messages: buildV2SceneGenerationMessages(request.context),
    trace: {
      correlationId: `v2:generation:${request.context.contextHash}`,
      storyWorldId: request.context.storyWorldId,
      capability: "scene_generation",
      ...(request.jobId === undefined ? {} : { jobId: request.jobId }),
    },
  };
}

export async function generateV2SceneCandidate(
  provider: ChatProvider,
  request: V2SceneGenerationRequest,
): Promise<V2SceneGenerationResult> {
  const response = await provider.complete(buildV2SceneGenerationProviderRequest(request));
  return {
    providerResponseId: response.id,
    model: response.model,
    content: response.content,
    rawTextPreview: response.content.slice(0, 1000),
    ...(response.finishReason === undefined ? {} : { finishReason: response.finishReason }),
  };
}
