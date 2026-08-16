#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import {
  classifyPath,
  loadJson,
  loadModuleRegistry,
  matchesAny,
  matchesGlob,
  normalizeRepoPath,
  validateRegistry,
} from "./governance-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const TASK_DIRECTORY = "docs/tasks/";
const GLOB_MARKERS = /[*?[\]{}]/;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function gitLines(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((line) => normalizeRepoPath(line.trim()))
    .filter(Boolean);
}

function defaultBase() {
  if (process.env.SCOPE_BASE_SHA) return process.env.SCOPE_BASE_SHA;
  try {
    return execFileSync("git", ["merge-base", "HEAD", "origin/main"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

export function validateTask(task, registry) {
  const errors = [];
  const requiredStrings = ["id", "title", "module", "risk", "changeClass", "status", "userOutcome"];
  if (task.schemaVersion !== 1) errors.push("task schemaVersion must be 1");
  for (const field of requiredStrings) {
    if (typeof task[field] !== "string" || task[field].length === 0) errors.push(`task ${field} must be a non-empty string`);
  }
  if (!(task.module in registry.modules)) errors.push(`task has unknown module ${task.module}`);
  if (!["low", "medium", "high"].includes(task.risk)) errors.push(`task has invalid risk ${task.risk}`);
  if (!["normal", "v1-retirement"].includes(task.changeClass)) errors.push(`task has invalid changeClass ${task.changeClass}`);
  if (!["planned", "approved", "implemented", "merged"].includes(task.status)) errors.push(`task has invalid status ${task.status}`);
  for (const field of ["allowedPaths", "forbiddenPaths", "nonGoals", "interfaceRequests", "acceptanceCommands"]) {
    if (!Array.isArray(task[field])) errors.push(`task ${field} must be an array`);
  }
  if (Array.isArray(task.allowedPaths) && task.allowedPaths.length === 0) errors.push("task allowedPaths must not be empty");
  if (typeof task.approval?.required !== "boolean" || typeof task.approval?.confirmed !== "boolean") {
    errors.push("task approval must contain boolean required and confirmed fields");
  }
  if (task.risk !== "low" && task.approval?.required !== true) errors.push("medium/high risk task must require approval");
  if (task.approval?.confirmed === true && !task.approval?.reference) errors.push("confirmed task requires an approval reference");
  if (typeof task.delivery !== "object" || task.delivery === null) {
    errors.push("task delivery must be an object");
  } else {
    if (typeof task.delivery.branch !== "string" || !task.delivery.branch.startsWith("codex/")) {
      errors.push("task delivery.branch must start with codex/");
    }
    if (typeof task.delivery.baseSha !== "string" || task.delivery.baseSha.length < 7) {
      errors.push("task delivery.baseSha must identify the branch base");
    }
    if (!Array.isArray(task.delivery.commits) || !Array.isArray(task.delivery.results)) {
      errors.push("task delivery commits and results must be arrays");
    }
  }
  if (task.module === "integration" && task.allowedPaths?.some((path) => GLOB_MARKERS.test(path))) {
    errors.push("integration tasks must list exact allowed paths; globs are forbidden");
  }
  return errors;
}

function allowedPatternIsOwned(registry, moduleName, pattern) {
  const definition = registry.modules[moduleName];
  if (definition === undefined) return false;
  if (!GLOB_MARKERS.test(pattern)) return classifyPath(registry, pattern).module === moduleName;
  return definition.ownedPaths.some((owned) => {
    if (owned === pattern) return true;
    const ownedPrefix = owned.split(/[*?[{]/, 1)[0];
    const allowedPrefix = pattern.split(/[*?[{]/, 1)[0];
    return ownedPrefix.length > 0 && allowedPrefix.startsWith(ownedPrefix);
  });
}

export function validateTaskScope({ registry, task, taskPath, changedFiles, branchName }) {
  const errors = [...validateTask(task, registry)];
  const normalizedTaskPath = normalizeRepoPath(taskPath);
  const allowedPaths = task.allowedPaths ?? [];
  if (normalizedTaskPath !== `docs/tasks/${task.id}.json`) {
    errors.push(`task manifest filename must match its id: docs/tasks/${task.id}.json`);
  }
  if (branchName !== undefined && branchName.length > 0) {
    if (task.delivery?.branch !== branchName) errors.push(`task branch ${task.delivery?.branch} does not match ${branchName}`);
    if (!branchName.startsWith(`codex/${task.module}/`)) {
      errors.push(`branch must start with codex/${task.module}/`);
    }
  }
  for (const pattern of allowedPaths) {
    const delegatedExact = !GLOB_MARKERS.test(pattern) && matchesAny(pattern, registry.delegatedPaths);
    const ownTaskRecord = pattern === normalizedTaskPath;
    if (!delegatedExact && !ownTaskRecord && !allowedPatternIsOwned(registry, task.module, pattern)) {
      errors.push(`allowed path is outside module ${task.module}: ${pattern}`);
    }
  }
  const substantiveFiles = changedFiles.filter((file) => {
    const normalized = normalizeRepoPath(file);
    return normalized !== normalizedTaskPath && classifyPath(registry, normalized).kind !== "delegated";
  });
  if (task.risk !== "low" && task.approval?.confirmed !== true && substantiveFiles.length > 0) {
    errors.push("medium/high risk task requires confirmed approval before implementation files change");
  }
  for (const file of changedFiles.map(normalizeRepoPath)) {
    if (!allowedPaths.some((pattern) => matchesGlob(file, pattern))) {
      errors.push(`changed file is outside task allowedPaths: ${file}`);
      continue;
    }
    if ((task.forbiddenPaths ?? []).some((pattern) => matchesGlob(file, pattern))) {
      errors.push(`changed file matches task forbiddenPaths: ${file}`);
    }
    const classification = classifyPath(registry, file);
    if (classification.kind === "overlap") {
      errors.push(`changed file has overlapping owners: ${file} (${classification.modules.join(", ")})`);
    } else if (classification.kind === "read-only") {
      if (!(task.module === "integration" && task.changeClass === "v1-retirement")) {
        errors.push(`V1/read-only file cannot be changed by this task: ${file}`);
      }
    } else if (classification.kind === "unowned") {
      errors.push(`changed file has no module owner: ${file}`);
    } else if (classification.kind === "delegated") {
      if (GLOB_MARKERS.test(allowedPaths.find((pattern) => matchesGlob(file, pattern)) ?? "")) {
        errors.push(`delegated interface request must be listed exactly: ${file}`);
      }
    } else if (classification.module !== task.module && file !== normalizedTaskPath) {
      errors.push(`changed file belongs to ${classification.module}, not ${task.module}: ${file}`);
    }
    if (classification.kind !== "delegated" && matchesAny(file, registry.protectedPaths) && task.module !== "integration" && file !== normalizedTaskPath) {
      errors.push(`protected file requires an integration task: ${file}`);
    }
    if (matchesAny(file, registry.highRiskPaths) && task.risk !== "high") {
      errors.push(`high-risk file requires risk=high: ${file}`);
    }
  }
  return [...new Set(errors)];
}

export function discoverTaskManifest(changedFiles, explicitManifest) {
  if (explicitManifest !== undefined) return normalizeRepoPath(explicitManifest);
  const candidates = changedFiles.filter((file) => file.startsWith(TASK_DIRECTORY) && file.endsWith(".json"));
  if (candidates.length !== 1) {
    throw new Error(`expected exactly one changed task manifest, found ${candidates.length}`);
  }
  return candidates[0];
}

export function main() {
  const registry = loadModuleRegistry(ROOT);
  const trackedFiles = gitLines(["ls-files"]);
  const registryErrors = validateRegistry(registry, trackedFiles);
  if (registryErrors.length > 0) throw new Error(registryErrors.join("\n"));

  const base = argumentValue("--base") ?? defaultBase();
  const explicitManifest = argumentValue("--manifest") ?? process.env.TASK_MANIFEST;
  const changedFiles = [...new Set([
    ...(base === undefined ? [] : gitLines(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`])),
    ...gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
    ...gitLines(["ls-files", "--others", "--exclude-standard"]),
  ])];
  try {
    if (changedFiles.length === 0 && explicitManifest === undefined) {
      console.log("Task scope registry is valid; no branch changes require a task manifest.");
      return;
    }
    const taskPath = discoverTaskManifest(changedFiles, explicitManifest);
    const absoluteTaskPath = resolve(ROOT, taskPath);
    if (!existsSync(absoluteTaskPath)) throw new Error(`task manifest does not exist: ${taskPath}`);
    const task = loadJson(absoluteTaskPath);
    const branchName = process.env.SCOPE_HEAD_REF || execFileSync(
      "git",
      ["branch", "--show-current"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    const errors = validateTaskScope({ registry, task, taskPath, changedFiles, branchName });
    if (errors.length > 0) {
      console.error("SCOPE GOVERNANCE PAUSED (deprecated): scope-check is informational during feature-first development.");
      console.error(errors.join("\n"));
      console.log("Task scope check is not blocking; no task.json or module ownership is required for normal features.");
      return;
    }
    console.log(`Task scope valid for ${task.id}: ${changedFiles.length} changed file(s), module=${task.module}.`);
  } catch (error) {
    console.error("SCOPE GOVERNANCE PAUSED (deprecated): scope-check is informational during feature-first development.");
    console.error(error instanceof Error ? error.message : String(error));
    console.log("Task scope check is not blocking; no task.json or module ownership is required for normal features.");
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`SCOPE VIOLATION:\n${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
