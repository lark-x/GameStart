import { V2DomainError } from "../shared/index.ts";

export interface V2ParsedSceneCandidate {
  readonly payload: V2SceneCandidatePayload;
  readonly rawTextPreview: string;
}

export interface V2SceneCandidatePayload {
  readonly scene: {
    readonly sceneId: string;
    readonly title: string;
    readonly body: string;
    readonly locationId?: string;
    readonly participantCharacterIds: readonly string[];
  };
  readonly choices: readonly {
    readonly label: string;
    readonly targetSceneId?: string;
    readonly consequenceSummary?: string;
  }[];
  readonly validationNotes: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return nonEmptyString(value, field);
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new V2DomainError("INVALID_INPUT", `${field} must be an array`);
  return value.map((item, index) => nonEmptyString(item, `${field}[${index}]`));
}

function parseChoices(value: unknown): V2SceneCandidatePayload["choices"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new V2DomainError("INVALID_INPUT", "choices must be a non-empty array");
  }
  return value.map((choice, index) => {
    if (!isRecord(choice)) throw new V2DomainError("INVALID_INPUT", `choices[${index}] must be an object`);
    const result: V2SceneCandidatePayload["choices"][number] = {
      label: nonEmptyString(choice.label, `choices[${index}].label`),
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: nonEmptyString(choice.targetSceneId, `choices[${index}].targetSceneId`) }),
      ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: nonEmptyString(choice.consequenceSummary, `choices[${index}].consequenceSummary`) }),
    };
    return result;
  });
}

export function parseV2SceneCandidateText(rawText: string): V2ParsedSceneCandidate {
  const raw = nonEmptyString(rawText, "rawText");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new V2DomainError("INVALID_INPUT", "scene candidate output must be valid JSON");
  }
  if (!isRecord(parsed) || !isRecord(parsed.scene)) {
    throw new V2DomainError("INVALID_INPUT", "scene candidate output must include scene");
  }
  const scene = parsed.scene;
  const locationId = optionalNonEmptyString(scene.locationId, "scene.locationId");
  const payload: V2SceneCandidatePayload = {
    scene: {
      sceneId: nonEmptyString(scene.sceneId, "scene.sceneId"),
      title: nonEmptyString(scene.title, "scene.title"),
      body: nonEmptyString(scene.body, "scene.body"),
      ...(locationId === undefined ? {} : { locationId }),
      participantCharacterIds: stringArray(scene.participantCharacterIds, "scene.participantCharacterIds"),
    },
    choices: parseChoices(parsed.choices),
    validationNotes: parsed.validationNotes === undefined
      ? []
      : stringArray(parsed.validationNotes, "validationNotes"),
  };
  return {
    payload,
    rawTextPreview: raw.slice(0, 1000),
  };
}
