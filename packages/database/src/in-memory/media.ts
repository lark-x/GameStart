import {
  isMomentVisibleTo,
  assertMomentDraft,
  assertImageJob,
  assertCharacterVisualIdentity,
  assertImageWorkflowTemplate,
  assertSticker,
  assertStickerPack,
  assertMoment,
  assertMomentInteraction,
  type StoryWorld,
  type Character,
  type BehaviorAction,
  type EventExecution,
  type MomentDraft,
  type ImageJob,
  type CharacterVisualIdentity,
  type ImageWorkflowTemplate,
  type StickerPack,
  type Sticker,
  type Moment,
  type MomentInteraction,
  type JsonObject,
} from "@living-network/domain";
import type {
  MomentDraftRepository,
  ImageJobRepository,
  CharacterVisualIdentityRepository,
  ImageWorkflowTemplateRepository,
  StickerPackRepository,
  StickerRepository,
  MomentRepository,
  MomentInteractionRepository,
  MomentInteractionWriteResult,
} from "../repositories.ts";

// ── Copy helpers ──

function copyMomentDraft(draft: MomentDraft): MomentDraft {
  return { ...draft };
}

function copyImageJob(job: ImageJob): ImageJob {
  return { ...job };
}

function copyCharacterVisualIdentity(identity: CharacterVisualIdentity): CharacterVisualIdentity {
  return { ...identity, styleTags: [...identity.styleTags], referenceImageRefs: [...identity.referenceImageRefs] };
}

function copyJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function copyImageWorkflowTemplate(template: ImageWorkflowTemplate): ImageWorkflowTemplate {
  return {
    ...template,
    workflow: copyJsonObject(template.workflow),
    positivePromptPath: [...template.positivePromptPath],
    ...(template.negativePromptPath === undefined
      ? {}
      : { negativePromptPath: [...template.negativePromptPath] }),
    ...(template.seedPath === undefined ? {} : { seedPath: [...template.seedPath] }),
  };
}

function copyStickerPack(pack: StickerPack): StickerPack {
  return { ...pack };
}

function copySticker(sticker: Sticker): Sticker {
  return { ...sticker };
}

function copyMoment(moment: Moment): Moment {
  return { ...moment };
}

function copyMomentInteraction(interaction: MomentInteraction): MomentInteraction {
  return { ...interaction };
}

// ── Repository factories ──

