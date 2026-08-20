#!/usr/bin/env node
/**
 * deploy.mjs — GameStart cross-platform Docker deployment.
 *
 * Usage:
 *   pnpm deploy
 *   pnpm deploy -- --mode lan
 *   pnpm deploy -- --port 18050
 *
 * Container-internal ports are fixed (Web:80, API:3003, Redis:6379).
 * Only Web is published to the host.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs, DeploymentError } from "./deploy/cli.mjs";
import { detectEnvironment, checkDockerPrerequisites, resolveDeployMode } from "./deploy/environment.mjs";
import { resolveHostBind, getLanAddresses } from "./deploy/network.mjs";
import { selectWebPort, findFreePort, parseDockerPublishedPort, classifyDockerError, MAX_PORT_RETRIES, PORT_RANGE_END } from "./deploy/port.mjs";
import { createDockerClient } from "./deploy/docker.mjs";
import { acquireDeployLock } from "./deploy/lock.mjs";
import { loadDotEnv, loadDeployState, saveDeployState, ensureDotEnv, ensureSecretKey } from "./deploy/state.mjs";
import { waitForService, verifyCriticalEndpoints, checkComfyUiHealth, fetchRuntimeComfyConfig } from "./deploy/health.mjs";
import { formatDeploymentBanner } from "./deploy/output.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMPOSE_FILE = resolve(ROOT, "infra/compose/docker-compose.yml");
const DATA_DIR = resolve(ROOT, ".data");
const DEPLOY_STATE_FILE = resolve(DATA_DIR, "deployment.json");
const DEPLOY_LOCK_FILE = resolve(DATA_DIR, "deploy.lock");
const ENV_FILE = resolve(ROOT, ".env");
const ENV_EXAMPLE_FILE = resolve(ROOT, ".env.example");

function log(msg) {
  process.stdout.write(msg + "\n");
}

function logError(msg) {
  process.stderr.write(msg + "\n");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    log("GameStart Deployment Tool\n");
    log("Usage:");
    log("  pnpm deploy                 Deploy in local mode (bind 127.0.0.1)");
    log("  pnpm deploy -- --mode lan   Deploy in LAN mode (bind 0.0.0.0)");
    log("  pnpm deploy -- --port 18050 Deploy on an explicit Web host port");
    log("  pnpm deploy:doctor          Run environment & network pre-flight check");
    log("  pnpm deploy:status          Check current deployment status");
    log("  pnpm deploy:stop            Stop containers (preserves data volumes)");
    return;
  }

  ensureDotEnv(ENV_FILE, ENV_EXAMPLE_FILE);
  const generatedSecret = ensureSecretKey(ENV_FILE);
  const dotEnv = loadDotEnv(ENV_FILE);
  if (generatedSecret) {
    log("      ✓ Generated INTEGRATION_SECRET_KEY");
    log("      ✓ Saved to .env (kept stable on future deploys)");
  }
  const releaseLock = acquireDeployLock(DEPLOY_LOCK_FILE);

  try {
    await runDeployment(args, dotEnv);
  } finally {
    releaseLock();
  }
}

async function runDeployment(args, dotEnv) {
  const envType = detectEnvironment();
  const dockerClient = createDockerClient({ rootDir: ROOT, composeFile: COMPOSE_FILE });

  // ── Step 1: Check Environment & Docker ─────────────────────────────────
  log("\n[1/7] Checking Docker environment...");
  checkDockerPrerequisites((cmd) => {
    const [executable, ...rest] = cmd;
    execFileSync(executable, rest, { stdio: "ignore" });
  });
  log(`      ✓ Docker ready (${envType})`);

  // ── Step 2: Determine Mode & Port ──────────────────────────────────────
  log("\n[2/7] Selecting Web port & host binding...");
  const mode = resolveDeployMode({ cliMode: args.mode, webHostBind: dotEnv.WEB_HOST_BIND });
  const hostBind = resolveHostBind(mode);

  const explicitPort = args.port || (dotEnv.WEB_PORT ? parseInt(dotEnv.WEB_PORT, 10) : undefined);
  const lastState = loadDeployState(DEPLOY_STATE_FILE);
  const lastStatePort = lastState?.webPort;

  const portSelection = await selectWebPort({ explicitPort, lastStatePort });
  let currentWebPort = portSelection.port;

  log(`      Mode: ${mode} (Host Bind: ${hostBind})`);
  log(`      Web Port: ${currentWebPort} (${portSelection.source})`);

  // ── Step 3: Build Images (Once) ────────────────────────────────────────
  log("\n[3/7] Building container images...");
  const buildEnv = {
    WEB_PORT: String(currentWebPort),
    WEB_HOST_BIND: hostBind,
  };
  dockerClient.build(buildEnv);
  log("      ✓ Build complete");

  // ── Step 4: Start Containers (with port collision retry) ───────────────
  log(`\n[4/7] Starting containers...`);
  const isAutoPort = portSelection.source !== "explicit";
  let attempt = 0;

  while (true) {
    attempt++;
    const upEnv = {
      WEB_PORT: String(currentWebPort),
      WEB_HOST_BIND: hostBind,
    };

    try {
      dockerClient.up(upEnv);
      log(`      ✓ Containers started (Web host port: ${currentWebPort})`);
      break;
    } catch (err) {
      const errMsg = err.message || String(err);
      const classification = classifyDockerError(errMsg);

      if (classification === "port_conflict" && isAutoPort && attempt < MAX_PORT_RETRIES) {
        log(`      ⚠ Port ${currentWebPort} collision detected by Docker daemon.`);
        const nextPort = await findFreePort(currentWebPort + 1, PORT_RANGE_END);
        if (!nextPort) {
          throw new DeploymentError("No more available ports in range for retry.");
        }
        currentWebPort = nextPort;
        log(`      Retrying startup with port ${currentWebPort} (attempt ${attempt + 1}/${MAX_PORT_RETRIES})...`);
        continue;
      }

      // Non-retryable error: dump logs of failing containers
      logError(`\n✖ Container startup failed. Dumping recent service logs:\n`);
      for (const svc of ["api", "redis", "worker", "web"]) {
        const svcLogs = dockerClient.logs(svc, 50);
        if (svcLogs && !svcLogs.includes("(could not retrieve logs)")) {
          logError(`--- [${svc}] ---`);
          logError(svcLogs.trim());
        }
      }
      throw new DeploymentError(`Failed to start containers: ${errMsg}`);
    }
  }

  // ── Step 5: Wait for Service Health ────────────────────────────────────
  log("\n[5/7] Waiting for services to become healthy...");

  process.stdout.write("      Redis   ");
  const redisOk = await waitForService(dockerClient, "redis", 180_000);
  log(redisOk ? "✓ healthy" : "✖ unhealthy");
  if (!redisOk) {
    dumpLogsAndFail(dockerClient, "redis", "Redis failed to become healthy");
  }

  process.stdout.write("      API     ");
  const apiOk = await waitForService(dockerClient, "api", 180_000);
  log(apiOk ? "✓ healthy" : "✖ unhealthy");
  if (!apiOk) {
    dumpLogsAndFail(dockerClient, "api", "API failed to become healthy");
  }

  process.stdout.write("      Worker  ");
  const workerOk = await waitForService(dockerClient, "worker", 60_000);
  log(workerOk ? "✓ running" : "✖ not running");
  if (!workerOk) {
    dumpLogsAndFail(dockerClient, "worker", "Worker failed to start");
  }

  process.stdout.write("      Web     ");
  const webOk = await waitForService(dockerClient, "web", 180_000);
  log(webOk ? "✓ healthy" : "✖ unhealthy");
  if (!webOk) {
    dumpLogsAndFail(dockerClient, "web", "Web reverse proxy failed to become healthy");
  }

  // ── Step 6: Verify Actual Port & Endpoints ─────────────────────────────
  log("\n[6/7] Verifying Web reverse proxy and API routing...");

  // Query Docker for the real published port
  const publishedPortRaw = dockerClient.port("web", 80, { WEB_PORT: String(currentWebPort), WEB_HOST_BIND: hostBind });
  const actualPort = parseDockerPublishedPort(publishedPortRaw) || currentWebPort;

  const baseUrl = `http://127.0.0.1:${actualPort}`;
  const verifyResult = await verifyCriticalEndpoints(baseUrl, { timeoutMs: 25_000 });

  if (!verifyResult.webOk) {
    dumpLogsAndFail(dockerClient, "web", `HTTP GET ${baseUrl}/ failed.`);
  }
  log(`      ✓ ${baseUrl}/ (Web Frontend OK)`);

  if (!verifyResult.healthOk || !verifyResult.readyOk) {
    dumpLogsAndFail(dockerClient, "api", `API critical verification failed: /health=${verifyResult.healthOk}, /ready=${verifyResult.readyOk}`);
  }
  log(`      ✓ ${baseUrl}/api/v2/health (API Health OK)`);
  log(`      ✓ ${baseUrl}/api/v2/ready (API Ready OK)`);

  // ── Step 7: ComfyUI Check, Save State & Banner ─────────────────────────
  log("\n[7/7] Finalizing deployment state...");

  // ComfyUI configuration source of truth: SQLite runtime settings
  // (persisted by the V2 Settings page), with env vars as bootstrap fallback.
  const runtimeComfy = await fetchRuntimeComfyConfig(baseUrl);
  let comfyResult = null;
  if (runtimeComfy.runtimeAvailable) {
    const comfyUrl = runtimeComfy.baseUrl || dotEnv.COMFYUI_BASE_URL || dotEnv.V2_IMAGE_BASE_URL;
    comfyResult = await checkComfyUiHealth(comfyUrl);
  } else {
    const comfyUrl = dotEnv.COMFYUI_BASE_URL || dotEnv.V2_IMAGE_BASE_URL;
    comfyResult = await checkComfyUiHealth(comfyUrl);
    comfyResult = {
      ...comfyResult,
      message: `${comfyResult.message} (Runtime config unavailable)`,
    };
  }
  const lanAddrs = getLanAddresses({ envType });

  saveDeployState(DEPLOY_STATE_FILE, {
    environment: envType,
    mode,
    webPort: actualPort,
    hostBind,
    deployedAt: new Date().toISOString(),
  });

  const banner = formatDeploymentBanner({
    envType,
    mode,
    webPort: actualPort,
    hostBind,
    lanAddrs,
    comfyResult,
  });

  log(banner);
}

function dumpLogsAndFail(dockerClient, service, errorMessage) {
  logError(`\n✖ ${errorMessage}. Recent logs from ${service}:\n`);
  const logs = dockerClient.logs(service, 80);
  logError(logs);
  throw new DeploymentError(errorMessage);
}

main().catch((err) => {
  logError(`\n✖ Deployment failed: ${err.message}`);
  process.exitCode = 1;
});
