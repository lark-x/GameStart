import {
  createActorSession,
  createCharacter,
  createRelationshipEdge,
  createStoryWorld,
  type ActorSession,
  type Character,
  type CharacterInput,
  type RelationshipEdge,
  type StoryWorld,
  type StoryMode as StoryModeValue,
} from "@living-network/domain";
import type {
  ActorSessionRepository,
  CharacterRepository,
  RelationshipEdgeRepository,
  StoryWorldRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  optionalString,
  requiredBoolean,
  requiredNumber,
  optionalDate,
  requiredTimestamp,
} from "./utils.ts";

function mapStoryWorldRow(row: SqlRow): StoryWorld {
  return createStoryWorld({
    id: requiredString(row.id, "story_worlds.id"),
    name: requiredString(row.name, "story_worlds.name"),
    timezone: requiredString(row.timezone, "story_worlds.timezone"),
    storyMode: requiredString(row.story_mode, "story_worlds.story_mode") as StoryModeValue,
    relationshipDynamicsEnabled: requiredBoolean(
      row.relationship_dynamics_enabled,
      "story_worlds.relationship_dynamics_enabled",
    ),
  });
}

export function mapCharacterRow(row: SqlRow, prefix = ""): Character {
  const input: CharacterInput = {
    id: requiredString(row[`${prefix}id`], `${prefix}characters.id`),
    displayName: requiredString(
      row[`${prefix}display_name`],
      `${prefix}characters.display_name`,
    ),
    role: requiredString(row[`${prefix}role`], `${prefix}characters.role`) as Character["role"],
    storyWorldId: requiredString(
      row[`${prefix}story_world_id`],
      `${prefix}characters.story_world_id`,
    ),
    timezone: requiredString(row[`${prefix}timezone`], `${prefix}characters.timezone`),
  };
  const birthDate = optionalDate(row[`${prefix}birth_date`], `${prefix}characters.birth_date`);
  const personaPrompt = optionalString(
    row[`${prefix}persona_prompt`],
    `${prefix}characters.persona_prompt`,
  );
  const personaPromptRef = optionalString(
    row[`${prefix}persona_prompt_ref`],
    `${prefix}characters.persona_prompt_ref`,
  );
  const visualPromptRef = optionalString(
    row[`${prefix}visual_prompt_ref`],
    `${prefix}characters.visual_prompt_ref`,
  );
  if (birthDate !== undefined) input.birthDate = birthDate;
  if (personaPrompt !== undefined) input.personaPrompt = personaPrompt;
  if (personaPromptRef !== undefined) input.personaPromptRef = personaPromptRef;
  if (visualPromptRef !== undefined) input.visualPromptRef = visualPromptRef;
  return createCharacter(input);
}

function mapRelationshipEdgeRow(row: SqlRow): RelationshipEdge {
  return createRelationshipEdge({
    id: requiredString(row.id, "relationship_edges.id"),
    source: mapCharacterRow(row, "source_"),
    target: mapCharacterRow(row, "target_"),
    storyWorld: createStoryWorld({
      id: requiredString(row.world_id, "story_worlds.id"),
      name: requiredString(row.world_name, "story_worlds.name"),
      timezone: requiredString(row.world_timezone, "story_worlds.timezone"),
      storyMode: requiredString(
        row.world_story_mode,
        "story_worlds.story_mode",
      ) as StoryModeValue,
      relationshipDynamicsEnabled: requiredBoolean(
        row.world_relationship_dynamics_enabled,
        "story_worlds.relationship_dynamics_enabled",
      ),
    }),
    relationshipType: requiredString(
      row.relationship_type,
      "relationship_edges.relationship_type",
    ),
    initialState: {
      affinity: requiredNumber(row.affinity, "relationship_edges.affinity"),
      trust: requiredNumber(row.trust, "relationship_edges.trust"),
      conflict: requiredNumber(row.conflict, "relationship_edges.conflict"),
      dependency: requiredNumber(row.dependency, "relationship_edges.dependency"),
    },
    isPublic: requiredBoolean(row.is_public, "relationship_edges.is_public"),
    isBidirectional: requiredBoolean(
      row.is_bidirectional,
      "relationship_edges.is_bidirectional",
    ),
  });
}

