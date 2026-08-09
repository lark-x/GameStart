import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ApiClient } from "../api.js";
import type { ApiCharacter, ApiWorld } from "../types";

export const useAppStore = defineStore("app", () => {
  const apiBase = typeof window === "undefined"
    ? "http://127.0.0.1:3001"
    : (import.meta.env.VITE_API_BASE || window.location.origin);
  const api = new ApiClient(apiBase);

  const worlds = ref<ApiWorld[]>([]);
  const characters = ref<ApiCharacter[]>([]);
  const conversations = ref<unknown[]>([]);
  const currentWorldId = ref("");
  const currentCharacterId = ref("");
  const actorSessionId = ref("");
  const worldTimezone = ref("UTC");
  const appMode = ref<"world" | "creator">("world");

  const currentWorld = computed(() => worlds.value.find((w) => w.id === currentWorldId.value));
  const currentCharacter = computed(() => characters.value.find((c) => c.id === currentCharacterId.value));

  async function loadWorlds() {
    const result = await api.getWorlds();
    worlds.value = result.data ?? [];
    const firstWorld = worlds.value[0];
    if (firstWorld && !currentWorldId.value) {
      currentWorldId.value = firstWorld.id;
      worldTimezone.value = firstWorld.timezone ?? "UTC";
    }
  }

  async function loadCharacters() {
    if (!currentWorldId.value) return;
    const result = await api.getCharacters(currentWorldId.value);
    characters.value = result.data ?? [];
    const firstCharacter = characters.value[0];
    if (firstCharacter && !currentCharacterId.value) {
      const userChar = characters.value.find((c) => c.role === "USER");
      currentCharacterId.value = userChar?.id ?? firstCharacter.id;
    }
    api.setActorCharacterId(currentCharacterId.value);
  }

  async function switchCharacter(nextId: string) {
    if (actorSessionId.value) {
      await api.switchCharacter(actorSessionId.value, nextId);
    }
    currentCharacterId.value = nextId;
    api.setActorCharacterId(nextId);
  }

  return {
    api,
    worlds,
    characters,
    conversations,
    currentWorldId,
    currentCharacterId,
    actorSessionId,
    worldTimezone,
    appMode,
    currentWorld,
    currentCharacter,
    loadWorlds,
    loadCharacters,
    switchCharacter,
  };
});
