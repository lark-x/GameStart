import type {
  V2ModelBindingDto,
  V2ModelProfileDto,
  V2PlatformCapabilities,
} from "@living-network/contracts/v2";
import { V2PlatformClientError } from "../adapters/platform.ts";

export type CapabilityTone = "success" | "warning" | "danger" | "neutral";

export interface CapabilityRuntimeItem {
  readonly capability: "scene_generation" | "asset_generation";
  readonly name: string;
  readonly enabled: boolean;
  readonly modelLabel: string;
  readonly statusLabel: string;
  readonly statusTone: CapabilityTone;
  readonly configured: boolean;
}

export interface CapabilityBindingRow {
  readonly capability: string;
  readonly label: string;
  readonly modelLabel: string;
  readonly tone: CapabilityTone;
}

export interface ModelProfileSummary {
  readonly id: string;
  readonly name: string;
  readonly providerLabel: string;
  readonly modalityLabel: string;
  readonly hasApiKey: boolean;
}

export interface ModelPreset {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly description: string;
  readonly protocol: "openai-compatible" | "anthropic";
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: string;
  readonly maxTokens: string;
  readonly contextWindow: string;
  readonly inputModalities: string[];
  readonly temperature: string;
}

export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: "deepseek-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek 官方",
    description: "高性价比通用对话与长文本推理",
    protocol: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    timeoutMs: "60000",
    maxTokens: "8192",
    contextWindow: "65536",
    inputModalities: ["text"],
    temperature: "0.3",
  },
  {
    id: "deepseek-r1-silicon",
    name: "SiliconFlow DeepSeek R1",
    provider: "硅基流动",
    description: "国内高速托管深度思考大模型",
    protocol: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-R1",
    timeoutMs: "90000",
    maxTokens: "4096",
    contextWindow: "32768",
    inputModalities: ["text"],
    temperature: "0.6",
  },
  {
    id: "openai-gpt4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "旗舰级全能多模态，支持图文理解",
    protocol: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    timeoutMs: "45000",
    maxTokens: "4096",
    contextWindow: "128000",
    inputModalities: ["text", "image"],
    temperature: "0.2",
  },
  {
    id: "anthropic-claude",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "顶级叙事创作与角色扮演大模型",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-20241022",
    timeoutMs: "60000",
    maxTokens: "8192",
    contextWindow: "200000",
    inputModalities: ["text", "image"],
    temperature: "0.3",
  },
  {
    id: "ollama-local",
    name: "Ollama 本地 (Qwen 2.5)",
    provider: "本地离线",
    description: "本机或局域网私有化运行",
    protocol: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    timeoutMs: "60000",
    maxTokens: "4096",
    contextWindow: "32768",
    inputModalities: ["text"],
    temperature: "0.2",
  },
];

export function connectionLabel(value: string | undefined): string {
  if (value === "ok") return "连接正常";
  if (value === "failed") return "连接失败";
  if (value === "checking") return "检测中";
  return "未测试";
}

export function connectionTone(value: string | undefined): CapabilityTone {
  if (value === "ok") return "success";
  if (value === "failed") return "danger";
  if (value === "checking") return "warning";
  return "neutral";
}

export function providerLabel(protocol: string): string {
  return protocol === "anthropic" ? "Anthropic" : "OpenAI 兼容";
}

export function modalityLabel(modalities: readonly string[] | undefined): string {
  const items = modalities ?? ["text"];
  const labels = items.includes("text") && items.includes("image") ? ["文本", "图片"] : ["文本"];
  return labels.join(" / ");
}

export function buildCapabilityRuntimeItems(
  capabilities: V2PlatformCapabilities | null,
  bindings: readonly V2ModelBindingDto[],
): readonly CapabilityRuntimeItem[] {
  if (capabilities === null) return [];
  const sceneBinding = bindings.find((binding) => binding.capability === "scene_generation");
  const scene = capabilities.sceneGeneration;
  const asset = capabilities.assetGeneration;
  return [
    {
      capability: "scene_generation",
      name: "场景生成",
      enabled: scene.enabled,
      modelLabel: scene.configured && sceneBinding?.profileName !== undefined ? sceneBinding.profileName : "未配置模型",
      statusLabel: scene.configured ? connectionLabel(scene.connection) : "未配置",
      statusTone: scene.configured ? connectionTone(scene.connection) : "warning",
      configured: scene.configured,
    },
    {
      capability: "asset_generation",
      name: "素材生成",
      enabled: asset.enabled,
      modelLabel: asset.configured ? "已配置" : "未配置",
      statusLabel: asset.configured ? connectionLabel(asset.connection) : "未配置",
      statusTone: asset.configured ? connectionTone(asset.connection) : "warning",
      configured: asset.configured,
    },
  ];
}

const BINDING_LABELS: Readonly<Record<string, string>> = {
  chat: "对话",
  scene_generation: "场景生成",
  memory: "Memory",
  story_analysis: "剧情分析",
};

export function buildCapabilityBindingRows(
  bindings: readonly V2ModelBindingDto[],
): readonly CapabilityBindingRow[] {
  const order = ["chat", "scene_generation", "memory", "story_analysis"];
  return order.map((capability) => {
    const binding = bindings.find((item) => item.capability === capability);
    return {
      capability,
      label: BINDING_LABELS[capability] ?? capability,
      modelLabel: binding?.profileName ?? "未绑定",
      tone: binding?.profileId !== undefined ? ("success" as const) : ("warning" as const),
    };
  });
}

export function buildModelProfileSummaries(
  profiles: readonly V2ModelProfileDto[],
): readonly ModelProfileSummary[] {
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    providerLabel: providerLabel(profile.protocol),
    modalityLabel: modalityLabel(profile.inputModalities),
    hasApiKey: profile.hasApiKey,
  }));
}

export function formatCapabilityToggleError(error: unknown, fallback = "更新能力开关失败"): string {
  if (error instanceof V2PlatformClientError) {
    if (error.code === "CAPABILITY_DISABLED") return "该能力当前已关闭。";
    if (error.code === "MODEL_NOT_BOUND") return "尚未为该能力配置模型。";
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : fallback;
}