function mapActorSessionRow(row: SqlRow): ActorSession {
  const world = createStoryWorld({
    id: requiredString(row.world_id, "story_worlds.id"),
    name: requiredString(row.world_name, "story_worlds.name"),
    timezone: requiredString(row.world_timezone, "story_worlds.timezone"),
    storyMode: requiredString(row.world_story_mode, "story_worlds.story_mode") as StoryModeValue,
    relationshipDynamicsEnabled: requiredBoolean(
      row.world_relationship_dynamics_enabled,
      "story_worlds.relationship_dynamics_enabled",
    ),
  });
  const userCharacter = mapCharacterRow(row, "user_");
  const endedAt = row.ended_at === null || row.ended_at === undefined
    ? undefined
    : requiredTimestamp(row.ended_at, "actor_sessions.ended_at");
  const input = {
    id: requiredString(row.id, "actor_sessions.id"),
    storyWorld: world,
    userCharacter,
    startedAt: requiredTimestamp(row.started_at, "actor_sessions.started_at"),
  };
  if (endedAt !== undefined) {
    return createActorSession({ ...input, endedAt });
  }
  return createActorSession(input);
}

const STORY_WORLD_SELECT = `
  SELECT id, name, timezone, story_mode, relationship_dynamics_enabled
  FROM story_worlds`;

const CHARACTER_SELECT = `
  SELECT id, display_name, role, story_world_id, timezone,
         birth_date, persona_prompt, persona_prompt_ref, visual_prompt_ref
  FROM characters`;

const RELATIONSHIP_EDGE_SELECT = `
  SELECT
    e.id, e.relationship_type, e.affinity, e.trust, e.conflict,
    e.dependency, e.is_public, e.is_bidirectional,
    sw.id AS world_id, sw.name AS world_name, sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    source_character.id AS source_id,
    source_character.display_name AS source_display_name,
    source_character.role AS source_role,
    source_character.story_world_id AS source_story_world_id,
    source_character.timezone AS source_timezone,
    source_character.birth_date AS source_birth_date,
    source_character.persona_prompt AS source_persona_prompt,
    source_character.persona_prompt_ref AS source_persona_prompt_ref,
    source_character.visual_prompt_ref AS source_visual_prompt_ref,
    target_character.id AS target_id,
    target_character.display_name AS target_display_name,
    target_character.role AS target_role,
    target_character.story_world_id AS target_story_world_id,
    target_character.timezone AS target_timezone,
    target_character.birth_date AS target_birth_date,
    target_character.persona_prompt AS target_persona_prompt,
    target_character.persona_prompt_ref AS target_persona_prompt_ref,
    target_character.visual_prompt_ref AS target_visual_prompt_ref
  FROM relationship_edges e
  JOIN story_worlds sw ON sw.id = e.story_world_id
  JOIN characters source_character
    ON source_character.id = e.source_character_id
   AND source_character.story_world_id = e.story_world_id
  JOIN characters target_character
    ON target_character.id = e.target_character_id
   AND target_character.story_world_id = e.story_world_id`;

const ACTOR_SESSION_SELECT = `
  SELECT
    s.id, s.started_at, s.ended_at,
    sw.id AS world_id, sw.name AS world_name, sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    user_character.id AS user_id,
    user_character.display_name AS user_display_name,
    user_character.role AS user_role,
    user_character.story_world_id AS user_story_world_id,
    user_character.timezone AS user_timezone,
    user_character.birth_date AS user_birth_date,
    user_character.persona_prompt AS user_persona_prompt,
    user_character.persona_prompt_ref AS user_persona_prompt_ref,
    user_character.visual_prompt_ref AS user_visual_prompt_ref
  FROM actor_sessions s
  JOIN story_worlds sw ON sw.id = s.story_world_id
  JOIN characters user_character
    ON user_character.id = s.user_character_id
   AND user_character.story_world_id = s.story_world_id`;

