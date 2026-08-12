import {
  assertAppearanceSettings,
  assertComfyUiSettings,
  assertLlmProviderProfile,
  type AppearanceSettings,
  type ComfyUiSettings,
  type LlmProviderProfile,
} from "@living-network/domain";
import type {
  AppearanceSettingsRepository,
  ComfyUiSettingsRepository,
  LlmProviderProfileRepository,
} from "../repositories.ts";

function copyAppearanceSettings(settings: AppearanceSettings): AppearanceSettings {
  const chatBackground = { ...settings.chatBackground };
  if (settings.chatBackground.items !== undefined) {
    chatBackground.items = settings.chatBackground.items.map((item) => ({ ...item }));
  }
  return { ...settings, chatBackground };
}

function copyLlmProviderProfile(profile: LlmProviderProfile): LlmProviderProfile {
  return { ...profile };
}

function copyComfyUiSettings(settings: ComfyUiSettings): ComfyUiSettings {
  return { ...settings };
}

export function createAppearanceSettingsRepo(
  map: Map<string, AppearanceSettings>,
): AppearanceSettingsRepository {
  return {
    getByOwnerKey: async (ownerKey) => {
      const settings = [...map.values()].find(
        (candidate) => candidate.ownerKey === ownerKey,
      );
      return settings ? copyAppearanceSettings(settings) : undefined;
    },
    save: async (settings) => {
      assertAppearanceSettings(settings);
      const conflict = [...map.values()].some(
        (candidate) => candidate.ownerKey === settings.ownerKey && candidate.id !== settings.id,
      );
      if (conflict) {
        throw new TypeError(`Duplicate appearance settings owner key: ${settings.ownerKey}`);
      }
      map.set(settings.id, copyAppearanceSettings(settings));
    },
  };
}

export function createLlmProviderProfileRepo(
  map: Map<string, LlmProviderProfile>,
): LlmProviderProfileRepository {
  return {
    list: async () => [...map.values()].sort((left, right) => left.id.localeCompare(right.id)).map(copyLlmProviderProfile),
    getById: async (id) => {
      const profile = map.get(id);
      return profile ? copyLlmProviderProfile(profile) : undefined;
    },
    getActive: async () => {
      const profile = [...map.values()].find((candidate) => candidate.isActive);
      return profile ? copyLlmProviderProfile(profile) : undefined;
    },
    save: async (profile) => {
      assertLlmProviderProfile(profile);
      if (profile.isActive) {
        for (const [id, candidate] of map.entries()) {
          if (id !== profile.id && candidate.isActive) {
            map.set(id, copyLlmProviderProfile({ ...candidate, isActive: false, updatedAt: profile.updatedAt }));
          }
        }
      }
      map.set(profile.id, copyLlmProviderProfile(profile));
    },
    delete: async (id) => { map.delete(id); },
  };
}

export function createComfyUiSettingsRepo(
  map: Map<string, ComfyUiSettings>,
): ComfyUiSettingsRepository {
  return {
    get: async () => {
      const settings = map.get("default");
      return settings ? copyComfyUiSettings(settings) : undefined;
    },
    save: async (settings) => {
      assertComfyUiSettings(settings);
      if (settings.id !== "default") throw new TypeError("ComfyUI settings id must be default");
      map.set("default", copyComfyUiSettings(settings));
    },
  };
}