export function createMomentDraftRepo(
  map: Map<string, MomentDraft>,
  actionMap: Map<string, BehaviorAction>,
  executionMap: Map<string, EventExecution>,
  characterMap: Map<string, Character>,
): MomentDraftRepository {
  return {
    getById: async (id) => {
      const draft = map.get(id);
      return draft ? copyMomentDraft(draft) : undefined;
    },
    getByActionId: async (actionId) => {
      const draft = [...map.values()].find(
        (candidate) => candidate.actionId === actionId,
      );
      return draft ? copyMomentDraft(draft) : undefined;
    },
    save: async (draft) => {
      assertMomentDraft(draft);
      if (!actionMap.has(draft.actionId)) {
        throw new TypeError(`Moment draft ${draft.id} references an unknown action`);
      }
      if (!executionMap.has(draft.executionId)) {
        throw new TypeError(`Moment draft ${draft.id} references an unknown execution`);
      }
      if (!characterMap.has(draft.authorCharacterId)) {
        throw new TypeError(`Moment draft ${draft.id} references an unknown character`);
      }
      const existing = [...map.values()].find(
        (candidate) => candidate.actionId === draft.actionId && candidate.id !== draft.id,
      );
      if (existing) throw new TypeError(`Duplicate moment draft action: ${draft.actionId}`);
      map.set(draft.id, copyMomentDraft(draft));
    },
    listByStoryWorld: async (storyWorldId) => {
      return [...map.values()]
        .filter((draft) => draft.storyWorldId === storyWorldId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(copyMomentDraft);
    },
  };
}

export function createImageJobRepo(
  map: Map<string, ImageJob>,
  actionMap: Map<string, BehaviorAction>,
  executionMap: Map<string, EventExecution>,
  characterMap: Map<string, Character>,
  draftMap: Map<string, MomentDraft>,
): ImageJobRepository {
  return {
    getById: async (id) => {
      const job = map.get(id);
      return job ? copyImageJob(job) : undefined;
    },
    getByActionId: async (actionId) => {
      const job = [...map.values()].find(
        (candidate) => candidate.actionId === actionId,
      );
      return job ? copyImageJob(job) : undefined;
    },
    listSucceededByStoryWorld: async (storyWorldId) => {
      if (!storyWorldId.trim()) throw new TypeError("storyWorldId must not be empty");
      return [...map.values()]
        .filter((candidate) => candidate.storyWorldId === storyWorldId && candidate.status === "SUCCEEDED")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
        .map(copyImageJob);
    },
    listQueued: async (limit = 100) => {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
      return [...map.values()]
        .filter((candidate) => candidate.status === "QUEUED")
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
        .slice(0, limit)
        .map(copyImageJob);
    },
    listSubmitted: async (limit = 100) => {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
      return [...map.values()]
        .filter((candidate) => candidate.status === "SUBMITTED")
        .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
        .slice(0, limit)
        .map(copyImageJob);
    },
    save: async (job) => {
      assertImageJob(job);
      if (!actionMap.has(job.actionId)) {
        throw new TypeError(`Image job ${job.id} references an unknown action`);
      }
      if (!executionMap.has(job.executionId)) {
        throw new TypeError(`Image job ${job.id} references an unknown execution`);
      }
      if (!characterMap.has(job.ownerCharacterId)) {
        throw new TypeError(`Image job ${job.id} references an unknown character`);
      }
      if (job.momentDraftId !== undefined && !draftMap.has(job.momentDraftId)) {
        throw new TypeError(`Image job ${job.id} references an unknown moment draft`);
      }
      const existing = [...map.values()].find(
        (candidate) => candidate.actionId === job.actionId && candidate.id !== job.id,
      );
      if (existing) throw new TypeError(`Duplicate image job action: ${job.actionId}`);
      map.set(job.id, copyImageJob(job));
    },
  };
}

export function createCharacterVisualIdentityRepo(
  map: Map<string, CharacterVisualIdentity>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): CharacterVisualIdentityRepository {
  return {
    getById: async (id) => {
      const identity = map.get(id);
      return identity ? copyCharacterVisualIdentity(identity) : undefined;
    },
    getByCharacterId: async (characterId) => {
      const identity = [...map.values()].find(
        (candidate) => candidate.characterId === characterId,
      );
      return identity ? copyCharacterVisualIdentity(identity) : undefined;
    },
    save: async (identity) => {
      assertCharacterVisualIdentity(identity);
      const world = worldMap.get(identity.storyWorldId);
      const character = characterMap.get(identity.characterId);
      if (!world || !character || character.storyWorldId !== identity.storyWorldId) {
        throw new TypeError(`Visual identity ${identity.id} references invalid character or world`);
      }
      const existing = [...map.values()].find(
        (candidate) => candidate.characterId === identity.characterId && candidate.id !== identity.id,
      );
      if (existing) throw new TypeError(`Duplicate visual identity character: ${identity.characterId}`);
      map.set(identity.id, copyCharacterVisualIdentity(identity));
    },
  };
}

export function createImageWorkflowTemplateRepo(
  map: Map<string, ImageWorkflowTemplate>,
): ImageWorkflowTemplateRepository {
  return {
    getById: async (id, version) => {
      const template = map.get(`${id}@${version}`);
      return template ? copyImageWorkflowTemplate(template) : undefined;
    },
    list: async () => [...map.values()]
      .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
      .map(copyImageWorkflowTemplate),
    save: async (template) => {
      assertImageWorkflowTemplate(template);
      map.set(
        `${template.id}@${template.version}`,
        copyImageWorkflowTemplate(template),
      );
    },
  };
}

export function createStickerPackRepo(
  map: Map<string, StickerPack>,
  worldMap: Map<string, StoryWorld>,
): StickerPackRepository {
  return {
    listByStoryWorld: async (storyWorldId) => [...map.values()]
      .filter((pack) => pack.storyWorldId === storyWorldId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copyStickerPack),
    getById: async (id) => {
      const pack = map.get(id);
      return pack ? copyStickerPack(pack) : undefined;
    },
    save: async (pack) => {
      assertStickerPack(pack);
      if (!worldMap.has(pack.storyWorldId)) {
        throw new TypeError(`Sticker pack ${pack.id} references an unknown story world`);
      }
      map.set(pack.id, copyStickerPack(pack));
    },
  };
}

export function createStickerRepo(
  map: Map<string, Sticker>,
  packMap: Map<string, StickerPack>,
): StickerRepository {
  return {
    listByPack: async (packId) => [...map.values()]
      .filter((sticker) => sticker.packId === packId)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copySticker),
    getById: async (id) => {
      const sticker = map.get(id);
      return sticker ? copySticker(sticker) : undefined;
    },
    save: async (sticker) => {
      assertSticker(sticker);
      const pack = packMap.get(sticker.packId);
      if (!pack || pack.storyWorldId !== sticker.storyWorldId) {
        throw new TypeError(`Sticker ${sticker.id} references an invalid pack`);
      }
      map.set(sticker.id, copySticker(sticker));
    },
  };
}