export function createCoreIdentityRepositories(client: SqlClient): {
  storyWorlds: StoryWorldRepository;
  characters: CharacterRepository;
  relationshipEdges: RelationshipEdgeRepository;
  actorSessions: ActorSessionRepository;
} {
  const storyWorlds: StoryWorldRepository = {
      list: async () => {
        const result = await client.query(`${STORY_WORLD_SELECT} ORDER BY id`);
        return result.rows.map(mapStoryWorldRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STORY_WORLD_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStoryWorldRow(row) : undefined;
      },
      save: async (world) => {
        await client.query(
          `INSERT INTO story_worlds (id, name, timezone, story_mode, relationship_dynamics_enabled)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             timezone = EXCLUDED.timezone,
             story_mode = EXCLUDED.story_mode,
             relationship_dynamics_enabled = EXCLUDED.relationship_dynamics_enabled`,
          [world.id, world.name, world.timezone, world.storyMode, world.relationshipDynamicsEnabled],
        );
      },
    };

  const characters: CharacterRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = storyWorldId === undefined
          ? await client.query(`${CHARACTER_SELECT} ORDER BY id`)
          : await client.query(
            `${CHARACTER_SELECT} WHERE story_world_id = $1 ORDER BY id`,
            [storyWorldId],
          );
        return result.rows.map((row) => mapCharacterRow(row));
      },
      getById: async (id) => {
        const result = await client.query(`${CHARACTER_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapCharacterRow(row) : undefined;
      },
      save: async (character) => {
        await client.query(
          `INSERT INTO characters (id, display_name, role, story_world_id, timezone, birth_date, persona_prompt, persona_prompt_ref, visual_prompt_ref)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role,
             story_world_id = EXCLUDED.story_world_id,
             timezone = EXCLUDED.timezone,
             birth_date = EXCLUDED.birth_date,
             persona_prompt = EXCLUDED.persona_prompt,
             persona_prompt_ref = EXCLUDED.persona_prompt_ref,
             visual_prompt_ref = EXCLUDED.visual_prompt_ref`,
          [
            character.id,
            character.displayName,
            character.role,
            character.storyWorldId,
            character.timezone,
            character.birthDate ?? null,
            character.personaPrompt ?? null,
            character.personaPromptRef ?? null,
            character.visualPromptRef ?? null,
          ],
        );
      },
    };

  const relationshipEdges: RelationshipEdgeRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${RELATIONSHIP_EDGE_SELECT} WHERE e.story_world_id = $1 ORDER BY e.id`,
          [storyWorldId],
        );
        return result.rows.map(mapRelationshipEdgeRow);
      },
      getById: async (id) => {
        const result = await client.query(
          `${RELATIONSHIP_EDGE_SELECT} WHERE e.id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapRelationshipEdgeRow(row) : undefined;
      },
      save: async (edge) => {
        await client.query(
          `INSERT INTO relationship_edges (
             id, source_character_id, target_character_id, story_world_id,
             relationship_type, affinity, trust, conflict, dependency,
             is_public, is_bidirectional
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             source_character_id = EXCLUDED.source_character_id,
             target_character_id = EXCLUDED.target_character_id,
             story_world_id = EXCLUDED.story_world_id,
             relationship_type = EXCLUDED.relationship_type,
             affinity = EXCLUDED.affinity,
             trust = EXCLUDED.trust,
             conflict = EXCLUDED.conflict,
             dependency = EXCLUDED.dependency,
             is_public = EXCLUDED.is_public,
             is_bidirectional = EXCLUDED.is_bidirectional,
             updated_at = now()`,
          [
            edge.id,
            edge.sourceCharacterId,
            edge.targetCharacterId,
            edge.storyWorldId,
            edge.relationshipType,
            edge.initialState.affinity,
            edge.initialState.trust,
            edge.initialState.conflict,
            edge.initialState.dependency,
            edge.isPublic,
            edge.isBidirectional,
          ],
        );
      },
    };

  const actorSessions: ActorSessionRepository = {
      getById: async (id) => {
        const result = await client.query(`${ACTOR_SESSION_SELECT} WHERE s.id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapActorSessionRow(row) : undefined;
      },
      save: async (session) => {
        await client.query(
          `INSERT INTO actor_sessions (id, story_world_id, user_character_id, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             user_character_id = EXCLUDED.user_character_id,
             started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at`,
          [
            session.id,
            session.storyWorldId,
            session.userCharacterId,
            session.startedAt,
            session.endedAt ?? null,
          ],
        );
      },
    };

  return { storyWorlds, characters, relationshipEdges, actorSessions };
}
