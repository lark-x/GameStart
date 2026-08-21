import { createHash } from "node:crypto";

import { V2DomainError } from "../shared/index.ts";

export interface BuildV2GenerationContextInput {
  readonly snapshot: V2GenerationContextSourceSnapshot;
  readonly prompt: string;
  readonly requestedAt: string;
  readonly tokenBudget: number;
}

export interface V2GenerationContextSourceSnapshot {
  readonly storyWorldId: string;
  readonly revision: number;
  readonly facts: readonly {
    readonly id: string;
    readonly text: string;
    readonly visibility: "creator_only" | "player_visible";
  }[];
  readonly characters: readonly {
    readonly characterId: string;
    readonly name: string;
    readonly profile?: unknown;
  }[];
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly title: string;
  }[];
}

export interface V2GenerationContextSnapshot {
  readonly storyWorldId: string;
  readonly baseCanonRevision: number;
  readonly requestedAt: string;
  readonly prompt: string;
  readonly promptPreview: string;
  readonly tokenBudget: number;
  readonly contextHash: string;
  readonly sourceFactIds: readonly string[];
  readonly sourceCharacterIds: readonly string[];
  readonly sourceSceneIds: readonly string[];
  readonly facts: readonly {
    readonly id: string;
    readonly text: string;
    readonly visibility: "creator_only" | "player_visible";
  }[];
  readonly characters: readonly {
    readonly characterId: string;
    readonly name: string;
    readonly profile?: unknown;
  }[];
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly title: string;
  }[];
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new V2DomainError("INVALID_INPUT", `${field} must not be empty`);
  return trimmed;
}

function assertTokenBudget(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 64_000) {
    throw new V2DomainError("INVALID_INPUT", "tokenBudget must be an integer between 1 and 64000");
  }
  return value;
}

function preview(value: string, max = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function hashContext(value: Omit<V2GenerationContextSnapshot, "contextHash">): string {
  const canonical = JSON.stringify(value);
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function buildV2GenerationContextSnapshot(
  input: BuildV2GenerationContextInput,
): V2GenerationContextSnapshot {
  const prompt = assertNonEmpty(input.prompt, "prompt");
  const tokenBudget = assertTokenBudget(input.tokenBudget);
  const sourceCharacterIds = input.snapshot.characters.map((character) => character.characterId);
  const sourceSceneIds = input.snapshot.scenes.map((scene) => scene.sceneId);
  const sourceFactIds = input.snapshot.facts.map((fact) => fact.id);
  const base: Omit<V2GenerationContextSnapshot, "contextHash"> = {
    storyWorldId: input.snapshot.storyWorldId,
    baseCanonRevision: input.snapshot.revision,
    requestedAt: input.requestedAt,
    prompt,
    promptPreview: preview(prompt),
    tokenBudget,
    sourceFactIds,
    sourceCharacterIds,
    sourceSceneIds,
    facts: input.snapshot.facts.map((fact) => ({
      id: fact.id,
      text: fact.text,
      visibility: fact.visibility,
    })),
    characters: input.snapshot.characters.map((character) => ({
      characterId: character.characterId,
      name: character.name,
      ...(character.profile === undefined ? {} : { profile: character.profile }),
    })),
    scenes: input.snapshot.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      title: scene.title,
    })),
  };
  return { ...base, contextHash: hashContext(base) };
}
