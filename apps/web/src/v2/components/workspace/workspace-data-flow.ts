export type DataFlowUsageStatus = "direct" | "partial" | "indirect" | "unused";

export type DataFlowCategoryId = "source" | "processor" | "output" | "runtime";

export type DataFlowFilterId = "all" | "chat" | "scene" | "image" | "player" | "release";

export interface DataFlowNode {
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly category: DataFlowCategoryId;
  readonly description: string;
  readonly managePath?: string;
  readonly actionPath?: string;
  readonly selectable?: boolean;
}

export interface DataFlowEdge {
  readonly from: string;
  readonly to: string;
  readonly status: DataFlowUsageStatus;
}

export interface DataFlowFilter {
  readonly id: DataFlowFilterId;
  readonly label: string;
  readonly consumerId: string;
}

export const dataFlowNodes: readonly DataFlowNode[] = [
  // ── Source：创作者配置的数据 ──
  { id: "world_summary", label: "故事前提", secondaryLabel: "StoryWorld Summary", category: "source", description: "故事名称和世界观背景，是所有创作数据的根。", managePath: "/v2/workspace/project" },
  { id: "character_name", label: "角色名称", secondaryLabel: "Character Name", category: "source", description: "角色的名字，用于对话身份识别和场景生成上下文。", managePath: "/v2/workspace/world?tab=characters", selectable: true },
  { id: "character_persona", label: "角色人设", secondaryLabel: "Persona", category: "source", description: "角色的性格、说话方式和背景，用于聊天回复和剧情分析。", managePath: "/v2/workspace/world?tab=characters", selectable: true },
  { id: "character_summary", label: "角色简介", secondaryLabel: "Character Summary", category: "source", description: "角色的简要说明，用于聊天和剧情分析。", managePath: "/v2/workspace/world?tab=characters" },
  { id: "location", label: "地点", secondaryLabel: "Location", category: "source", description: "描述故事中的位置，可作为角色常驻地点。当前未进入 AI 生成链路。", managePath: "/v2/workspace/world?tab=locations", selectable: true },
  { id: "fact", label: "世界事实", secondaryLabel: "Fact", category: "source", description: "已经确认成立的世界信息，会直接进入场景生成上下文。", managePath: "/v2/workspace/world?tab=facts", selectable: true },
  { id: "rule", label: "世界规则", secondaryLabel: "Rule", category: "source", description: "世界中应遵守的约束（例如：死人不能复活）。当前只用于聊天上下文。", managePath: "/v2/workspace/world?tab=rules", selectable: true },
  { id: "timeline", label: "时间线", secondaryLabel: "Timeline", category: "source", description: "记录故事世界中的事件顺序。当前仅用于正典组织。", managePath: "/v2/workspace/world?tab=timeline" },
  { id: "arc", label: "剧情分组", secondaryLabel: "Arc", category: "source", description: "把场景按剧情段落分组。", managePath: "/v2/workspace/story" },
  { id: "scene_title", label: "场景标题", secondaryLabel: "Scene Title", category: "source", description: "场景的名称，会进入场景生成上下文。", managePath: "/v2/workspace/story" },
  { id: "scene_body", label: "场景正文", secondaryLabel: "Scene Body", category: "source", description: "场景的完整文本内容，玩家在运行时阅读。", managePath: "/v2/workspace/story" },
  { id: "choice", label: "分支选项", secondaryLabel: "Choice", category: "source", description: "玩家可以做出的选择，包含条件和状态后果。", managePath: "/v2/workspace/story" },
  { id: "state", label: "状态变量", secondaryLabel: "State Schema", category: "source", description: "故事运行时会变化的数据，服务于选择条件和玩家存档。当前不会自动发送给场景生成模型。", managePath: "/v2/workspace/state", selectable: true },
  { id: "memory", label: "记忆", secondaryLabel: "Memory", category: "source", description: "从对话中提取的角色记忆，用于后续聊天和分析。", managePath: "/v2/chat" },
  { id: "manual_prompt", label: "图片提示词", secondaryLabel: "Manual Prompt", category: "source", description: "用户手动填写的 ComfyUI 提示词，不自动携带故事设定。", managePath: "/v2/workspace/comfy-request" },
  { id: "formal_asset", label: "正式素材", secondaryLabel: "Formal Asset", category: "source", description: "审核通过的正式图片素材，随发布包导出。", managePath: "/v2/workspace/formal-assets" },

  // ── Processor：AI / 系统处理链 ──
  { id: "chat", label: "聊天对话", secondaryLabel: "Chat LLM", category: "processor", description: "使用角色、世界观、事实、规则和记忆生成角色回复。", actionPath: "/v2/chat" },
  { id: "story_analyze", label: "剧情分析", secondaryLabel: "Story Analyze", category: "processor", description: "从对话中提取候选场景，供审核后写入正式结构。" },
  { id: "scene_generation", label: "场景生成", secondaryLabel: "Scene Generation", category: "processor", description: "根据提示词、事实、角色名称和场景标题生成候选场景。", actionPath: "/v2/workspace/ai-scene-request" },
  { id: "comfyui", label: "图片生成", secondaryLabel: "ComfyUI", category: "processor", description: "使用手动填写的提示词和工作流生成图片，不自动读取故事设定。", actionPath: "/v2/workspace/comfy-request" },

  // ── Output：产出物 ──
  { id: "chat_reply", label: "角色回复", category: "output", description: "聊天模型生成的角色对话内容。" },
  { id: "scene_candidate", label: "场景候选", category: "output", description: "AI 生成的候选场景，需要人工审核后才能写入正式数据。", actionPath: "/v2/workspace/ai-scene-review" },
  { id: "image_candidate", label: "图片候选", category: "output", description: "ComfyUI 生成的候选图片，需要人工审核后入库。", actionPath: "/v2/workspace/comfy-review" },
  { id: "canon_release", label: "正式数据", secondaryLabel: "Canon", category: "output", description: "审核通过后的正式设定，作为发布包的一部分。" },

  // ── Runtime：发布与运行 ──
  { id: "release_manifest", label: "发布清单", secondaryLabel: "Release Manifest", category: "runtime", description: "打包 Canon、故事结构和状态 Schema 的不可变清单。", actionPath: "/v2/workspace/release" },
  { id: "player_runtime", label: "玩家运行时", secondaryLabel: "Player Runtime", category: "runtime", description: "读取发布包中的场景、选项和状态变量来运行游戏。", actionPath: "/v2/workspace/player" },
];

