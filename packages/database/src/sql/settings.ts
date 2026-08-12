import {
  assertAppearanceSettings,
  assertComfyUiSettings,
  assertLlmProviderProfile,
  type AppearanceSettings,
  type ChatBackgroundKind,
  type ComfyUiSettings,
  type LlmProviderProfile,
} from "@living-network/domain";
import type {
  AppearanceSettingsRepository,
  ComfyUiSettingsRepository,
  LlmProviderProfileRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  jsonArray,
} from "./utils.ts";

function mapLlmProviderProfileRow(row: SqlRow): LlmProviderProfile {
  const profile: LlmProviderProfile = {
    id: requiredString(row.id, "llm_provider_profiles.id"),
    name: requiredString(row.name, "llm_provider_profiles.name"),
    protocol: requiredString(row.protocol, "llm_provider_profiles.protocol") as LlmProviderProfile["protocol"],
    baseUrl: requiredString(row.base_url, "llm_provider_profiles.base_url"),
    model: requiredString(row.model, "llm_provider_profiles.model"),
    timeoutMs: requiredNumber(row.timeout_ms, "llm_provider_profiles.timeout_ms"),
    maxTokens: requiredNumber(row.max_tokens, "llm_provider_profiles.max_tokens"),
    temperature: requiredNumber(row.temperature, "llm_provider_profiles.temperature"),
    isActive: requiredBoolean(row.is_active, "llm_provider_profiles.is_active"),
    createdAt: requiredTimestamp(row.created_at, "llm_provider_profiles.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "llm_provider_profiles.updated_at"),
  };
  const encryptedApiKey = optionalString(row.encrypted_api_key, "llm_provider_profiles.encrypted_api_key");
  const encryptionIv = optionalString(row.encryption_iv, "llm_provider_profiles.encryption_iv");
  if (encryptedApiKey !== undefined) profile.encryptedApiKey = encryptedApiKey;
  if (encryptionIv !== undefined) profile.encryptionIv = encryptionIv;
  assertLlmProviderProfile(profile);
  return profile;
}

function mapComfyUiSettingsRow(row: SqlRow): ComfyUiSettings {
  const settings: ComfyUiSettings = {
    id: requiredString(row.id, "integration_settings.id"),
    baseUrl: requiredString(row.comfyui_base_url, "integration_settings.comfyui_base_url"),
    timeoutMs: requiredNumber(row.comfyui_timeout_ms, "integration_settings.comfyui_timeout_ms"),
    autoImageIntentEnabled: requiredBoolean(
      row.auto_image_intent_enabled,
      "integration_settings.auto_image_intent_enabled",
    ),
    updatedAt: requiredTimestamp(row.updated_at, "integration_settings.updated_at"),
  };
  const defaultWorkflowVersion = optionalString(
    row.default_workflow_version,
    "integration_settings.default_workflow_version",
  );
  if (defaultWorkflowVersion !== undefined) settings.defaultWorkflowVersion = defaultWorkflowVersion;
  assertComfyUiSettings(settings);
  return settings;
}

function mapAppearanceSettingsRow(row: SqlRow): AppearanceSettings {
const settings: AppearanceSettings = {
id: requiredString(row.id, "appearance_settings.id"),
ownerKey: requiredString(row.owner_key, "appearance_settings.owner_key"),
themeId: requiredString(row.theme_id, "appearance_settings.theme_id"),
chatBackground: {
kind: requiredString(
row.chat_background_kind,
"appearance_settings.chat_background_kind",
) as ChatBackgroundKind,
opacity: requiredNumber(row.chat_background_opacity, "appearance_settings.chat_background_opacity"),
blur: requiredNumber(row.chat_background_blur, "appearance_settings.chat_background_blur"),
},
updatedAt: requiredTimestamp(row.updated_at, "appearance_settings.updated_at"),
};
const imageRef = optionalString(
row.chat_background_image_ref,
"appearance_settings.chat_background_image_ref",
);
if (imageRef !== undefined) settings.chatBackground.imageRef = imageRef;
settings.chatBackground.items = jsonArray(row.chat_background_items ?? [], "appearance_settings.chat_background_items") as NonNullable<AppearanceSettings["chatBackground"]["items"]>;
assertAppearanceSettings(settings);
return settings;
}

const APPEARANCE_SETTINGS_SELECT = `
SELECT id, owner_key, theme_id, chat_background_kind, chat_background_image_ref,
chat_background_opacity, chat_background_blur, chat_background_items, updated_at
FROM appearance_settings`;

const LLM_PROVIDER_PROFILE_SELECT = `
  SELECT id, name, protocol, base_url, model, timeout_ms, max_tokens, temperature,
         encrypted_api_key, encryption_iv, is_active, created_at, updated_at
  FROM llm_provider_profiles`;

const COMFY_UI_SETTINGS_SELECT = `
  SELECT id, comfyui_base_url, comfyui_timeout_ms, default_workflow_version,
         auto_image_intent_enabled, updated_at
  FROM integration_settings`;

export function createSettingsRepositories(client: SqlClient): {
  appearanceSettings: AppearanceSettingsRepository;
  llmProviderProfiles: LlmProviderProfileRepository;
  comfyUiSettings: ComfyUiSettingsRepository;
} {
  const appearanceSettings: AppearanceSettingsRepository = {
getByOwnerKey: async (ownerKey) => {
const result = await client.query(
`${APPEARANCE_SETTINGS_SELECT} WHERE owner_key = $1`,
[ownerKey],
);
const row = result.rows[0];
return row ? mapAppearanceSettingsRow(row) : undefined;
},
save: async (settings) => {
assertAppearanceSettings(settings);
await client.query(
`INSERT INTO appearance_settings (
id, owner_key, theme_id, chat_background_kind, chat_background_image_ref,
chat_background_opacity, chat_background_blur, chat_background_items, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (owner_key) DO UPDATE SET
theme_id = EXCLUDED.theme_id,
chat_background_kind = EXCLUDED.chat_background_kind,
chat_background_image_ref = EXCLUDED.chat_background_image_ref,
chat_background_opacity = EXCLUDED.chat_background_opacity,
chat_background_blur = EXCLUDED.chat_background_blur,
chat_background_items = EXCLUDED.chat_background_items,
updated_at = EXCLUDED.updated_at`,
[
settings.id,
settings.ownerKey,
settings.themeId,
settings.chatBackground.kind,
settings.chatBackground.imageRef ?? null,
settings.chatBackground.opacity,
settings.chatBackground.blur,
JSON.stringify(settings.chatBackground.items ?? []),
settings.updatedAt,
],
);
},
};


  const llmProviderProfiles: LlmProviderProfileRepository = {
      list: async () => {
        const result = await client.query(`${LLM_PROVIDER_PROFILE_SELECT} ORDER BY id`);
        return result.rows.map(mapLlmProviderProfileRow);
      },
      getById: async (id) => {
        const result = await client.query(`${LLM_PROVIDER_PROFILE_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapLlmProviderProfileRow(row) : undefined;
      },
      getActive: async () => {
        const result = await client.query(
          `${LLM_PROVIDER_PROFILE_SELECT} WHERE is_active = true`,
        );
        const row = result.rows[0];
        return row ? mapLlmProviderProfileRow(row) : undefined;
      },
      save: async (profile) => {
        assertLlmProviderProfile(profile);
        await client.query(
          `WITH deactivate_other_profiles AS (
             UPDATE llm_provider_profiles
             SET is_active = false, updated_at = $13
             WHERE is_active = true AND id <> $1 AND $11 = true
           )
           INSERT INTO llm_provider_profiles (
             id, name, protocol, base_url, model, timeout_ms, max_tokens, temperature,
             encrypted_api_key, encryption_iv, is_active, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             protocol = EXCLUDED.protocol,
             base_url = EXCLUDED.base_url,
             model = EXCLUDED.model,
             timeout_ms = EXCLUDED.timeout_ms,
             max_tokens = EXCLUDED.max_tokens,
             temperature = EXCLUDED.temperature,
             encrypted_api_key = EXCLUDED.encrypted_api_key,
             encryption_iv = EXCLUDED.encryption_iv,
             is_active = EXCLUDED.is_active,
             updated_at = EXCLUDED.updated_at`,
          [
            profile.id,
            profile.name,
            profile.protocol,
            profile.baseUrl,
            profile.model,
            profile.timeoutMs,
            profile.maxTokens,
            profile.temperature,
            profile.encryptedApiKey ?? null,
            profile.encryptionIv ?? null,
            profile.isActive,
            profile.createdAt,
            profile.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM llm_provider_profiles WHERE id = $1`, [id]);
      },
    };

  const comfyUiSettings: ComfyUiSettingsRepository = {
      get: async () => {
        const result = await client.query(`${COMFY_UI_SETTINGS_SELECT} WHERE id = 'default'`);
        const row = result.rows[0];
        return row ? mapComfyUiSettingsRow(row) : undefined;
      },
      save: async (settings) => {
        assertComfyUiSettings(settings);
        if (settings.id !== "default") {
          throw new TypeError("ComfyUI settings id must be default");
        }
        await client.query(
          `INSERT INTO integration_settings (
             id, comfyui_base_url, comfyui_timeout_ms, default_workflow_version,
             auto_image_intent_enabled, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             comfyui_base_url = EXCLUDED.comfyui_base_url,
             comfyui_timeout_ms = EXCLUDED.comfyui_timeout_ms,
             default_workflow_version = EXCLUDED.default_workflow_version,
             auto_image_intent_enabled = EXCLUDED.auto_image_intent_enabled,
             updated_at = EXCLUDED.updated_at`,
          [
            settings.id,
            settings.baseUrl,
            settings.timeoutMs,
            settings.defaultWorkflowVersion ?? null,
            settings.autoImageIntentEnabled,
            settings.updatedAt,
          ],
        );
      },
    };

  return { appearanceSettings, llmProviderProfiles, comfyUiSettings };
}
