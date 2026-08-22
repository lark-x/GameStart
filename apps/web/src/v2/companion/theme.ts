import { ref } from "vue";

export type CompanionTheme = "cream" | "latte";

export interface CompanionThemeOption {
  id: CompanionTheme;
  label: string;
  dot: string;
  description: string;
}

export const COMPANION_THEMES: readonly CompanionThemeOption[] = [
  {
    id: "cream",
    label: "暖阳奶油",
    dot: "#e06d53",
    description: "温润奶油白背景，浅暖麦色卡片，珊瑚暖橘重点色",
  },
  {
    id: "latte",
    label: "落日暖咖",
    dot: "#c2782f",
    description: "温醇拿铁色背景，暖木棕卡片，落日琥珀金重点色",
  },
];

const COMPANION_THEME_STORAGE_KEY = "linshe_companion_theme";

function getInitialTheme(): CompanionTheme {
  if (typeof window === "undefined") return "cream";
  try {
    const saved = localStorage.getItem(COMPANION_THEME_STORAGE_KEY);
    if (saved === "cream" || saved === "latte") {
      return saved;
    }
  } catch {}
  return "cream";
}

const currentTheme = ref<CompanionTheme>(getInitialTheme());

export function useCompanionTheme() {
  function setTheme(nextTheme: CompanionTheme): void {
    currentTheme.value = nextTheme;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(COMPANION_THEME_STORAGE_KEY, nextTheme);
      } catch {}
    }
  }

  function toggleTheme(): void {
    setTheme(currentTheme.value === "cream" ? "latte" : "cream");
  }

  return {
    theme: currentTheme,
    setTheme,
    toggleTheme,
    themes: COMPANION_THEMES,
  };
}
