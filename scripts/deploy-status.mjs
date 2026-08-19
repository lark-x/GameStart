#!/usr/bin/env node
/**
 * deploy-status.mjs — Show current GameStart deployment status.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMPOSE_FILE = "infra/compose/docker-compose.yml";
const DEPLOY_STATE = resolve(ROOT, ".data", "deployment.json");

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

function main() {
  console.log("\nGameStart Status\n");

  // Query Docker for current state.
  for (const service of ["redis", "api", "worker", "web"]) {
    const raw = run(`docker compose -f ${COMPOSE_FILE} ps --format json ${service}`);
    let status = "not running";
    if (raw) {
      try {
        const p = JSON.parse(raw);
        status = p.Health || p.State || "unknown";
      } catch {
        status = /healthy|running/i.test(raw) ? "running" : "unknown";
      }
    }
    const icon = /healthy|running/i.test(status) ? "✓" : "✖";
    const label = service.charAt(0).toUpperCase() + service.slice(1);
    console.log(`  ${icon} ${label.padEnd(10)} ${status}`);
  }

  // Show access URL.
  const portRaw = run(`docker compose -f ${COMPOSE_FILE} port web 80`);
  const portMatch = portRaw?.match(/:(\d+)$/);
  if (portMatch) {
    const port = portMatch[1];
    console.log(`\n  Local  http://127.0.0.1:${port}`);
    console.log(`  API    http://127.0.0.1:${port}/api/v2`);
  } else if (existsSync(DEPLOY_STATE)) {
    try {
      const s = JSON.parse(readFileSync(DEPLOY_STATE, "utf8"));
      console.log(`\n  Last known port: ${s.webPort}`);
    } catch {}
  } else {
    console.log("\n  No deployment detected.");
  }
  console.log();
}

main();
