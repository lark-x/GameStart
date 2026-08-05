BEGIN;

INSERT INTO story_worlds (id, name, timezone, story_mode, relationship_dynamics_enabled)
VALUES ('dev-world', '开发故事世界', 'Asia/Shanghai', 'STATIC', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO characters (id, display_name, role, story_world_id, timezone, persona_prompt_ref)
VALUES
  ('dev-user', '体验者', 'USER', 'dev-world', 'Asia/Shanghai', NULL),
  ('dev-user-second', '另一位体验者', 'USER', 'dev-world', 'Asia/Shanghai', NULL),
  ('dev-character', '林遥', 'AI', 'dev-world', 'Asia/Shanghai', 'persona://dev-character')
ON CONFLICT (id) DO NOTHING;

INSERT INTO relationship_edges
  (id, source_character_id, target_character_id, story_world_id, relationship_type,
   affinity, trust, conflict, dependency, is_public, is_bidirectional)
VALUES ('dev-relationship', 'dev-user', 'dev-character', 'dev-world', 'friend', 58, 42, 0, 8, true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO actor_sessions (id, story_world_id, user_character_id, started_at)
VALUES ('dev-session', 'dev-world', 'dev-user', '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversations (id, story_world_id, type, title, created_at)
VALUES ('dev-conversation', 'dev-world', 'PRIVATE', '和林遥聊天', '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, character_id, story_world_id, joined_at)
VALUES
  ('dev-conversation', 'dev-user', 'dev-world', '2026-08-05T00:00:00.000Z'),
  ('dev-conversation', 'dev-character', 'dev-world', '2026-08-05T00:00:00.000Z')
ON CONFLICT (conversation_id, character_id) DO NOTHING;

INSERT INTO messages
  (id, conversation_id, author_character_id, kind, text, created_at, idempotency_key)
VALUES
  ('dev-message-welcome', 'dev-conversation', 'dev-character', 'TEXT', '今天想从哪里开始？我在这里。', '2026-08-05T00:00:00.000Z', 'dev-message-welcome'),
  ('dev-message-prompt', 'dev-conversation', 'dev-user', 'TEXT', '带我看看这个世界。', '2026-08-05T00:01:00.000Z', 'dev-message-prompt')
ON CONFLICT (id) DO NOTHING;

INSERT INTO character_visual_identities
  (id, character_id, story_world_id, positive_prompt, negative_prompt, style_tags, reference_image_refs, revision, updated_at)
VALUES
  ('dev-visual-identity', 'dev-character', 'dev-world',
   'warm portrait of a thoughtful young writer',
   'blurry, low quality, watermark',
   ARRAY['soft light', 'editorial illustration'],
   ARRAY['media://dev/lin-yao-reference.png'], 1, '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO character_visual_identities
  (id, character_id, story_world_id, positive_prompt, style_tags, reference_image_refs, revision, updated_at)
VALUES
  ('dev-user-visual-identity', 'dev-user', 'dev-world',
   'portrait of a curious traveler in a living story world',
   ARRAY['warm light', 'natural portrait'], ARRAY[]::text[], 1, '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO image_workflow_templates
  (id, version, workflow, positive_prompt_path, negative_prompt_path, seed_path)
VALUES
  ('dev-moment', 'v1',
   '{"6":{"inputs":{"text":"placeholder-positive"}},"7":{"inputs":{"text":"placeholder-negative"}},"9":{"inputs":{"seed":1}}}',
   ARRAY['6', 'inputs', 'text'], ARRAY['7', 'inputs', 'text'], ARRAY['9', 'inputs', 'seed'])
ON CONFLICT (id, version) DO NOTHING;

INSERT INTO sticker_packs (id, story_world_id, name, source_ref, created_at)
VALUES ('dev-sticker-pack', 'dev-world', '开发表情', 'local://dev', '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO stickers (id, pack_id, story_world_id, label, media_ref, tags, created_at)
VALUES ('dev-sticker-wave', 'dev-sticker-pack', 'dev-world', '挥手', 'media://dev/stickers/wave.png', ARRAY['hello', 'friendly'], '2026-08-05T00:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

COMMIT;
