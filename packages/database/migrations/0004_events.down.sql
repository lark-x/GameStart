BEGIN;

DROP TABLE IF EXISTS scheduled_occurrences;
DROP TRIGGER IF EXISTS world_event_definitions_targets_trigger ON world_event_definitions;
DROP FUNCTION IF EXISTS enforce_event_definition_targets();
DROP TABLE IF EXISTS world_event_definitions;

COMMIT;
