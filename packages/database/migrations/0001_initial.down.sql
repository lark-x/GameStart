BEGIN;

DROP TRIGGER IF EXISTS actor_sessions_user_character_role_trigger ON actor_sessions;
DROP FUNCTION IF EXISTS enforce_actor_session_user_character();
DROP TABLE IF EXISTS actor_sessions;
DROP TABLE IF EXISTS relationship_edges;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS story_worlds;

COMMIT;
