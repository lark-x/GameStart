BEGIN;

CREATE TABLE behavior_actions (
  id text PRIMARY KEY,
  execution_id text NOT NULL REFERENCES event_executions(id) ON DELETE CASCADE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  actor_character_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('NOOP', 'SEND_MESSAGE', 'CREATE_MOMENT', 'REQUEST_IMAGE')),
  status text NOT NULL CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  CONSTRAINT behavior_actions_actor_world_fk
    FOREIGN KEY (actor_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE INDEX behavior_actions_execution_priority_idx
  ON behavior_actions (execution_id, priority, id);

CREATE TABLE moment_drafts (
  id text PRIMARY KEY,
  action_id text NOT NULL REFERENCES behavior_actions(id) ON DELETE CASCADE,
  execution_id text NOT NULL REFERENCES event_executions(id) ON DELETE CASCADE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  author_character_id text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'RELATION', 'GROUP', 'PRIVATE')),
  body text NOT NULL CHECK (btrim(body) <> ''),
  status text NOT NULL CHECK (status IN ('DRAFT', 'READY', 'PUBLISHED', 'REJECTED')),
  image_job_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT moment_drafts_action_unique UNIQUE (action_id),
  CONSTRAINT moment_drafts_author_world_fk
    FOREIGN KEY (author_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE INDEX moment_drafts_feed_idx
  ON moment_drafts (story_world_id, status, updated_at DESC, id);

CREATE TABLE image_jobs (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('MOMENT')),
  action_id text NOT NULL REFERENCES behavior_actions(id) ON DELETE CASCADE,
  execution_id text NOT NULL REFERENCES event_executions(id) ON DELETE CASCADE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  owner_character_id text NOT NULL,
  moment_draft_id text REFERENCES moment_drafts(id) ON DELETE SET NULL,
  workflow_version text NOT NULL CHECK (btrim(workflow_version) <> ''),
  prompt text NOT NULL CHECK (btrim(prompt) <> ''),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  negative_prompt text CHECK (negative_prompt IS NULL OR btrim(negative_prompt) <> ''),
  seed bigint CHECK (seed IS NULL OR seed >= 0),
  status text NOT NULL CHECK (status IN ('QUEUED', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  external_job_id text,
  media_ref text,
  failure_reason text CHECK (failure_reason IS NULL OR btrim(failure_reason) <> ''),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT image_jobs_action_unique UNIQUE (action_id),
  CONSTRAINT image_jobs_owner_world_fk
    FOREIGN KEY (owner_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT image_jobs_status_shape CHECK (
    (status = 'QUEUED' AND external_job_id IS NULL AND media_ref IS NULL AND failure_reason IS NULL)
    OR (status = 'SUBMITTED' AND external_job_id IS NOT NULL AND media_ref IS NULL AND failure_reason IS NULL)
    OR (status = 'SUCCEEDED' AND external_job_id IS NOT NULL AND media_ref IS NOT NULL AND failure_reason IS NULL)
    OR (status IN ('FAILED', 'CANCELLED') AND failure_reason IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION enforce_behavior_media_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'behavior_actions' THEN
    IF NOT EXISTS (
      SELECT 1 FROM event_executions execution
      WHERE execution.id = NEW.execution_id
        AND execution.story_world_id = NEW.story_world_id
        AND NEW.actor_character_id = ANY(execution.target_character_ids)
    ) THEN
      RAISE EXCEPTION 'behavior action actor must be an execution target in the same world';
    END IF;
  ELSIF TG_TABLE_NAME = 'moment_drafts' THEN
    IF NOT EXISTS (
      SELECT 1 FROM behavior_actions action
      WHERE action.id = NEW.action_id
        AND action.kind = 'CREATE_MOMENT'
        AND action.execution_id = NEW.execution_id
        AND action.story_world_id = NEW.story_world_id
        AND action.actor_character_id = NEW.author_character_id
    ) THEN
      RAISE EXCEPTION 'moment draft must match a CREATE_MOMENT action';
    END IF;
  ELSIF TG_TABLE_NAME = 'image_jobs' THEN
    IF NOT EXISTS (
      SELECT 1 FROM behavior_actions action
      WHERE action.id = NEW.action_id
        AND action.execution_id = NEW.execution_id
        AND action.story_world_id = NEW.story_world_id
        AND action.actor_character_id = NEW.owner_character_id
        AND action.kind IN ('REQUEST_IMAGE', 'CREATE_MOMENT')
    ) THEN
      RAISE EXCEPTION 'image job must match an image-capable behavior action';
    END IF;
    IF NEW.moment_draft_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM moment_drafts draft
      WHERE draft.id = NEW.moment_draft_id
        AND draft.action_id = NEW.action_id
        AND draft.execution_id = NEW.execution_id
        AND draft.story_world_id = NEW.story_world_id
    ) THEN
      RAISE EXCEPTION 'image job moment draft must match its behavior action';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER behavior_actions_links_trigger
  BEFORE INSERT OR UPDATE OF execution_id, story_world_id, actor_character_id
  ON behavior_actions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_behavior_media_links();

CREATE TRIGGER moment_drafts_links_trigger
  BEFORE INSERT OR UPDATE OF action_id, execution_id, story_world_id, author_character_id
  ON moment_drafts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_behavior_media_links();

CREATE TRIGGER image_jobs_links_trigger
  BEFORE INSERT OR UPDATE OF action_id, execution_id, story_world_id, owner_character_id
  ON image_jobs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_behavior_media_links();

ALTER TABLE moment_drafts
  ADD CONSTRAINT moment_drafts_image_job_fk
  FOREIGN KEY (image_job_id)
  REFERENCES image_jobs(id)
  ON DELETE SET NULL;

CREATE INDEX image_jobs_queue_idx
  ON image_jobs (status, created_at, id);

COMMIT;
