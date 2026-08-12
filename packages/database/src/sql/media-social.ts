import {
  assertCharacterVisualIdentity,
  assertImageJob,
  assertImageWorkflowTemplate,
  assertMoment,
  assertMomentDraft,
  assertMomentInteraction,
  assertSticker,
  assertStickerPack,
  type CharacterVisualIdentity,
  type ImageJob,
  type ImageWorkflowTemplate,
  type JsonObject,
  type Moment,
  type MomentDraft,
  type MomentInteraction,
  type Sticker,
  type StickerPack,
} from "@living-network/domain";
import type {
  CharacterVisualIdentityRepository,
  ImageJobRepository,
  ImageWorkflowTemplateRepository,
  MomentDraftRepository,
  MomentInteractionRepository,
  MomentInteractionWriteResult,
  MomentRepository,
  StickerPackRepository,
  StickerRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  stringArray,
  optionalStringArray,
  jsonObject,
} from "./utils.ts";

function mapMomentDraftRow(row: SqlRow): MomentDraft {
  const draft: MomentDraft = {
    id: requiredString(row.id, "moment_drafts.id"),
    actionId: requiredString(row.action_id, "moment_drafts.action_id"),
    executionId: requiredString(row.execution_id, "moment_drafts.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "moment_drafts.story_world_id"),
    authorCharacterId: requiredString(
      row.author_character_id,
      "moment_drafts.author_character_id",
    ),
    visibility: requiredString(
      row.visibility,
      "moment_drafts.visibility",
    ) as MomentDraft["visibility"],
    body: requiredString(row.body, "moment_drafts.body"),
    status: requiredString(row.status, "moment_drafts.status") as MomentDraft["status"],
    createdAt: requiredTimestamp(row.created_at, "moment_drafts.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "moment_drafts.updated_at"),
  };
  const imageJobId = optionalString(row.image_job_id, "moment_drafts.image_job_id");
  if (imageJobId !== undefined) draft.imageJobId = imageJobId;
  assertMomentDraft(draft);
  return draft;
}

function mapImageJobRow(row: SqlRow): ImageJob {
  const job: ImageJob = {
    id: requiredString(row.id, "image_jobs.id"),
    kind: requiredString(row.kind, "image_jobs.kind") as ImageJob["kind"],
    actionId: requiredString(row.action_id, "image_jobs.action_id"),
    executionId: requiredString(row.execution_id, "image_jobs.execution_id"),
    storyWorldId: requiredString(row.story_world_id, "image_jobs.story_world_id"),
    ownerCharacterId: requiredString(row.owner_character_id, "image_jobs.owner_character_id"),
    workflowVersion: requiredString(row.workflow_version, "image_jobs.workflow_version"),
    prompt: requiredString(row.prompt, "image_jobs.prompt"),
    attempt: requiredNumber(row.attempt, "image_jobs.attempt"),
    status: requiredString(row.status, "image_jobs.status") as ImageJob["status"],
    createdAt: requiredTimestamp(row.created_at, "image_jobs.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "image_jobs.updated_at"),
  };
  const momentDraftId = optionalString(row.moment_draft_id, "image_jobs.moment_draft_id");
  const negativePrompt = optionalString(row.negative_prompt, "image_jobs.negative_prompt");
  const externalJobId = optionalString(row.external_job_id, "image_jobs.external_job_id");
  const mediaRef = optionalString(row.media_ref, "image_jobs.media_ref");
  const failureReason = optionalString(row.failure_reason, "image_jobs.failure_reason");
  if (momentDraftId !== undefined) job.momentDraftId = momentDraftId;
  if (negativePrompt !== undefined) job.negativePrompt = negativePrompt;
  if (externalJobId !== undefined) job.externalJobId = externalJobId;
  if (mediaRef !== undefined) job.mediaRef = mediaRef;
  if (failureReason !== undefined) job.failureReason = failureReason;
  if (row.seed !== null && row.seed !== undefined) job.seed = requiredNumber(row.seed, "image_jobs.seed");
  assertImageJob(job);
  return job;
}

function mapCharacterVisualIdentityRow(row: SqlRow): CharacterVisualIdentity {
  const identity: CharacterVisualIdentity = {
    id: requiredString(row.id, "character_visual_identities.id"),
    characterId: requiredString(
      row.character_id,
      "character_visual_identities.character_id",
    ),
    storyWorldId: requiredString(
      row.story_world_id,
      "character_visual_identities.story_world_id",
    ),
    positivePrompt: requiredString(
      row.positive_prompt,
      "character_visual_identities.positive_prompt",
    ),
    styleTags: stringArray(row.style_tags, "character_visual_identities.style_tags"),
    referenceImageRefs: stringArray(
      row.reference_image_refs,
      "character_visual_identities.reference_image_refs",
    ),
    revision: requiredNumber(row.revision, "character_visual_identities.revision"),
    updatedAt: requiredTimestamp(row.updated_at, "character_visual_identities.updated_at"),
  };
  const negativePrompt = optionalString(
    row.negative_prompt,
    "character_visual_identities.negative_prompt",
  );
  if (negativePrompt !== undefined) identity.negativePrompt = negativePrompt;
  assertCharacterVisualIdentity(identity);
  return identity;
}

function mapImageWorkflowTemplateRow(row: SqlRow): ImageWorkflowTemplate {
  const template: ImageWorkflowTemplate = {
    id: requiredString(row.id, "image_workflow_templates.id"),
    version: requiredString(row.version, "image_workflow_templates.version"),
    workflow: jsonObject(row.workflow, "image_workflow_templates.workflow") as JsonObject,
    positivePromptPath: stringArray(
      row.positive_prompt_path,
      "image_workflow_templates.positive_prompt_path",
    ),
  };
  const negativePromptPath = optionalStringArray(
    row.negative_prompt_path,
    "image_workflow_templates.negative_prompt_path",
  );
  const seedPath = optionalStringArray(row.seed_path, "image_workflow_templates.seed_path");
  if (negativePromptPath !== undefined) template.negativePromptPath = negativePromptPath;
  if (seedPath !== undefined) template.seedPath = seedPath;
  assertImageWorkflowTemplate(template);
  return template;
}

function mapStickerPackRow(row: SqlRow): StickerPack {
  const pack: StickerPack = {
    id: requiredString(row.id, "sticker_packs.id"),
    storyWorldId: requiredString(row.story_world_id, "sticker_packs.story_world_id"),
    name: requiredString(row.name, "sticker_packs.name"),
    createdAt: requiredTimestamp(row.created_at, "sticker_packs.created_at"),
  };
  const sourceRef = optionalString(row.source_ref, "sticker_packs.source_ref");
  if (sourceRef !== undefined) pack.sourceRef = sourceRef;
  assertStickerPack(pack);
  return pack;
}

function mapStickerRow(row: SqlRow): Sticker {
  const sticker: Sticker = {
    id: requiredString(row.id, "stickers.id"),
    packId: requiredString(row.pack_id, "stickers.pack_id"),
    storyWorldId: requiredString(row.story_world_id, "stickers.story_world_id"),
    label: requiredString(row.label, "stickers.label"),
    mediaRef: requiredString(row.media_ref, "stickers.media_ref"),
    tags: stringArray(row.tags, "stickers.tags"),
    createdAt: requiredTimestamp(row.created_at, "stickers.created_at"),
  };
  assertSticker(sticker);
  return sticker;
}

function mapMomentRow(row: SqlRow): Moment {
  const moment: Moment = {
    id: requiredString(row.id, "moments.id"),
    draftId: requiredString(row.draft_id, "moments.draft_id"),
    storyWorldId: requiredString(row.story_world_id, "moments.story_world_id"),
    authorCharacterId: requiredString(row.author_character_id, "moments.author_character_id"),
    visibility: requiredString(row.visibility, "moments.visibility") as Moment["visibility"],
    audienceCharacterIds: stringArray(row.audience_character_ids, "moments.audience_character_ids"),
    body: requiredString(row.body, "moments.body"),
    publishedAt: requiredTimestamp(row.published_at, "moments.published_at"),
    createdAt: requiredTimestamp(row.created_at, "moments.created_at"),
  };
  const imageMediaRef = optionalString(row.image_media_ref, "moments.image_media_ref");
  if (imageMediaRef !== undefined) moment.imageMediaRef = imageMediaRef;
  assertMoment(moment);
  return moment;
}

function mapMomentInteractionRow(row: SqlRow): MomentInteraction {
  const interaction: MomentInteraction = {
    id: requiredString(row.id, "moment_interactions.id"),
    momentId: requiredString(row.moment_id, "moment_interactions.moment_id"),
    storyWorldId: requiredString(row.story_world_id, "moment_interactions.story_world_id"),
    actorCharacterId: requiredString(
      row.actor_character_id,
      "moment_interactions.actor_character_id",
    ),
    kind: requiredString(
      row.kind,
      "moment_interactions.kind",
    ) as MomentInteraction["kind"],
    createdAt: requiredTimestamp(row.created_at, "moment_interactions.created_at"),
    idempotencyKey: requiredString(
      row.idempotency_key,
      "moment_interactions.idempotency_key",
    ),
  };
  const text = optionalString(row.text, "moment_interactions.text");
  if (text !== undefined) interaction.text = text;
  const replyTo = optionalString(row.reply_to_interaction_id, "moment_interactions.reply_to_interaction_id");
  if (replyTo !== undefined) interaction.replyToInteractionId = replyTo;
  assertMomentInteraction(interaction);
  return interaction;
}

const MOMENT_DRAFT_SELECT = `
  SELECT id, action_id, execution_id, story_world_id, author_character_id,
         visibility, body, status, image_job_id, created_at, updated_at
  FROM moment_drafts`;

const IMAGE_JOB_SELECT = `
  SELECT id, kind, action_id, execution_id, story_world_id, owner_character_id,
         moment_draft_id, workflow_version, prompt, attempt, negative_prompt, seed,
         status, external_job_id, media_ref, failure_reason, created_at, updated_at
  FROM image_jobs`;

const CHARACTER_VISUAL_IDENTITY_SELECT = `
  SELECT id, character_id, story_world_id, positive_prompt, negative_prompt,
         style_tags, reference_image_refs, revision, updated_at
  FROM character_visual_identities`;

const IMAGE_WORKFLOW_TEMPLATE_SELECT = `
  SELECT id, version, workflow, positive_prompt_path, negative_prompt_path, seed_path
  FROM image_workflow_templates`;

const STICKER_PACK_SELECT = `
  SELECT id, story_world_id, name, source_ref, created_at
  FROM sticker_packs`;

const STICKER_SELECT = `
  SELECT id, pack_id, story_world_id, label, media_ref, tags, created_at
  FROM stickers`;

const MOMENT_SELECT = `
  SELECT id, draft_id, story_world_id, author_character_id, visibility,
         audience_character_ids, body, image_media_ref, published_at, created_at
  FROM moments`;

const MOMENT_INTERACTION_SELECT = `
SELECT id, moment_id, story_world_id, actor_character_id, kind, text,
created_at, idempotency_key, reply_to_interaction_id
FROM moment_interactions`;

export function createMediaSocialRepositories(client: SqlClient): {
  momentDrafts: MomentDraftRepository;
  imageJobs: ImageJobRepository;
  characterVisualIdentities: CharacterVisualIdentityRepository;
  imageWorkflowTemplates: ImageWorkflowTemplateRepository;
  stickerPacks: StickerPackRepository;
  stickers: StickerRepository;
  moments: MomentRepository;
  momentInteractions: MomentInteractionRepository;
} {
  const momentDrafts: MomentDraftRepository = {
      getById: async (id) => {
        const result = await client.query(`${MOMENT_DRAFT_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMomentDraftRow(row) : undefined;
      },
      getByActionId: async (actionId) => {
        const result = await client.query(
          `${MOMENT_DRAFT_SELECT} WHERE action_id = $1`,
          [actionId],
        );
        const row = result.rows[0];
        return row ? mapMomentDraftRow(row) : undefined;
      },
      save: async (draft) => {
        assertMomentDraft(draft);
        await client.query(
          `INSERT INTO moment_drafts (
             id, action_id, execution_id, story_world_id, author_character_id,
             visibility, body, status, image_job_id, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             action_id = EXCLUDED.action_id,
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             author_character_id = EXCLUDED.author_character_id,
             visibility = EXCLUDED.visibility,
             body = EXCLUDED.body,
             status = EXCLUDED.status,
             image_job_id = EXCLUDED.image_job_id,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
          [
            draft.id,
            draft.actionId,
            draft.executionId,
            draft.storyWorldId,
            draft.authorCharacterId,
            draft.visibility,
            draft.body,
            draft.status,
            draft.imageJobId ?? null,
            draft.createdAt,
            draft.updatedAt,
          ],
        );
      },
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(`${MOMENT_DRAFT_SELECT} WHERE story_world_id = $1 ORDER BY created_at DESC`, [storyWorldId]);
        return result.rows.map(mapMomentDraftRow);
      },
    };

  const imageJobs: ImageJobRepository = {
      getById: async (id) => {
        const result = await client.query(`${IMAGE_JOB_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapImageJobRow(row) : undefined;
      },
      getByActionId: async (actionId) => {
        const result = await client.query(
          `${IMAGE_JOB_SELECT} WHERE action_id = $1`,
          [actionId],
        );
        const row = result.rows[0];
        return row ? mapImageJobRow(row) : undefined;
      },
      listSucceededByStoryWorld: async (storyWorldId) => {
        if (!storyWorldId.trim()) throw new TypeError("storyWorldId must not be empty");
        const result = await client.query(
          `${IMAGE_JOB_SELECT} WHERE story_world_id = $1 AND status = 'SUCCEEDED' ORDER BY updated_at DESC, id DESC`,
          [storyWorldId],
        );
        return result.rows.map(mapImageJobRow);
      },
      listQueued: async (limit = 100) => {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
        const result = await client.query(
          `${IMAGE_JOB_SELECT} WHERE status = 'QUEUED' ORDER BY created_at ASC, id ASC LIMIT $1`,
          [limit],
        );
        return result.rows.map(mapImageJobRow);
      },
      listSubmitted: async (limit = 100) => {
        if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("image job limit must be positive");
        const result = await client.query(
          `${IMAGE_JOB_SELECT} WHERE status = 'SUBMITTED' ORDER BY updated_at ASC, id ASC LIMIT $1`,
          [limit],
        );
        return result.rows.map(mapImageJobRow);
      },
      save: async (job) => {
        assertImageJob(job);
        await client.query(
          `INSERT INTO image_jobs (
             id, kind, action_id, execution_id, story_world_id, owner_character_id,
             moment_draft_id, workflow_version, prompt, attempt, negative_prompt, seed,
             status, external_job_id, media_ref, failure_reason, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (id) DO UPDATE SET
             kind = EXCLUDED.kind,
             action_id = EXCLUDED.action_id,
             execution_id = EXCLUDED.execution_id,
             story_world_id = EXCLUDED.story_world_id,
             owner_character_id = EXCLUDED.owner_character_id,
             moment_draft_id = EXCLUDED.moment_draft_id,
             workflow_version = EXCLUDED.workflow_version,
             prompt = EXCLUDED.prompt,
             attempt = EXCLUDED.attempt,
             negative_prompt = EXCLUDED.negative_prompt,
             seed = EXCLUDED.seed,
             status = EXCLUDED.status,
             external_job_id = EXCLUDED.external_job_id,
             media_ref = EXCLUDED.media_ref,
             failure_reason = EXCLUDED.failure_reason,
             created_at = EXCLUDED.created_at,
             updated_at = EXCLUDED.updated_at`,
          [
            job.id,
            job.kind,
            job.actionId,
            job.executionId,
            job.storyWorldId,
            job.ownerCharacterId,
            job.momentDraftId ?? null,
            job.workflowVersion,
            job.prompt,
            job.attempt,
            job.negativePrompt ?? null,
            job.seed ?? null,
            job.status,
            job.externalJobId ?? null,
            job.mediaRef ?? null,
            job.failureReason ?? null,
            job.createdAt,
            job.updatedAt,
          ],
        );
      },
    };

  const characterVisualIdentities: CharacterVisualIdentityRepository = {
      getById: async (id) => {
        const result = await client.query(
          `${CHARACTER_VISUAL_IDENTITY_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapCharacterVisualIdentityRow(row) : undefined;
      },
      getByCharacterId: async (characterId) => {
        const result = await client.query(
          `${CHARACTER_VISUAL_IDENTITY_SELECT} WHERE character_id = $1`,
          [characterId],
        );
        const row = result.rows[0];
        return row ? mapCharacterVisualIdentityRow(row) : undefined;
      },
      save: async (identity) => {
        assertCharacterVisualIdentity(identity);
        await client.query(
          `INSERT INTO character_visual_identities (
             id, character_id, story_world_id, positive_prompt, negative_prompt,
             style_tags, reference_image_refs, revision, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             character_id = EXCLUDED.character_id,
             story_world_id = EXCLUDED.story_world_id,
             positive_prompt = EXCLUDED.positive_prompt,
             negative_prompt = EXCLUDED.negative_prompt,
             style_tags = EXCLUDED.style_tags,
             reference_image_refs = EXCLUDED.reference_image_refs,
             revision = EXCLUDED.revision,
             updated_at = EXCLUDED.updated_at`,
          [
            identity.id,
            identity.characterId,
            identity.storyWorldId,
            identity.positivePrompt,
            identity.negativePrompt ?? null,
            [...identity.styleTags],
            [...identity.referenceImageRefs],
            identity.revision,
            identity.updatedAt,
          ],
        );
      },
    };

  const imageWorkflowTemplates: ImageWorkflowTemplateRepository = {
      getById: async (id, version) => {
        const result = await client.query(
          `${IMAGE_WORKFLOW_TEMPLATE_SELECT} WHERE id = $1 AND version = $2`,
          [id, version],
        );
        const row = result.rows[0];
        return row ? mapImageWorkflowTemplateRow(row) : undefined;
      },
      list: async () => {
        const result = await client.query(
          `${IMAGE_WORKFLOW_TEMPLATE_SELECT} ORDER BY id, version`,
        );
        return result.rows.map(mapImageWorkflowTemplateRow);
      },
      save: async (template) => {
        assertImageWorkflowTemplate(template);
        await client.query(
          `INSERT INTO image_workflow_templates (
             id, version, workflow, positive_prompt_path, negative_prompt_path, seed_path
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id, version) DO UPDATE SET
             workflow = EXCLUDED.workflow,
             positive_prompt_path = EXCLUDED.positive_prompt_path,
             negative_prompt_path = EXCLUDED.negative_prompt_path,
             seed_path = EXCLUDED.seed_path`,
          [
            template.id,
            template.version,
            JSON.stringify(template.workflow),
            [...template.positivePromptPath],
            template.negativePromptPath === undefined ? null : [...template.negativePromptPath],
            template.seedPath === undefined ? null : [...template.seedPath],
          ],
        );
      },
    };

  const stickerPacks: StickerPackRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${STICKER_PACK_SELECT} WHERE story_world_id = $1 ORDER BY id`,
          [storyWorldId],
        );
        return result.rows.map(mapStickerPackRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STICKER_PACK_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStickerPackRow(row) : undefined;
      },
      save: async (pack) => {
assertStickerPack(pack);
await client.query(
`INSERT INTO sticker_packs (id, story_world_id, name, source_ref, created_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) DO UPDATE SET
story_world_id = EXCLUDED.story_world_id,
name = EXCLUDED.name,
source_ref = EXCLUDED.source_ref,
created_at = EXCLUDED.created_at`,
[pack.id, pack.storyWorldId, pack.name, pack.sourceRef ?? null, pack.createdAt],
);
},
};

  const stickers: StickerRepository = {
      listByPack: async (packId) => {
        const result = await client.query(
          `${STICKER_SELECT} WHERE pack_id = $1 ORDER BY id`,
          [packId],
        );
        return result.rows.map(mapStickerRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STICKER_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStickerRow(row) : undefined;
      },
      save: async (sticker) => {
        assertSticker(sticker);
        await client.query(
          `INSERT INTO stickers (
             id, pack_id, story_world_id, label, media_ref, tags, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             pack_id = EXCLUDED.pack_id,
             story_world_id = EXCLUDED.story_world_id,
             label = EXCLUDED.label,
             media_ref = EXCLUDED.media_ref,
             tags = EXCLUDED.tags,
             created_at = EXCLUDED.created_at`,
          [
            sticker.id,
            sticker.packId,
            sticker.storyWorldId,
            sticker.label,
            sticker.mediaRef,
            [...sticker.tags],
            sticker.createdAt,
          ],
        );
      },
    };

  const moments: MomentRepository = {
      getById: async (id) => {
        const result = await client.query(`${MOMENT_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMomentRow(row) : undefined;
      },
      listFeed: async (storyWorldId, readerCharacterId, limit) => {
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("moment feed limit must be a positive integer");
        }
        const result = await client.query(
          `${MOMENT_SELECT}
           WHERE story_world_id = $1
             AND (
               visibility = 'PUBLIC'
               OR $2 = ANY(audience_character_ids)
             )
           ORDER BY published_at DESC, id
           LIMIT $3`,
          [storyWorldId, readerCharacterId, limit],
        );
        return result.rows.map(mapMomentRow);
      },
      save: async (moment) => {
        assertMoment(moment);
        await client.query(
          `INSERT INTO moments (
             id, draft_id, story_world_id, author_character_id, visibility,
             audience_character_ids, body, image_media_ref, published_at, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             draft_id = EXCLUDED.draft_id,
             story_world_id = EXCLUDED.story_world_id,
             author_character_id = EXCLUDED.author_character_id,
             visibility = EXCLUDED.visibility,
             audience_character_ids = EXCLUDED.audience_character_ids,
             body = EXCLUDED.body,
             image_media_ref = EXCLUDED.image_media_ref,
             published_at = EXCLUDED.published_at,
             created_at = EXCLUDED.created_at`,
          [
            moment.id,
            moment.draftId,
            moment.storyWorldId,
            moment.authorCharacterId,
            moment.visibility,
            [...moment.audienceCharacterIds],
            moment.body,
            moment.imageMediaRef ?? null,
            moment.publishedAt,
            moment.createdAt,
          ],
        );
      },
    };

  const momentInteractions: MomentInteractionRepository = {
      listByMoment: async (momentId) => {
        const result = await client.query(
          `${MOMENT_INTERACTION_SELECT}
           WHERE moment_id = $1
           ORDER BY created_at, id`,
          [momentId],
        );
        return result.rows.map(mapMomentInteractionRow);
      },
      getByMomentAndActor: async (momentId, actorCharacterId, kind) => {
        const result = await client.query(
          `${MOMENT_INTERACTION_SELECT}
           WHERE moment_id = $1 AND actor_character_id = $2 AND kind = $3
           LIMIT 1`,
          [momentId, actorCharacterId, kind],
        );
        const row = result.rows[0];
        return row ? mapMomentInteractionRow(row) : undefined;
      },
      delete: async (id) => {
        const check = await client.query(
          `SELECT id FROM moment_interactions WHERE id = $1`,
          [id],
        );
        if (check.rows.length === 0) return false;
        await client.query(
          `DELETE FROM moment_interactions WHERE id = $1`,
          [id],
        );
        return true;
      },
      save: async (interaction): Promise<MomentInteractionWriteResult> => {
        assertMomentInteraction(interaction);
        const inserted = await client.query(
          `INSERT INTO moment_interactions (
             id, moment_id, story_world_id, actor_character_id, kind, text,
             created_at, idempotency_key, reply_to_interaction_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (moment_id, idempotency_key) DO NOTHING
           RETURNING id, moment_id, story_world_id, actor_character_id, kind,
                     text, created_at, idempotency_key, reply_to_interaction_id`,
          [
            interaction.id,
            interaction.momentId,
            interaction.storyWorldId,
            interaction.actorCharacterId,
            interaction.kind,
            interaction.text ?? null,
            interaction.createdAt,
            interaction.idempotencyKey,
            interaction.replyToInteractionId ?? null,
          ],
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { interaction: mapMomentInteractionRow(insertedRow), inserted: true };
        }
        const existing = await client.query(
          `${MOMENT_INTERACTION_SELECT}
           WHERE moment_id = $1 AND idempotency_key = $2`,
          [interaction.momentId, interaction.idempotencyKey],
        );
        const existingRow = existing.rows[0];
        if (!existingRow) throw new TypeError("Moment interaction idempotency lookup returned no row");
        const stored = mapMomentInteractionRow(existingRow);
        if (
          stored.kind !== interaction.kind ||
          stored.actorCharacterId !== interaction.actorCharacterId ||
          stored.text !== interaction.text
        ) {
          throw new TypeError(
            `Moment interaction idempotency key conflict: ${interaction.idempotencyKey}`,
          );
        }
        return { interaction: stored, inserted: false };
      },
    };

  return {
    momentDrafts, imageJobs, characterVisualIdentities, imageWorkflowTemplates,
    stickerPacks, stickers, moments, momentInteractions,
  };
}
