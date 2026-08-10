BEGIN;

CREATE INDEX image_jobs_album_idx
  ON image_jobs (story_world_id, updated_at DESC, id DESC)
  WHERE status = 'SUCCEEDED';

COMMIT;
