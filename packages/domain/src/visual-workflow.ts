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
