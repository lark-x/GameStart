BEGIN;

DROP TABLE IF EXISTS social_feed_events;

ALTER TABLE moment_interactions
  DROP COLUMN IF EXISTS reply_to_interaction_id;

COMMIT;
