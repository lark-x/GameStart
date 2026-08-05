BEGIN;

DROP TABLE IF EXISTS proactive_message_budgets;
DROP TRIGGER IF EXISTS event_executions_links_trigger ON event_executions;
DROP FUNCTION IF EXISTS enforce_event_execution_links();
DROP TABLE IF EXISTS event_executions;
DROP TABLE IF EXISTS character_plans;

COMMIT;
