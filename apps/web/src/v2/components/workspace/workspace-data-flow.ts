export type DataFlowUsageStatus = "direct" | "partial" | "indirect" | "unused";

export type DataFlowCategoryId = "source" | "context" | "processor" | "output" | "runtime";

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

  // ── Context：调用模型前组装的上下文 ──
  { id: "chat_context", label: "聊天上下文", secondaryLabel: "Chat Context", category: "context", description: "系统在调用聊天模型前组装的上下文：世界观、角色、事实、规则、记忆、最近消息与当前输入。" },
  { id: "scene_generation_context", label: "生成上下文", secondaryLabel: "Generation Context", category: "context", description: "场景生成请求实际组装后的上下文：提示词、事实、角色名称、场景标题。" },
  { id: "comfyui_payload", label: "ComfyUI 载荷", secondaryLabel: "ComfyUI Payload", category: "context", description: "把提示词、负面提示词、工作流、版本和种子打包为发送给 ComfyUI 的载荷。" },

  // ── Output：产出物 ──
  { id: "chat_reply", label: "角色回复", category: "output", description: "聊天模型生成的角色对话内容。" },
  { id: "scene_candidate", label: "场景候选", category: "output", description: "AI 生成的候选场景，需要人工审核后才能写入正式数据。", actionPath: "/v2/workspace/ai-scene-review" },
  { id: "image_candidate", label: "图片候选", category: "output", description: "ComfyUI 生成的候选图片，需要人工审核后入库。", actionPath: "/v2/workspace/comfy-review" },
  { id: "fact_extraction", label: "事实提取", secondaryLabel: "Fact Extraction", category: "processor", description: "从聊天消息中提取结构化事实，进入事实账本与记忆流水线。" },
  { id: "scene_review", label: "场景审核", secondaryLabel: "Scene Review", category: "output", description: "人工审核场景候选，通过后才写入正式场景图。", actionPath: "/v2/workspace/ai-scene-review" },
  { id: "asset_review", label: "素材审核", secondaryLabel: "Asset Review", category: "output", description: "人工审核图片候选，通过后才成为正式素材。", actionPath: "/v2/workspace/comfy-review" },
  { id: "formal_scene_graph", label: "正式场景图", secondaryLabel: "Formal Scene Graph", category: "output", description: "审核通过后的正式场景结构，作为发布包的一部分。" },
  { id: "canon_release", label: "正式数据", secondaryLabel: "Canon", category: "output", description: "审核通过后的正式设定，作为发布包的一部分。" },

  // ── Runtime：发布与运行 ──
  { id: "release_manifest", label: "发布清单", secondaryLabel: "Release Manifest", category: "runtime", description: "打包 Canon、故事结构和状态 Schema 的不可变清单。", actionPath: "/v2/workspace/release" },
  { id: "player_runtime", label: "玩家运行时", secondaryLabel: "Player Runtime", category: "runtime", description: "读取发布包中的场景、选项和状态变量来运行游戏。", actionPath: "/v2/workspace/player" },
];