export function createMomentRepo(
  map: Map<string, Moment>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): MomentRepository {
  return {
    getById: async (id) => {
      const moment = map.get(id);
      return moment ? copyMoment(moment) : undefined;
    },
    listFeed: async (storyWorldId, readerCharacterId, limit) => {
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new TypeError("moment feed limit must be a positive integer");
      }
      return [...map.values()]
        .filter(
          (moment) =>
            moment.storyWorldId === storyWorldId &&
            isMomentVisibleTo(moment, readerCharacterId),
        )
        .sort(
          (left, right) =>
            right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id),
        )
        .slice(0, limit)
        .map(copyMoment);
    },
    save: async (moment) => {
      assertMoment(moment);
      if (!worldMap.has(moment.storyWorldId)) {
        throw new TypeError(`Moment ${moment.id} references an unknown story world`);
      }
      if (!characterMap.has(moment.authorCharacterId)) {
        throw new TypeError(`Moment ${moment.id} references an unknown character`);
      }
      map.set(moment.id, copyMoment(moment));
    },
  };
}

export function createMomentInteractionRepo(
  map: Map<string, MomentInteraction>,
  momentMap: Map<string, Moment>,
  characterMap: Map<string, Character>,
): MomentInteractionRepository {
  return {
    listByMoment: async (momentId) =>
      [...map.values()]
        .filter((interaction) => interaction.momentId === momentId)
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        )
        .map(copyMomentInteraction),
    getByMomentAndActor: async (momentId, actorCharacterId, kind) => {
      const found = [...map.values()].find(
        (candidate) =>
          candidate.momentId === momentId &&
          candidate.actorCharacterId === actorCharacterId &&
          candidate.kind === kind,
      );
      return found ? copyMomentInteraction(found) : undefined;
    },
    delete: async (id) => {
      return map.delete(id);
    },
    save: async (interaction): Promise<MomentInteractionWriteResult> => {
      assertMomentInteraction(interaction);
      if (!momentMap.has(interaction.momentId)) {
        throw new TypeError(`Moment interaction ${interaction.id} references an unknown moment`);
      }
      if (!characterMap.has(interaction.actorCharacterId)) {
        throw new TypeError(`Moment interaction ${interaction.id} references an unknown character`);
      }
      const existing = [...map.values()].find(
        (candidate) =>
          candidate.momentId === interaction.momentId &&
          candidate.idempotencyKey === interaction.idempotencyKey,
      );
      if (existing) {
        if (
          existing.kind !== interaction.kind ||
          existing.actorCharacterId !== interaction.actorCharacterId ||
          existing.text !== interaction.text
        ) {
          throw new TypeError(
            `Moment interaction idempotency key conflict: ${interaction.idempotencyKey}`,
          );
        }
        return { interaction: copyMomentInteraction(existing), inserted: false };
      }
      if (
        interaction.kind === "LIKE" &&
        [...map.values()].some(
          (candidate) =>
            candidate.momentId === interaction.momentId &&
            candidate.actorCharacterId === interaction.actorCharacterId &&
            candidate.kind === "LIKE",
        )
      ) {
        throw new TypeError("Character has already liked this moment");
      }
      if (map.has(interaction.id)) {
        throw new TypeError(`Duplicate momentInteraction id: ${interaction.id}`);
      }
      map.set(interaction.id, copyMomentInteraction(interaction));
      return { interaction: copyMomentInteraction(interaction), inserted: true };
    },
  };
}
