import {
  assertJsonValue,
  cloneJsonObject,
  type JsonObject,
  type JsonValue,
} from "./life-simulation.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export interface CharacterVisualIdentity {
  id: string;
  characterId: string;
  storyWorldId: string;
  positivePrompt: string;
  negativePrompt?: string;
  styleTags: readonly string[];
  referenceImageRefs: readonly string[];
  revision: number;
  updatedAt: string;
}

export interface CharacterVisualIdentityInput {
  id: string;
  characterId: string;
  storyWorldId: string;
  positivePrompt: string;
  negativePrompt?: string;
  styleTags?: readonly string[];
  referenceImageRefs?: readonly string[];
  revision?: number;
  updatedAt: string;
}

export interface ImageWorkflowTemplate {
  id: string;
  version: string;
  workflow: JsonObject;
  positivePromptPath: readonly string[];
  negativePromptPath?: readonly string[];
  seedPath?: readonly string[];
}

export interface ImageWorkflowTemplateInput {
  id: string;
  version: string;
  workflow: JsonObject;
  positivePromptPath: readonly string[];
  negativePromptPath?: readonly string[];
  seedPath?: readonly string[];
}

export interface ImageScenePrompt {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
}

export interface CompiledImageWorkflow {
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  workflow: JsonObject;
}

export interface ImportedImageWorkflow {
  readonly workflow: JsonObject;
  readonly positivePromptPath: readonly string[];
  readonly negativePromptPath?: readonly string[];
  readonly seedPath?: readonly string[];
  readonly sourceFormat: "API" | "CANVAS";
}

function assertStringList(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmptyString(value, field);
    if (seen.has(value)) throw new TypeError(`${field} contains duplicate values`);
    seen.add(value);
  }
}

function assertPath(path: readonly string[], field: string): void {
  if (path.length === 0) throw new TypeError(`${field} must not be empty`);
  for (const key of path) assertNonEmptyString(key, field);
}

