import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Ensure a .env file exists; if missing, initialize from .env.example.
 */
export function ensureDotEnv(envPath, examplePath) {
  if (existsSync(envPath)) return false;
  try {
    mkdirSync(dirname(envPath), { recursive: true });
    if (examplePath && existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
    } else {
      writeFileSync(envPath, "# Living Network V2 Environment\n");
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a .env file into key-value pairs without shell expansion.
 */
export function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return {};
  const result = {};
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  } catch {
    // Ignore read errors
  }
  return result;
}

/**
 * Save deployment state to .data/deployment.json.
 */
export function saveDeployState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const payload = {
    version: 1,
    ...state,
    deployedAt: state.deployedAt || new Date().toISOString(),
  };
  writeFileSync(statePath, JSON.stringify(payload, null, 2) + "\n");
}

/**
 * Load previous deployment state from .data/deployment.json.
 */
export function loadDeployState(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    const raw = readFileSync(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
