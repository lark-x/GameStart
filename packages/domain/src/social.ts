import type { Character } from "./character.ts";
import {
  assertMomentDraft,
  MomentDraftStatus,
  MomentVisibility,
  type MomentDraft,
} from "./behavior-media.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export interface Moment {
  id: string;
  draftId: string;
  storyWorldId: string;
  authorCharacterId: string;
  visibility: MomentVisibility;
  audienceCharacterIds: readonly string[];
  body: string;
  imageMediaRef?: string;
  publishedAt: string;
  createdAt: string;
}

export interface MomentInput {
  id: string;
  draft: MomentDraft;
  publishedAt: string;
  audienceCharacters?: readonly Character[];
  imageMediaRef?: string;
}

export const MomentInteractionKind = {
  LIKE: "LIKE",
  COMMENT: "COMMENT",
} as const;

export type MomentInteractionKind =
  (typeof MomentInteractionKind)[keyof typeof MomentInteractionKind];

export interface MomentInteraction {
  id: string;
  momentId: string;
  storyWorldId: string;
  actorCharacterId: string;
  kind: MomentInteractionKind;
  text?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface MomentInteractionInput {
  id: string;
  moment: Moment;
  actor: Character;
  kind: MomentInteractionKind;
  text?: string;
  createdAt: string;
  idempotencyKey: string;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function assertAudienceCharacters(
  characters: readonly Character[],
  storyWorldId: string,
  field: string,
): void {
  const seen = new Set<string>();
  for (const character of characters) {
    if (seen.has(character.id)) throw new TypeError(`${field} contains duplicate character`);
    seen.add(character.id);
    if (character.storyWorldId !== storyWorldId) {
      throw new TypeError(`${field} must belong to storyWorld`);
    }
  }
}

export function createMoment(input: MomentInput): Moment {
  assertNonEmptyString(input.id, "moment.id");
  assertMomentDraft(input.draft);
  if (input.draft.status !== MomentDraftStatus.READY) {
    throw new TypeError("moment requires a READY draft");
  }
  assertIsoTimestamp(input.publishedAt, "moment.publishedAt");
  const audience = input.audienceCharacters ?? [];
  assertAudienceCharacters(audience, input.draft.storyWorldId, "moment.audienceCharacters");
  if (input.imageMediaRef !== undefined) assertNonEmptyString(input.imageMediaRef, "moment.imageMediaRef");
  if (
    input.draft.visibility === MomentVisibility.PRIVATE &&
    !audience.some((character) => character.id === input.draft.authorCharacterId)
  ) {
    throw new TypeError("PRIVATE moment audience must include its author");
  }
  if (
    (input.draft.visibility === MomentVisibility.RELATION || input.draft.visibility === MomentVisibility.GROUP) &&
    audience.length === 0
  ) {
    throw new TypeError(`${input.draft.visibility} moment requires audienceCharacters`);
  }
  const moment: Moment = {
    id: input.id,
    draftId: input.draft.id,
    storyWorldId: input.draft.storyWorldId,
    authorCharacterId: input.draft.authorCharacterId,
    visibility: input.draft.visibility,
    audienceCharacterIds: audience.map((character) => character.id),
    body: input.draft.body,
    publishedAt: input.publishedAt,
    createdAt: input.draft.createdAt,
  };
  if (input.imageMediaRef !== undefined) moment.imageMediaRef = input.imageMediaRef;
  assertMoment(moment);
  return moment;
}

export function assertMoment(moment: Moment): void {
  assertNonEmptyString(moment.id, "moment.id");
  assertNonEmptyString(moment.draftId, "moment.draftId");
  assertNonEmptyString(moment.storyWorldId, "moment.storyWorldId");
  assertNonEmptyString(moment.authorCharacterId, "moment.authorCharacterId");
  assertEnum(moment.visibility, Object.values(MomentVisibility), "moment.visibility");
  assertNonEmptyString(moment.body, "moment.body");
  if (moment.imageMediaRef !== undefined) assertNonEmptyString(moment.imageMediaRef, "moment.imageMediaRef");
  assertIsoTimestamp(moment.publishedAt, "moment.publishedAt");
  assertIsoTimestamp(moment.createdAt, "moment.createdAt");
  const ids = new Set<string>();
  for (const id of moment.audienceCharacterIds) {
    assertNonEmptyString(id, "moment.audienceCharacterIds");
    if (ids.has(id)) throw new TypeError("moment.audienceCharacterIds contains duplicate character");
    ids.add(id);
  }
  if (moment.visibility === MomentVisibility.PRIVATE && !ids.has(moment.authorCharacterId)) {
    throw new TypeError("PRIVATE moment audience must include its author");
  }
  if (
    (moment.visibility === MomentVisibility.RELATION || moment.visibility === MomentVisibility.GROUP) &&
    ids.size === 0
  ) {
    throw new TypeError(`${moment.visibility} moment requires audienceCharacterIds`);
  }
}

export function isMomentVisibleTo(moment: Moment, readerCharacterId: string): boolean {
  assertMoment(moment);
  assertNonEmptyString(readerCharacterId, "moment.readerCharacterId");
  if (moment.visibility === MomentVisibility.PUBLIC) return true;
  return moment.audienceCharacterIds.includes(readerCharacterId);
}

export function createMomentInteraction(input: MomentInteractionInput): MomentInteraction {
  assertNonEmptyString(input.id, "momentInteraction.id");
  assertMoment(input.moment);
  assertNonEmptyString(input.actor.id, "momentInteraction.actor.id");
  if (input.actor.storyWorldId !== input.moment.storyWorldId) {
    throw new TypeError("momentInteraction.actor must belong to moment storyWorld");
  }
  assertEnum(input.kind, Object.values(MomentInteractionKind), "momentInteraction.kind");
  if (input.kind === MomentInteractionKind.COMMENT) {
    assertNonEmptyString(input.text, "momentInteraction.text");
  } else if (input.text !== undefined) {
    throw new TypeError("LIKE interaction cannot include text");
  }
  assertIsoTimestamp(input.createdAt, "momentInteraction.createdAt");
  assertNonEmptyString(input.idempotencyKey, "momentInteraction.idempotencyKey");
  const interaction: MomentInteraction = {
    id: input.id,
    momentId: input.moment.id,
    storyWorldId: input.moment.storyWorldId,
    actorCharacterId: input.actor.id,
    kind: input.kind,
    createdAt: input.createdAt,
    idempotencyKey: input.idempotencyKey,
  };
  if (input.text !== undefined) interaction.text = input.text;
  assertMomentInteraction(interaction);
  return interaction;
}

export function assertMomentInteraction(interaction: MomentInteraction): void {
  assertNonEmptyString(interaction.id, "momentInteraction.id");
  assertNonEmptyString(interaction.momentId, "momentInteraction.momentId");
  assertNonEmptyString(interaction.storyWorldId, "momentInteraction.storyWorldId");
  assertNonEmptyString(interaction.actorCharacterId, "momentInteraction.actorCharacterId");
  assertEnum(interaction.kind, Object.values(MomentInteractionKind), "momentInteraction.kind");
  if (interaction.kind === MomentInteractionKind.COMMENT) {
    assertNonEmptyString(interaction.text, "momentInteraction.text");
  } else if (interaction.text !== undefined) {
    throw new TypeError("LIKE interaction cannot include text");
  }
  assertIsoTimestamp(interaction.createdAt, "momentInteraction.createdAt");
  assertNonEmptyString(interaction.idempotencyKey, "momentInteraction.idempotencyKey");
}
