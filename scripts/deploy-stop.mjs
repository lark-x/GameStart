#!/usr/bin/env node
/**
 * deploy-stop.mjs — Stop the GameStart deployment (preserves data volumes).
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

console.log("\nStopping GameStart deployment...\n");
execSync(`docker compose -f infra/compose/docker-compose.yml down`, { cwd: ROOT, stdio: "inherit" });
console.log("\n✓ Containers stopped. Data volumes preserved.\n");
