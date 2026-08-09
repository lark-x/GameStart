BEGIN;

-- 界面外观设置：皮肤主题 + 聊天背景，按 owner_key 归属并持久化到服务端
CREATE TABLE appearance_settings (
  id text PRIMARY KEY,
  owner_key text NOT NULL CHECK (btrim(owner_key) <> ''),
  theme_id text NOT NULL CHECK (btrim(theme_id) <> ''),
  chat_background_kind text NOT NULL CHECK (chat_background_kind IN ('theme', 'custom')),
  chat_background_image_ref text,
  chat_background_opacity double precision NOT NULL,
  chat_background_blur double precision NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT appearance_settings_owner_unique UNIQUE (owner_key)
);

COMMIT;
