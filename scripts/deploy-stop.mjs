#!/usr/bin/env node
/**
 * deploy-stop.mjs — Stop the GameStart deployment (preserves data volumes).
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDockerClient } from "./deploy/docker.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMPOSE_FILE = resolve(ROOT, "infra/compose/docker-compose.yml");

function main() {
  console.log("\nStopping GameStart deployment...\n");
  const dockerClient = createDockerClient({ rootDir: ROOT, composeFile: COMPOSE_FILE });
  dockerClient.down();
  console.log("\n✓ Containers stopped. Data volumes preserved.\n");
}

main();
