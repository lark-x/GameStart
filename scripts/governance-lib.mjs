import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function globToRegExp(glob) {
  const normalized = normalizeRepoPath(glob);
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*") {
      if (normalized[index + 1] === "*") {
        index += 1;
        if (normalized[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export function matchesGlob(path, glob) {
  return globToRegExp(glob).test(normalizeRepoPath(path));
}

export function matchesAny(path, globs = []) {
  return globs.some((glob) => matchesGlob(path, glob));
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadModuleRegistry(root) {
  return loadJson(resolve(root, ".ai/modules.json"));
}

export function ownersForPath(registry, path) {
  return Object.entries(registry.modules)
    .filter(([, definition]) => matchesAny(path, definition.ownedPaths))
    .map(([name]) => name);
}

export function classifyPath(registry, path) {
  const normalized = normalizeRepoPath(path);
  if (matchesAny(normalized, registry.delegatedPaths)) return { kind: "delegated" };
  const owners = ownersForPath(registry, normalized);
  if (owners.length === 1) return { kind: "owned", module: owners[0] };
  if (owners.length > 1) return { kind: "overlap", modules: owners };
  if (matchesAny(normalized, registry.legacyReadOnlyRoots)) return { kind: "read-only" };
  return { kind: "unowned" };
}

export function validateRegistry(registry, repositoryFiles = []) {
  const errors = [];
  if (registry.schemaVersion !== 1) errors.push("module registry schemaVersion must be 1");
  if (registry.unownedPolicy !== "deny") errors.push("module registry unownedPolicy must be deny");
  const seenPatterns = new Map();
  for (const [moduleName, definition] of Object.entries(registry.modules ?? {})) {
    if (!Array.isArray(definition.ownedPaths) || definition.ownedPaths.length === 0) {
      errors.push(`module ${moduleName} must own at least one path`);
    }
    if (!Array.isArray(definition.allowedDependencies) || !definition.allowedDependencies.includes(moduleName)) {
      errors.push(`module ${moduleName} must allow itself as a dependency`);
    }
    for (const dependency of definition.allowedDependencies ?? []) {
      if (!(dependency in registry.modules)) errors.push(`module ${moduleName} has unknown dependency ${dependency}`);
    }
    for (const pattern of definition.ownedPaths ?? []) {
      const previous = seenPatterns.get(pattern);
      if (previous !== undefined) errors.push(`owned path pattern ${pattern} is duplicated by ${previous} and ${moduleName}`);
      seenPatterns.set(pattern, moduleName);
    }
  }
  for (const file of repositoryFiles) {
    const owners = ownersForPath(registry, file);
    if (owners.length > 1) errors.push(`${file} is owned by multiple modules: ${owners.join(", ")}`);
    if (matchesAny(file, registry.activeRuntimePaths) && owners.length === 0) {
      errors.push(`active runtime file ${file} has no module owner`);
    }
  }
  return errors;
}

export function repoRelative(root, path) {
  return normalizeRepoPath(relative(root, path));
}
