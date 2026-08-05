BEGIN;

DROP INDEX IF EXISTS moment_interactions_moment_created_idx;
DROP INDEX IF EXISTS moment_interactions_like_unique;
DROP TRIGGER IF EXISTS moment_interactions_links_trigger ON moment_interactions;
DROP FUNCTION IF EXISTS enforce_moment_interaction_links();
DROP TABLE IF EXISTS moment_interactions;
DROP TRIGGER IF EXISTS moments_audience_trigger ON moments;
DROP FUNCTION IF EXISTS enforce_moment_audience();
DROP TABLE IF EXISTS moments;

COMMIT;
