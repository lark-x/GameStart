#!/usr/bin/env node

/**
 * Enforces package layering and the five V2 module ownership boundaries.
 * Scope authorization is enforced separately by check-task-scope.mjs.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  classifyPath,
  loadJson,
  loadModuleRegistry,
  normalizeRepoPath,
  validateRegistry,
} from "./governance-lib.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".vue"];
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;
const BASELINE_PATH = resolve(ROOT, ".ai/boundary-baseline.json");

const PACKAGE_RESTRICTIONS = {
  "packages/domain/src": ["database", "api", "worker", "ai", "ports"],
  "packages/ports/src": ["database", "api", "worker", "ai"],
  "packages/contracts/src": ["database", "api", "worker", "ai", "ports", "domain"],
};

function walkSources(directory) {
  const results = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (["node_modules", ".git", "dist", "coverage"].includes(entry)) continue;
      results.push(...walkSources(full));
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension)) && !entry.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

function sourceFiles() {
  return SOURCE_ROOTS.flatMap((root) => walkSources(join(ROOT, root)));
}

function importSpecifiers(content) {
  return [...content.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

function packageRoot(path) {
  const parts = normalizeRepoPath(path).split("/");
  return parts.length >= 2 && (parts[0] === "apps" || parts[0] === "packages")
    ? `${parts[0]}/${parts[1]}`
    : undefined;
}

function resolveRelativeTarget(sourceFile, specifier) {
  const unresolved = resolve(dirname(sourceFile), specifier);
  const candidates = [
    unresolved,
    ...SOURCE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(unresolved, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

export function packageRestrictionViolation(relFile, specifier) {
  for (const [sourceRoot, forbiddenPackages] of Object.entries(PACKAGE_RESTRICTIONS)) {
    if (!(relFile === sourceRoot || relFile.startsWith(`${sourceRoot}/`))) continue;
    const match = specifier.match(/^@living-network\/([^/]+)(?:\/.*)?$/);
    if (match !== null && forbiddenPackages.includes(match[1])) {
      return `${sourceRoot} must not depend on @living-network/${match[1]}`;
    }
  }
  return undefined;
}

export function moduleDependencyViolation(registry, sourcePath, targetPath) {
  const source = classifyPath(registry, sourcePath);
  const target = classifyPath(registry, targetPath);
  if (source.kind !== "owned" || target.kind !== "owned" || source.module === target.module) return undefined;
  const allowed = registry.modules[source.module].allowedDependencies;
  return allowed.includes(target.module)
    ? undefined
    : `${source.module} must not depend on ${target.module}`;
}

export function checkBoundaries(files = sourceFiles()) {
  const registry = loadModuleRegistry(ROOT);
  const baseline = new Set(loadJson(BASELINE_PATH).exceptions);
  const observedBaseline = new Set();
  const relativeFiles = files.map((file) => normalizeRepoPath(relative(ROOT, file)));
  const errors = validateRegistry(registry, relativeFiles);
  const record = (error, baselineKey) => {
    if (baseline.has(baselineKey)) observedBaseline.add(baselineKey);
    else errors.push(error);
  };

  for (const [fileIndex, file] of files.entries()) {
    const relFile = relativeFiles[fileIndex];
    const sourcePackage = packageRoot(relFile);
    const content = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(content)) {
      const packageError = packageRestrictionViolation(relFile, specifier);
      if (packageError !== undefined) {
        record(`${relFile}: ${packageError} (${specifier})`, `package:${relFile}:${specifier}`);
      }
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelativeTarget(file, specifier);
      if (target === undefined) continue;
      const relTarget = normalizeRepoPath(relative(ROOT, target));
      const targetPackage = packageRoot(relTarget);
      if (sourcePackage !== undefined && targetPackage !== undefined && sourcePackage !== targetPackage) {
        record(
          `${relFile}: relative import crosses package boundary (${specifier} -> ${relTarget})`,
          `relative:${relFile}:${specifier}`,
        );
      }
      const moduleError = moduleDependencyViolation(registry, relFile, relTarget);
      if (moduleError !== undefined) {
        record(`${relFile}: ${moduleError} (${specifier} -> ${relTarget})`, `module:${relFile}:${specifier}`);
      }
    }
  }
  for (const exception of baseline) {
    if (!observedBaseline.has(exception)) errors.push(`stale boundary baseline exception must be removed: ${exception}`);
  }
  return [...new Set(errors)];
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkBoundaries();
  if (errors.length > 0) {
    for (const error of errors) console.error(`VIOLATION: ${error}`);
    console.error(`\n${errors.length} boundary violation(s) found.`);
    process.exit(1);
  }
  console.log("No package or V2 module boundary violations found.");
}
