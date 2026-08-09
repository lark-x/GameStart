BEGIN;

CREATE TABLE llm_provider_profiles (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  protocol text NOT NULL CHECK (protocol IN ('OPENAI_COMPATIBLE', 'ANTHROPIC')),
  base_url text NOT NULL CHECK (btrim(base_url) <> ''),
  model text NOT NULL CHECK (btrim(model) <> ''),
  timeout_ms integer NOT NULL CHECK (timeout_ms BETWEEN 1 AND 600000),
  max_tokens integer NOT NULL CHECK (max_tokens BETWEEN 1 AND 128000),
  temperature double precision NOT NULL CHECK (temperature BETWEEN 0 AND 2),
  encrypted_api_key text,
  encryption_iv text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT llm_provider_profiles_key_parts CHECK (
    (encrypted_api_key IS NULL AND encryption_iv IS NULL) OR
    (encrypted_api_key IS NOT NULL AND encryption_iv IS NOT NULL)
  )
);

CREATE UNIQUE INDEX llm_provider_profiles_one_active
  ON llm_provider_profiles ((is_active)) WHERE is_active;

CREATE TABLE integration_settings (
  id text PRIMARY KEY CHECK (id = 'default'),
  comfyui_base_url text NOT NULL CHECK (btrim(comfyui_base_url) <> ''),
  comfyui_timeout_ms integer NOT NULL CHECK (comfyui_timeout_ms BETWEEN 1 AND 600000),
  default_workflow_version text,
  auto_image_intent_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL
);

COMMIT;