function assertRevision(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} must be a positive integer`);
  }
}

export function createCharacterVisualIdentity(
  input: CharacterVisualIdentityInput,
): CharacterVisualIdentity {
  assertNonEmptyString(input.id, "visualIdentity.id");
  assertNonEmptyString(input.characterId, "visualIdentity.characterId");
  assertNonEmptyString(input.storyWorldId, "visualIdentity.storyWorldId");
  assertNonEmptyString(input.positivePrompt, "visualIdentity.positivePrompt");
  if (input.negativePrompt !== undefined) {
    assertNonEmptyString(input.negativePrompt, "visualIdentity.negativePrompt");
  }
  const styleTags = [...(input.styleTags ?? [])];
  const referenceImageRefs = [...(input.referenceImageRefs ?? [])];
  assertStringList(styleTags, "visualIdentity.styleTags");
  assertStringList(referenceImageRefs, "visualIdentity.referenceImageRefs");
  const revision = input.revision ?? 1;
  assertRevision(revision, "visualIdentity.revision");
  assertIsoTimestamp(input.updatedAt, "visualIdentity.updatedAt");
  const identity: CharacterVisualIdentity = {
    id: input.id,
    characterId: input.characterId,
    storyWorldId: input.storyWorldId,
    positivePrompt: input.positivePrompt,
    styleTags,
    referenceImageRefs,
    revision,
    updatedAt: input.updatedAt,
  };
  if (input.negativePrompt !== undefined) identity.negativePrompt = input.negativePrompt;
  assertCharacterVisualIdentity(identity);
  return identity;
}

export function assertCharacterVisualIdentity(identity: CharacterVisualIdentity): void {
  assertNonEmptyString(identity.id, "visualIdentity.id");
  assertNonEmptyString(identity.characterId, "visualIdentity.characterId");
  assertNonEmptyString(identity.storyWorldId, "visualIdentity.storyWorldId");
  assertNonEmptyString(identity.positivePrompt, "visualIdentity.positivePrompt");
  if (identity.negativePrompt !== undefined) {
    assertNonEmptyString(identity.negativePrompt, "visualIdentity.negativePrompt");
  }
  assertStringList(identity.styleTags, "visualIdentity.styleTags");
  assertStringList(identity.referenceImageRefs, "visualIdentity.referenceImageRefs");
  assertRevision(identity.revision, "visualIdentity.revision");
  assertIsoTimestamp(identity.updatedAt, "visualIdentity.updatedAt");
}

export function createImageWorkflowTemplate(
  input: ImageWorkflowTemplateInput,
): ImageWorkflowTemplate {
  assertNonEmptyString(input.id, "workflowTemplate.id");
  assertNonEmptyString(input.version, "workflowTemplate.version");
  assertJsonValue(input.workflow, "workflowTemplate.workflow");
  assertPath(input.positivePromptPath, "workflowTemplate.positivePromptPath");
  if (input.negativePromptPath !== undefined) {
    assertPath(input.negativePromptPath, "workflowTemplate.negativePromptPath");
  }
  if (input.seedPath !== undefined) assertPath(input.seedPath, "workflowTemplate.seedPath");
  const template: ImageWorkflowTemplate = {
    id: input.id,
    version: input.version,
    workflow: cloneJsonObject(input.workflow),
    positivePromptPath: [...input.positivePromptPath],
  };
  if (input.negativePromptPath !== undefined) template.negativePromptPath = [...input.negativePromptPath];
  if (input.seedPath !== undefined) template.seedPath = [...input.seedPath];
  assertImageWorkflowTemplate(template);
  return template;
}

export function assertImageWorkflowTemplate(template: ImageWorkflowTemplate): void {
  assertNonEmptyString(template.id, "workflowTemplate.id");
  assertNonEmptyString(template.version, "workflowTemplate.version");
  assertJsonValue(template.workflow, "workflowTemplate.workflow");
  assertPath(template.positivePromptPath, "workflowTemplate.positivePromptPath");
  if (template.negativePromptPath !== undefined) {
    assertPath(template.negativePromptPath, "workflowTemplate.negativePromptPath");
  }
  if (template.seedPath !== undefined) assertPath(template.seedPath, "workflowTemplate.seedPath");
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCanvasWorkflow(value: JsonObject): boolean {
  return Array.isArray(value.nodes) && Array.isArray(value.links);
}

function canvasNodes(value: JsonObject): readonly Record<string, JsonValue>[] {
  return Array.isArray(value.nodes)
    ? value.nodes.filter(isJsonObject)
    : [];
}

function linkedInputMap(value: JsonObject): Map<string, JsonValue> {
  const links = Array.isArray(value.links) ? value.links : [];
  const direct = new Map<string, readonly [string, number]>();
  const nodes = new Map(
    canvasNodes(value)
      .filter((node) => node.id !== undefined)
      .map((node) => [String(node.id), node]),
  );
  for (const raw of links) {
    if (!Array.isArray(raw) || raw.length < 5) continue;
    const sourceNode = String(raw[1]);
    const sourceSlot = Number(raw[2]);
    const targetNode = String(raw[3]);
    const targetSlot = Number(raw[4]);
    if (Number.isInteger(sourceSlot) && Number.isInteger(targetSlot)) {
      direct.set(`${targetNode}:${targetSlot}`, [sourceNode, sourceSlot]);
    }
  }
  const resolveSource = (
    source: readonly [string, number],
    seen = new Set<string>(),
  ): readonly [string, number] => {
    const [nodeId] = source;
    if (seen.has(nodeId) || nodes.get(nodeId)?.type !== "Reroute") return source;
    seen.add(nodeId);
    const upstream = direct.get(`${nodeId}:0`);
    return upstream === undefined ? source : resolveSource(upstream, seen);
  };
  const result = new Map<string, JsonValue>();
  for (const [target, source] of direct) {
    result.set(target, [...resolveSource(source)] as unknown as JsonValue);
  }
  return result;
}

function canvasNodeInputs(node: Record<string, JsonValue>, links: Map<string, JsonValue>): JsonObject {
  const inputs: Record<string, JsonValue> = {};
  const nodeId = String(node.id);
  const nodeInputs = Array.isArray(node.inputs) ? node.inputs : [];
  for (let index = 0; index < nodeInputs.length; index += 1) {
    const input = nodeInputs[index];
    if (!isJsonObject(input) || typeof input.name !== "string") continue;
    const linked = links.get(`${nodeId}:${index}`);
    if (linked !== undefined) inputs[input.name] = linked;
  }

  const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  const type = typeof node.type === "string" ? node.type : "";
  const setIfUnlinked = (name: string, value: JsonValue | undefined): void => {
    if (value !== undefined && inputs[name] === undefined) inputs[name] = value;
  };
  if (type === "PrimitiveString" || type === "PrimitiveInt") setIfUnlinked("value", widgets[0]);
  else if (type === "CLIPTextEncode") setIfUnlinked("text", widgets[0]);
  else if (type === "EmptyLatentImage") {
    setIfUnlinked("width", widgets[0]);
    setIfUnlinked("height", widgets[1]);
    setIfUnlinked("batch_size", widgets[2]);
  } else if (type === "KSampler") {
    const values = [widgets[0], widgets[2], widgets[3], widgets[4], widgets[5], widgets[6]];
    for (const [index, name] of ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"].entries()) {
      setIfUnlinked(name, values[index]);
    }
  } else {
    let widgetIndex = 0;
    for (const raw of nodeInputs) {
      if (!isJsonObject(raw) || typeof raw.name !== "string") continue;
      if (raw.link !== null && raw.link !== undefined) continue;
      if (raw.widget === undefined) continue;
      setIfUnlinked(raw.name, widgets[widgetIndex]);
      widgetIndex += 1;
    }
  }
  return inputs;
}

function canvasToApiWorkflow(value: JsonObject): JsonObject {
  const links = linkedInputMap(value);
  const workflow: Record<string, JsonValue> = {};
  for (const raw of canvasNodes(value)) {
    if (!isJsonObject(raw) || raw.id === undefined || typeof raw.type !== "string" || raw.type === "Reroute") continue;
    workflow[String(raw.id)] = {
      inputs: canvasNodeInputs(raw, links),
      class_type: raw.type,
      _meta: { title: typeof raw.title === "string" ? raw.title : raw.type },
    } as unknown as JsonValue;
  }
  return workflow;
}


function canvasNodeTitle(node: Record<string, JsonValue>): string {
  const title = typeof node.title === "string" ? node.title : "";
  const type = typeof node.type === "string" ? node.type : "";
  return `${title} ${type}`.toLowerCase();
}

function canvasNodeWidgetText(node: Record<string, JsonValue>): string {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  return typeof values[0] === "string" ? values[0] : "";
}

function apiNodeTitle(node: JsonObject): string {
  const meta = isJsonObject(node._meta) ? node._meta : undefined;
  return `${typeof meta?.title === "string" ? meta.title : ""} ${typeof node.class_type === "string" ? node.class_type : ""}`.toLowerCase();
}

export function importImageWorkflow(value: JsonObject): ImportedImageWorkflow {
  if (!isCanvasWorkflow(value)) {
    const nodes = Object.entries(value).filter(([, node]) => isJsonObject(node) && typeof node.class_type === "string");
    if (nodes.length === 0) throw new TypeError("Workflow must be a ComfyUI canvas or API workflow JSON object");
    const textNodes = nodes.filter(([, node]) => isJsonObject(node) && node.class_type === "CLIPTextEncode");
    const positive = textNodes.find(([, node]) => {
      if (!isJsonObject(node)) return false;
      const title = apiNodeTitle(node);
      return title.includes("positive") || title.includes("prompt") || title.includes("正向") || title.includes("画面");
    }) ?? textNodes[0];
    const negative = textNodes.find(([, node]) => {
      if (!isJsonObject(node)) return false;
      const title = apiNodeTitle(node);
      return title.includes("negative") || title.includes("负向") || title.includes("avoid");
    }) ?? (textNodes.length > 1 ? textNodes[1] : undefined);
    const sampler = nodes.find(([, node]) => isJsonObject(node) && node.class_type === "KSampler");
    return { workflow: cloneJsonObject(value), positivePromptPath: [positive?.[0] ?? "", "inputs", "text"], ...(negative === undefined || negative[0] === positive?.[0] ? {} : { negativePromptPath: [negative[0], "inputs", "text"] }), ...(sampler === undefined ? {} : { seedPath: [sampler[0], "inputs", "seed"] }), sourceFormat: "API" };
  }
  const workflow = canvasToApiWorkflow(value);
  const primitiveNodes = canvasNodes(value).filter((node) => node.type === "PrimitiveString");
  const positivePrimitive = primitiveNodes.find((node) => {
    const title = canvasNodeTitle(node);
    return title.includes("画面") || title.includes("scene") || title.includes("prompt") || canvasNodeWidgetText(node).includes("请输入");
  }) ?? primitiveNodes.at(-1);
  const positivePromptPath = positivePrimitive?.id === undefined
    ? undefined
    : [String(positivePrimitive.id), "inputs", "value"];
  const negativeNode = canvasNodes(value).find((node) => {
    if (node.type !== "CLIPTextEncode" || node.id === undefined) return false;
    const title = canvasNodeTitle(node);
    return title.includes("negative") || title.includes("负向") || canvasNodeWidgetText(node).trim().length > 0;
  });
  const sampler = canvasNodes(value).find((node) => node.type === "KSampler" && node.id !== undefined);
  if (positivePromptPath === undefined) throw new TypeError("Canvas workflow has no editable positive prompt node");
  return { workflow, positivePromptPath, ...(negativeNode && negativeNode.id !== undefined ? { negativePromptPath: [String(negativeNode.id), "inputs", "text"] } : {}), ...(sampler && sampler.id !== undefined ? { seedPath: [String(sampler.id), "inputs", "seed"] } : {}), sourceFormat: "CANVAS" };
}

function setJsonPath(root: JsonObject, path: readonly string[], value: JsonValue): JsonObject {
  const result = cloneJsonObject(root) as Record<string, JsonValue>;
  let cursor = result;
  for (const key of path.slice(0, -1)) {
    const child = cursor[key];
    if (!isJsonObject(child)) {
      throw new TypeError(`workflow path does not resolve to an object: ${path.join(".")}`);
    }
    cursor = child as Record<string, JsonValue>;
  }
  cursor[path[path.length - 1]!] = value;
  return result;
}

export function assertImageWorkflowTemplateBindings(template: ImageWorkflowTemplate): void {
  assertImageWorkflowTemplate(template);
  let workflow = setJsonPath(template.workflow, template.positivePromptPath, "__positive_prompt__");
  if (template.negativePromptPath !== undefined) {
    workflow = setJsonPath(workflow, template.negativePromptPath, "__negative_prompt__");
  }
  if (template.seedPath !== undefined) {
    setJsonPath(workflow, template.seedPath, 1);
  }
}

function joinPromptParts(parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .map((part) => part.trim())
    .join(", ");
}

export function compileImageWorkflow(
  template: ImageWorkflowTemplate,
  identity: CharacterVisualIdentity,
  scene: ImageScenePrompt,
): CompiledImageWorkflow {
  assertCharacterVisualIdentity(identity);
  assertNonEmptyString(scene.prompt, "scene.prompt");
  if (scene.negativePrompt !== undefined) assertNonEmptyString(scene.negativePrompt, "scene.negativePrompt");
  if (scene.seed !== undefined && (!Number.isSafeInteger(scene.seed) || scene.seed < 0)) {
    throw new RangeError("scene.seed must be a non-negative integer");
  }
  const prompt = joinPromptParts([identity.positivePrompt, ...identity.styleTags, scene.prompt]);
  const negativePrompt = joinPromptParts([identity.negativePrompt, scene.negativePrompt]);
  let workflow = setJsonPath(template.workflow, template.positivePromptPath, prompt);
  if (negativePrompt.length > 0 && template.negativePromptPath !== undefined) {
    workflow = setJsonPath(workflow, template.negativePromptPath, negativePrompt);
  }
  if (scene.seed !== undefined) {
    if (template.seedPath === undefined) {
      throw new TypeError("workflowTemplate.seedPath is required when scene.seed is provided");
    }
    workflow = setJsonPath(workflow, template.seedPath, scene.seed);
  }
  const compiled: CompiledImageWorkflow = {
    workflowVersion: `${template.id}@${template.version}`,
    prompt,
    workflow,
  };
  if (negativePrompt.length > 0) compiled.negativePrompt = negativePrompt;
  if (scene.seed !== undefined) compiled.seed = scene.seed;
  return compiled;
}
