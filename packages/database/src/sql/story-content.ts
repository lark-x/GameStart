import type {
  StoryArc,
  StoryNode,
  StoryEdge,
  PromptTemplate,
  MemoryCandidate,
} from "@living-network/domain";
import type {
  StoryArcRepository,
  StoryNodeRepository,
  StoryEdgeRepository,
  PromptTemplateRepository,
  MemoryCandidateRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  optionalTimestamp,
  stringArray,
} from "./utils.ts";

function mapStoryArcRow(row: SqlRow): StoryArc {
  const arc: StoryArc = {
    id: requiredString(row.id, "story_arcs.id"),
    storyWorldId: requiredString(row.story_world_id, "story_arcs.story_world_id"),
    title: requiredString(row.title, "story_arcs.title"),
    summary: requiredString(row.summary, "story_arcs.summary"),
    status: requiredString(row.status, "story_arcs.status") as StoryArc["status"],
    createdAt: requiredTimestamp(row.created_at, "story_arcs.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "story_arcs.updated_at"),
  };
  const startAt = optionalTimestamp(row.start_at, "story_arcs.start_at");
  const endAt = optionalTimestamp(row.end_at, "story_arcs.end_at");
  if (startAt !== undefined) arc.startAt = startAt;
  if (endAt !== undefined) arc.endAt = endAt;
  return arc;
}

function mapStoryNodeRow(row: SqlRow): StoryNode {
  const node: StoryNode = {
    id: requiredString(row.id, "story_nodes.id"),
    storyWorldId: requiredString(row.story_world_id, "story_nodes.story_world_id"),
    arcId: requiredString(row.arc_id, "story_nodes.arc_id"),
    title: requiredString(row.title, "story_nodes.title"),
    nodeType: requiredString(row.node_type, "story_nodes.node_type") as StoryNode["nodeType"],
    status: requiredString(row.status, "story_nodes.status") as StoryNode["status"],
    timeMode: requiredString(row.time_mode, "story_nodes.time_mode") as StoryNode["timeMode"],
    summary: requiredString(row.summary, "story_nodes.summary"),
    generationGoal: requiredString(row.generation_goal, "story_nodes.generation_goal"),
    requiredFacts: stringArray(row.required_facts, "story_nodes.required_facts"),
    involvedCharacterIds: stringArray(
      row.involved_character_ids,
      "story_nodes.involved_character_ids",
    ),
    referencedMemoryIds: stringArray(
      row.referenced_memory_ids,
      "story_nodes.referenced_memory_ids",
    ),
    priority: requiredNumber(row.priority, "story_nodes.priority"),
    locked: requiredBoolean(row.locked, "story_nodes.locked"),
    createdAt: requiredTimestamp(row.created_at, "story_nodes.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "story_nodes.updated_at"),
  };
  const scheduledAt = optionalTimestamp(row.scheduled_at, "story_nodes.scheduled_at");
  const windowStart = optionalTimestamp(row.window_start, "story_nodes.window_start");
  const windowEnd = optionalTimestamp(row.window_end, "story_nodes.window_end");
  const creatorNotes = optionalString(row.creator_notes, "story_nodes.creator_notes");
  if (scheduledAt !== undefined) node.scheduledAt = scheduledAt;
  if (windowStart !== undefined) node.windowStart = windowStart;
  if (windowEnd !== undefined) node.windowEnd = windowEnd;
  if (creatorNotes !== undefined) node.creatorNotes = creatorNotes;
  return node;
}

function mapStoryEdgeRow(row: SqlRow): StoryEdge {
  return {
    id: requiredString(row.id, "story_edges.id"),
    storyWorldId: requiredString(row.story_world_id, "story_edges.story_world_id"),
    arcId: requiredString(row.arc_id, "story_edges.arc_id"),
    fromNodeId: requiredString(row.from_node_id, "story_edges.from_node_id"),
    toNodeId: requiredString(row.to_node_id, "story_edges.to_node_id"),
    edgeType: requiredString(row.edge_type, "story_edges.edge_type") as StoryEdge["edgeType"],
    condition: requiredString(row.condition, "story_edges.condition"),
    weight: requiredNumber(row.weight, "story_edges.weight"),
    createdAt: requiredTimestamp(row.created_at, "story_edges.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "story_edges.updated_at"),
  };
}

function mapPromptTemplateRow(row: SqlRow): PromptTemplate {
  return {
    id: requiredString(row.id, "prompt_templates.id"),
    storyWorldId: requiredString(row.story_world_id, "prompt_templates.story_world_id"),
    type: requiredString(row.type, "prompt_templates.type") as PromptTemplate["type"],
    name: requiredString(row.name, "prompt_templates.name"),
    content: requiredString(row.content, "prompt_templates.content"),
    isDefault: requiredBoolean(row.is_default, "prompt_templates.is_default"),
    createdAt: requiredTimestamp(row.created_at, "prompt_templates.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "prompt_templates.updated_at"),
  };
}

function mapMemoryCandidateRow(row: SqlRow): MemoryCandidate {
  const candidate: MemoryCandidate = {
    id: requiredString(row.id, "memory_candidates.id"),
    storyWorldId: requiredString(row.story_world_id, "memory_candidates.story_world_id"),
    sourceRef: requiredString(row.source_ref, "memory_candidates.source_ref"),
    content: requiredString(row.content, "memory_candidates.content"),
    rationale: requiredString(row.rationale, "memory_candidates.rationale"),
    confidence: requiredNumber(row.confidence, "memory_candidates.confidence"),
    status: requiredString(row.status, "memory_candidates.status") as MemoryCandidate["status"],
    createdAt: requiredTimestamp(row.created_at, "memory_candidates.created_at"),
  };
  const proposedMemoryId = optionalString(
    row.proposed_memory_id,
    "memory_candidates.proposed_memory_id",
  );
  const reviewedAt = optionalTimestamp(row.reviewed_at, "memory_candidates.reviewed_at");
  const reviewerCharacterId = optionalString(
    row.reviewer_character_id,
    "memory_candidates.reviewer_character_id",
  );
  const mergedIntoMemoryId = optionalString(
    row.merged_into_memory_id,
    "memory_candidates.merged_into_memory_id",
  );
  if (proposedMemoryId !== undefined) candidate.proposedMemoryId = proposedMemoryId;
  if (reviewedAt !== undefined) candidate.reviewedAt = reviewedAt;
  if (reviewerCharacterId !== undefined) candidate.reviewerCharacterId = reviewerCharacterId;
  if (mergedIntoMemoryId !== undefined) candidate.mergedIntoMemoryId = mergedIntoMemoryId;
  return candidate;
}

const STORY_ARC_SELECT = `
  SELECT id, story_world_id, title, summary, status, start_at, end_at,
         created_at, updated_at
  FROM story_arcs`;

const STORY_NODE_SELECT = `
  SELECT id, story_world_id, arc_id, title, node_type, status, time_mode,
         scheduled_at, window_start, window_end, summary, generation_goal,
         required_facts, involved_character_ids, referenced_memory_ids,
         creator_notes, priority, locked, created_at, updated_at
  FROM story_nodes`;

const STORY_EDGE_SELECT = `
  SELECT id, story_world_id, arc_id, from_node_id, to_node_id, edge_type,
         condition, weight, created_at, updated_at
  FROM story_edges`;

const PROMPT_TEMPLATE_SELECT = `
  SELECT id, story_world_id, type, name, content, is_default, created_at, updated_at
  FROM prompt_templates`;

const MEMORY_CANDIDATE_SELECT = `
  SELECT id, story_world_id, proposed_memory_id, source_ref, content, rationale,
         confidence, status, created_at, reviewed_at, reviewer_character_id,
         merged_into_memory_id
  FROM memory_candidates`;

export function createStoryContentRepositories(client: SqlClient): {
  storyArcs: StoryArcRepository;
  storyNodes: StoryNodeRepository;
  storyEdges: StoryEdgeRepository;
  promptTemplates: PromptTemplateRepository;
  memoryCandidates: MemoryCandidateRepository;
} {
  const storyArcs: StoryArcRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${STORY_ARC_SELECT}
           WHERE story_world_id = $1
           ORDER BY created_at DESC, id`,
          [storyWorldId],
        );
        return result.rows.map(mapStoryArcRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STORY_ARC_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStoryArcRow(row) : undefined;
      },
      save: async (arc) => {
        await client.query(
          `INSERT INTO story_arcs (
             id, story_world_id, title, summary, status, start_at, end_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             title = EXCLUDED.title,
             summary = EXCLUDED.summary,
             status = EXCLUDED.status,
             start_at = EXCLUDED.start_at,
             end_at = EXCLUDED.end_at,
             updated_at = EXCLUDED.updated_at`,
          [
            arc.id,
            arc.storyWorldId,
            arc.title,
            arc.summary,
            arc.status,
            arc.startAt ?? null,
            arc.endAt ?? null,
            arc.createdAt,
            arc.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM story_arcs WHERE id = $1`, [id]);
      },
    };

  const storyNodes: StoryNodeRepository = {
      listByArc: async (arcId) => {
        const result = await client.query(
          `${STORY_NODE_SELECT}
           WHERE arc_id = $1
           ORDER BY priority DESC, scheduled_at NULLS LAST, created_at, id`,
          [arcId],
        );
        return result.rows.map(mapStoryNodeRow);
      },
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${STORY_NODE_SELECT}
           WHERE story_world_id = $1
           ORDER BY priority DESC, scheduled_at NULLS LAST, created_at, id`,
          [storyWorldId],
        );
        return result.rows.map(mapStoryNodeRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STORY_NODE_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStoryNodeRow(row) : undefined;
      },
      save: async (node) => {
        await client.query(
          `INSERT INTO story_nodes (
             id, story_world_id, arc_id, title, node_type, status, time_mode,
             scheduled_at, window_start, window_end, summary, generation_goal,
             required_facts, involved_character_ids, referenced_memory_ids,
             creator_notes, priority, locked, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             arc_id = EXCLUDED.arc_id,
             title = EXCLUDED.title,
             node_type = EXCLUDED.node_type,
             status = EXCLUDED.status,
             time_mode = EXCLUDED.time_mode,
             scheduled_at = EXCLUDED.scheduled_at,
             window_start = EXCLUDED.window_start,
             window_end = EXCLUDED.window_end,
             summary = EXCLUDED.summary,
             generation_goal = EXCLUDED.generation_goal,
             required_facts = EXCLUDED.required_facts,
             involved_character_ids = EXCLUDED.involved_character_ids,
             referenced_memory_ids = EXCLUDED.referenced_memory_ids,
             creator_notes = EXCLUDED.creator_notes,
             priority = EXCLUDED.priority,
             locked = EXCLUDED.locked,
             updated_at = EXCLUDED.updated_at`,
          [
            node.id,
            node.storyWorldId,
            node.arcId,
            node.title,
            node.nodeType,
            node.status,
            node.timeMode,
            node.scheduledAt ?? null,
            node.windowStart ?? null,
            node.windowEnd ?? null,
            node.summary,
            node.generationGoal,
            [...node.requiredFacts],
            [...node.involvedCharacterIds],
            [...node.referencedMemoryIds],
            node.creatorNotes ?? null,
            node.priority,
            node.locked,
            node.createdAt,
            node.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM story_nodes WHERE id = $1`, [id]);
      },
    };

  const storyEdges: StoryEdgeRepository = {
      listByArc: async (arcId) => {
        const result = await client.query(
          `${STORY_EDGE_SELECT}
           WHERE arc_id = $1
           ORDER BY created_at, id`,
          [arcId],
        );
        return result.rows.map(mapStoryEdgeRow);
      },
      getById: async (id) => {
        const result = await client.query(`${STORY_EDGE_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapStoryEdgeRow(row) : undefined;
      },
      save: async (edge) => {
        await client.query(
          `INSERT INTO story_edges (
             id, story_world_id, arc_id, from_node_id, to_node_id, edge_type,
             condition, weight, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             arc_id = EXCLUDED.arc_id,
             from_node_id = EXCLUDED.from_node_id,
             to_node_id = EXCLUDED.to_node_id,
             edge_type = EXCLUDED.edge_type,
             condition = EXCLUDED.condition,
             weight = EXCLUDED.weight,
             updated_at = EXCLUDED.updated_at`,
          [
            edge.id,
            edge.storyWorldId,
            edge.arcId,
            edge.fromNodeId,
            edge.toNodeId,
            edge.edgeType,
            edge.condition,
            edge.weight,
            edge.createdAt,
            edge.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM story_edges WHERE id = $1`, [id]);
      },
    };

  const promptTemplates: PromptTemplateRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${PROMPT_TEMPLATE_SELECT}
           WHERE story_world_id = $1
           ORDER BY type, is_default DESC, updated_at DESC, id`,
          [storyWorldId],
        );
        return result.rows.map(mapPromptTemplateRow);
      },
      getById: async (id) => {
        const result = await client.query(`${PROMPT_TEMPLATE_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapPromptTemplateRow(row) : undefined;
      },
      save: async (template) => {
        await client.query(
          `INSERT INTO prompt_templates (
             id, story_world_id, type, name, content, is_default, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             type = EXCLUDED.type,
             name = EXCLUDED.name,
             content = EXCLUDED.content,
             is_default = EXCLUDED.is_default,
             updated_at = EXCLUDED.updated_at`,
          [
            template.id,
            template.storyWorldId,
            template.type,
            template.name,
            template.content,
            template.isDefault,
            template.createdAt,
            template.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM prompt_templates WHERE id = $1`, [id]);
      },
    };

  const memoryCandidates: MemoryCandidateRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${MEMORY_CANDIDATE_SELECT}
           WHERE story_world_id = $1
           ORDER BY created_at DESC, id`,
          [storyWorldId],
        );
        return result.rows.map(mapMemoryCandidateRow);
      },
      getById: async (id) => {
        const result = await client.query(`${MEMORY_CANDIDATE_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMemoryCandidateRow(row) : undefined;
      },
      save: async (candidate) => {
        await client.query(
          `INSERT INTO memory_candidates (
             id, story_world_id, proposed_memory_id, source_ref, content, rationale,
             confidence, status, created_at, reviewed_at, reviewer_character_id,
             merged_into_memory_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             proposed_memory_id = EXCLUDED.proposed_memory_id,
             source_ref = EXCLUDED.source_ref,
             content = EXCLUDED.content,
             rationale = EXCLUDED.rationale,
             confidence = EXCLUDED.confidence,
             status = EXCLUDED.status,
             reviewed_at = EXCLUDED.reviewed_at,
             reviewer_character_id = EXCLUDED.reviewer_character_id,
             merged_into_memory_id = EXCLUDED.merged_into_memory_id`,
          [
            candidate.id,
            candidate.storyWorldId,
            candidate.proposedMemoryId ?? null,
            candidate.sourceRef,
            candidate.content,
            candidate.rationale,
            candidate.confidence,
            candidate.status,
            candidate.createdAt,
            candidate.reviewedAt ?? null,
            candidate.reviewerCharacterId ?? null,
            candidate.mergedIntoMemoryId ?? null,
          ],
        );
      },
    };

  return { storyArcs, storyNodes, storyEdges, promptTemplates, memoryCandidates };
}
