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
