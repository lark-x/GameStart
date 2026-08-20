import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
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
 * Ensure INTEGRATION_SECRET_KEY exists in the .env file.
 *
 * Generates a fresh 32-byte Base64 key only when the variable is missing or
 * empty. Never regenerates an existing key — doing so would make previously
 * encrypted model API keys undecryptable.
 *
 * Returns true when a new key was generated and written, false otherwise.
 */
export function ensureSecretKey(envPath) {
  if (!existsSync(envPath)) return false;
  try {
    const content = readFileSync(envPath, "utf8");
    const lines = content.split("\n");
    let found = false;
    let generated = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed.startsWith("INTEGRATION_SECRET_KEY=")) continue;
      found = true;
      const value = trimmed.slice("INTEGRATION_SECRET_KEY=".length).trim();
      if (value.length > 0) return false; // existing key, keep it
      const key = randomBytes(32).toString("base64");
      lines[i] = "INTEGRATION_SECRET_KEY=" + key;
      generated = true;
      break;
    }
    if (!found) {
      lines.push("");
      lines.push("# Auto-generated on first deploy. Keep this value stable.");
      lines.push("INTEGRATION_SECRET_KEY=" + randomBytes(32).toString("base64"));
      generated = true;
    }
    if (generated) {
      writeFileSync(envPath, lines.join("\n") + "\n");
    }
    return generated;
  } catch {
    return false;
  }
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
