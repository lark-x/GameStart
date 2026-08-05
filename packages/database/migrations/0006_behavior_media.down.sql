BEGIN;

ALTER TABLE IF EXISTS moment_drafts
  DROP CONSTRAINT IF EXISTS moment_drafts_image_job_fk;
DROP TRIGGER IF EXISTS image_jobs_links_trigger ON image_jobs;
DROP TRIGGER IF EXISTS moment_drafts_links_trigger ON moment_drafts;
DROP TRIGGER IF EXISTS behavior_actions_links_trigger ON behavior_actions;
DROP FUNCTION IF EXISTS enforce_behavior_media_links();
DROP TABLE IF EXISTS image_jobs;
DROP TABLE IF EXISTS moment_drafts;
DROP TABLE IF EXISTS behavior_actions;

COMMIT;
