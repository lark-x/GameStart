#!/usr/bin/env node
/**
 * deploy-status.mjs — Show current GameStart deployment status.
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createDockerClient } from "./deploy/docker.mjs";
import { detectEnvironment } from "./deploy/environment.mjs";
import { getLanAddresses } from "./deploy/network.mjs";
import { parseDockerPublishedPort } from "./deploy/port.mjs";
import { loadDeployState } from "./deploy/state.mjs";
import { parseServiceHealth } from "./deploy/health.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMPOSE_FILE = resolve(ROOT, "infra/compose/docker-compose.yml");
const DEPLOY_STATE = resolve(ROOT, ".data", "deployment.json");

function main() {
  console.log("\nGameStart Deployment Status\n");

  const dockerClient = createDockerClient({ rootDir: ROOT, composeFile: COMPOSE_FILE });
  const envType = detectEnvironment();

  // Query Docker for current service states
  for (const service of ["redis", "api", "worker", "web"]) {
    const raw = dockerClient.ps(service);
    const parsed = parseServiceHealth(raw, service);
    const icon = parsed.ok ? "✓" : "✖";
    const label = service.charAt(0).toUpperCase() + service.slice(1);
    console.log(`  ${icon} ${label.padEnd(10)} ${parsed.status}`);
  }

  // Show access URL by querying Docker directly
  const portRaw = dockerClient.port("web", 80);
  const actualPort = parseDockerPublishedPort(portRaw);
  const savedState = loadDeployState(DEPLOY_STATE);

  if (actualPort) {
    console.log(`\n  Local    http://127.0.0.1:${actualPort}`);
    console.log(`  API      http://127.0.0.1:${actualPort}/api/v2`);
    console.log(`  Health   http://127.0.0.1:${actualPort}/api/v2/health`);
    console.log(`  Ready    http://127.0.0.1:${actualPort}/api/v2/ready`);

    if (savedState?.mode === "lan") {
      const lanAddrs = getLanAddresses({ envType });
      for (const { name, address } of lanAddrs) {
        console.log(`  LAN (${name}) http://${address}:${actualPort}`);
      }
    }
  } else if (savedState) {
    console.log(`\n  (Containers stopped. Last known port: ${savedState.webPort}, mode: ${savedState.mode})`);
  } else {
    console.log("\n  No deployment detected. Run 'pnpm deploy' to start.");
  }

  console.log();
}

main();
