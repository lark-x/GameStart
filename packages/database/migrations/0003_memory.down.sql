BEGIN;

DROP TRIGGER IF EXISTS memory_visibility_trigger ON memory_items;
DROP FUNCTION IF EXISTS enforce_memory_visibility();
DROP TABLE IF EXISTS memory_items;

COMMIT;
