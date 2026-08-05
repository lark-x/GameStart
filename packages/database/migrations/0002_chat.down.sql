BEGIN;

DROP TRIGGER IF EXISTS messages_active_author_trigger ON messages;
DROP FUNCTION IF EXISTS enforce_message_active_author();
DROP TABLE IF EXISTS messages;
DROP TRIGGER IF EXISTS conversation_member_count_trigger ON conversation_members;
DROP FUNCTION IF EXISTS enforce_conversation_member_count();
DROP TABLE IF EXISTS conversation_members;
DROP TABLE IF EXISTS conversations;

COMMIT;