export const dataFlowEdges: readonly DataFlowEdge[] = [
  // Chat 链路：输入 → Chat Context → Chat LLM → 回复 → 事实提取 → 记忆
  { from: "world_summary", to: "chat_context", status: "direct" },
  { from: "character_name", to: "chat_context", status: "direct" },
  { from: "character_persona", to: "chat_context", status: "direct" },
  { from: "character_summary", to: "chat_context", status: "direct" },
  { from: "location", to: "chat_context", status: "partial" },
  { from: "fact", to: "chat_context", status: "direct" },
  { from: "rule", to: "chat_context", status: "direct" },
  { from: "memory", to: "chat_context", status: "direct" },
  { from: "state", to: "chat_context", status: "unused" },
  { from: "chat_context", to: "chat", status: "direct" },
  { from: "chat", to: "chat_reply", status: "direct" },
  { from: "chat_reply", to: "fact_extraction", status: "direct" },
  { from: "fact_extraction", to: "memory", status: "direct" },

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

  // Scene Generation 链路：输入 → Generation Context → Scene Model → 候选 → 审核 → 正式场景图
  { from: "fact", to: "scene_generation_context", status: "direct" },
  { from: "character_name", to: "scene_generation_context", status: "direct" },
  { from: "scene_title", to: "scene_generation_context", status: "direct" },
  { from: "character_persona", to: "scene_generation_context", status: "unused" },
  { from: "character_summary", to: "scene_generation_context", status: "unused" },
  { from: "location", to: "scene_generation_context", status: "unused" },
  { from: "rule", to: "scene_generation_context", status: "unused" },
  { from: "timeline", to: "scene_generation_context", status: "unused" },
  { from: "arc", to: "scene_generation_context", status: "unused" },
  { from: "scene_body", to: "scene_generation_context", status: "unused" },
  { from: "choice", to: "scene_generation_context", status: "unused" },
  { from: "state", to: "scene_generation_context", status: "unused" },
  { from: "memory", to: "scene_generation_context", status: "unused" },
  { from: "scene_generation_context", to: "scene_generation", status: "direct" },
  { from: "scene_generation", to: "scene_candidate", status: "direct" },
  { from: "scene_candidate", to: "scene_review", status: "direct" },
  { from: "scene_review", to: "formal_scene_graph", status: "direct" },

  // ComfyUI 链路：输入 → Payload → ComfyUI → 候选 → 审核 → 正式素材
  { from: "manual_prompt", to: "comfyui_payload", status: "direct" },
  { from: "character_name", to: "comfyui_payload", status: "unused" },
  { from: "character_persona", to: "comfyui_payload", status: "unused" },
  { from: "location", to: "comfyui_payload", status: "unused" },
  { from: "fact", to: "comfyui_payload", status: "unused" },
  { from: "state", to: "comfyui_payload", status: "unused" },
  { from: "comfyui_payload", to: "comfyui", status: "direct" },
  { from: "comfyui", to: "image_candidate", status: "direct" },
  { from: "image_candidate", to: "asset_review", status: "direct" },
  { from: "asset_review", to: "formal_asset", status: "direct" },

  // Release 与 Player：正式数据 → Release Manifest → Player Runtime
  { from: "canon_release", to: "release_manifest", status: "direct" },
  { from: "formal_scene_graph", to: "release_manifest", status: "direct" },
  { from: "formal_asset", to: "release_manifest", status: "direct" },
  { from: "release_manifest", to: "player_runtime", status: "direct" },
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

/**
 * 返回指定节点组（例如某一类 Canon 数据）在 main 流程中的使用摘要。
 * 结果按键为消费方节点 id，值为该数据到消费方的最高使用状态。
 */
export function getUsageSummaryForGroup(nodeIds: readonly string[]): ReadonlyMap<string, DataFlowUsageStatus> {
  const summary = new Map<string, DataFlowUsageStatus>();
  const relevant = dataFlowEdges.filter(
    (edge) => nodeIds.includes(edge.from) && edge.status !== "unused",
  );
  for (const edge of relevant) {
    const current = summary.get(edge.to);
    const rank: Record<DataFlowUsageStatus, number> = { direct: 3, partial: 2, indirect: 1, unused: 0 };
    if (current === undefined || rank[edge.status] > rank[current]) {
      summary.set(edge.to, edge.status);
    }
  }
  return summary;
}

/**
 * 返回过滤器对应的完整 pipeline（沿 edges 从入口到终点），
 * 而不是只取与 consumer 相邻的一跳。
 */
export function getPipelineEdges(filter: DataFlowFilter): readonly DataFlowEdge[] {
  if (filter.id === "all") return dataFlowEdges;
  const relevant = dataFlowEdges.filter((edge) => edge.status !== "unused");
  const adjacency = new Map<string, string[]>();
  for (const edge of relevant) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const visited = new Set<string>();
  const queue = [filter.consumerId];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  // Also walk backwards to include upstream sources.
  const reverseAdj = new Map<string, string[]>();
  for (const edge of relevant) {
    const list = reverseAdj.get(edge.to) ?? [];
    list.push(edge.from);
    reverseAdj.set(edge.to, list);
  }
  const upstream = new Set<string>();
  const upQueue = [filter.consumerId];
  while (upQueue.length > 0) {
    const nodeId = upQueue.shift()!;
    if (upstream.has(nodeId)) continue;
    upstream.add(nodeId);
    for (const prev of reverseAdj.get(nodeId) ?? []) {
      if (!upstream.has(prev)) upQueue.push(prev);
    }
  }
  const ids = new Set([...visited, ...upstream]);
  return relevant.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
}

export function getEdgesForFilter(filter: DataFlowFilter): readonly DataFlowEdge[] {
  return getPipelineEdges(filter);
}

export function getNodesForFilter(filter: DataFlowFilter): readonly DataFlowNode[] {
  if (filter.id === "all") return dataFlowNodes;
  const edges = getPipelineEdges(filter);
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.from);
    ids.add(edge.to);
  }
  return dataFlowNodes.filter((node) => ids.has(node.id));
}

/**
 * 按 layer 对 pipeline 节点分层：同一层无互相依赖，自上而下为数据流方向。
 * 返回的每一层是一组节点 id。
 */
export function getPipelineStages(filter: DataFlowFilter): readonly (readonly string[])[] {
  const edges = getPipelineEdges(filter);
  if (filter.id === "all") {
    return [dataFlowNodes.map((node) => node.id)];
  }
  const incoming = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of dataFlowNodes) {
    incoming.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)!.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const layerOf = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) {
      layerOf.set(id, 0);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const currentLayer = layerOf.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      const nextLayer = Math.max(layerOf.get(next) ?? 0, currentLayer + 1);
      layerOf.set(next, nextLayer);
      const remaining = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  const maxLayer = Math.max(0, ...layerOf.values());
  const layers: string[][] = [];
  for (let i = 0; i <= maxLayer; i += 1) layers.push([]);
  for (const [id, layer] of layerOf) {
    if (layer >= 0 && layer <= maxLayer) layers[layer]!.push(id);
  }
  return layers.filter((layer) => layer.length > 0);
}