export const dataFlowEdges: readonly DataFlowEdge[] = [
  // Chat 链路
  { from: "character_name", to: "chat", status: "direct" },
  { from: "character_persona", to: "chat", status: "direct" },
  { from: "character_summary", to: "chat", status: "direct" },
  { from: "world_summary", to: "chat", status: "direct" },
  { from: "fact", to: "chat", status: "direct" },
  { from: "rule", to: "chat", status: "direct" },
  { from: "memory", to: "chat", status: "direct" },
  { from: "location", to: "chat", status: "unused" },
  { from: "state", to: "chat", status: "unused" },
  { from: "chat", to: "chat_reply", status: "direct" },

  // Story Analyze 链路
  { from: "character_name", to: "story_analyze", status: "direct" },
  { from: "character_persona", to: "story_analyze", status: "direct" },
  { from: "character_summary", to: "story_analyze", status: "partial" },
  { from: "world_summary", to: "story_analyze", status: "direct" },
  { from: "fact", to: "story_analyze", status: "partial" },
  { from: "memory", to: "story_analyze", status: "direct" },
  { from: "scene_title", to: "story_analyze", status: "partial" },
  { from: "scene_body", to: "story_analyze", status: "partial" },
  { from: "rule", to: "story_analyze", status: "unused" },
  { from: "story_analyze", to: "scene_candidate", status: "direct" },

  // Scene Generation 链路
  { from: "fact", to: "scene_generation", status: "direct" },
  { from: "character_name", to: "scene_generation", status: "direct" },
  { from: "scene_title", to: "scene_generation", status: "direct" },
  { from: "character_persona", to: "scene_generation", status: "unused" },
  { from: "character_summary", to: "scene_generation", status: "unused" },
  { from: "location", to: "scene_generation", status: "unused" },
  { from: "rule", to: "scene_generation", status: "unused" },
  { from: "timeline", to: "scene_generation", status: "unused" },
  { from: "arc", to: "scene_generation", status: "unused" },
  { from: "scene_body", to: "scene_generation", status: "unused" },
  { from: "choice", to: "scene_generation", status: "unused" },
  { from: "state", to: "scene_generation", status: "unused" },
  { from: "memory", to: "scene_generation", status: "unused" },
  { from: "scene_generation", to: "scene_candidate", status: "direct" },

  // ComfyUI 链路
  { from: "manual_prompt", to: "comfyui", status: "direct" },
  { from: "character_name", to: "comfyui", status: "unused" },
  { from: "character_persona", to: "comfyui", status: "unused" },
  { from: "location", to: "comfyui", status: "unused" },
  { from: "fact", to: "comfyui", status: "unused" },
  { from: "state", to: "comfyui", status: "unused" },
  { from: "comfyui", to: "image_candidate", status: "direct" },

  // 审核与正式化
  { from: "scene_candidate", to: "canon_release", status: "direct" },
  { from: "image_candidate", to: "formal_asset", status: "direct" },

  // Release 与 Player
  { from: "canon_release", to: "release_manifest", status: "direct" },
  { from: "formal_asset", to: "release_manifest", status: "direct" },
  { from: "arc", to: "player_runtime", status: "indirect" },
  { from: "scene_title", to: "player_runtime", status: "indirect" },
  { from: "scene_body", to: "player_runtime", status: "direct" },
  { from: "choice", to: "player_runtime", status: "direct" },
  { from: "state", to: "player_runtime", status: "direct" },
  { from: "player_runtime", to: "release_manifest", status: "indirect" },
];

export const dataFlowFilters: readonly DataFlowFilter[] = [
  { id: "all", label: "全部", consumerId: "" },
  { id: "chat", label: "聊天", consumerId: "chat" },
  { id: "scene", label: "场景生成", consumerId: "scene_generation" },
  { id: "image", label: "图片生成", consumerId: "comfyui" },
  { id: "player", label: "Player", consumerId: "player_runtime" },
  { id: "release", label: "Release", consumerId: "release_manifest" },
];

export function getDataFlowNode(id: string): DataFlowNode | undefined {
  return dataFlowNodes.find((node) => node.id === id);
}

export function getEdgesForFilter(filter: DataFlowFilter): readonly DataFlowEdge[] {
  if (filter.id === "all") return dataFlowEdges;
  return dataFlowEdges.filter(
    (edge) => edge.to === filter.consumerId || edge.from === filter.consumerId,
  );
}

export function getNodesForFilter(filter: DataFlowFilter): readonly DataFlowNode[] {
  if (filter.id === "all") return dataFlowNodes;
  const edges = getEdgesForFilter(filter);
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.from);
    ids.add(edge.to);
  }
  return dataFlowNodes.filter((node) => ids.has(node.id));
}
