#!/usr/bin/env node
/**
 * deploy.mjs — GameStart one-command Docker deployment.
 *
 * Usage:
 *   node scripts/deploy.mjs [--port <port>] [--mode local|lan]
 *
 * Container-internal ports are fixed (Web:80, API:3003, Redis:6379).
 * Only Web is published to the host; its port is selected automatically
 * unless explicitly provided via CLI or WEB_PORT env var.
 */

import { execSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMPOSE_FILE = "infra/compose/docker-compose.yml";
const DATA_DIR = resolve(ROOT, ".data");
const DEPLOY_STATE_FILE = resolve(DATA_DIR, "deployment.json");
const DEPLOY_LOCK_FILE = resolve(DATA_DIR, "deploy.lock");
const PORT_RANGE_START = 18000;
const PORT_RANGE_END = 18999;
const MAX_PORT_RETRIES = 5;
const HEALTH_TIMEOUT_MS = 180_000;
const HEALTH_POLL_MS = 3_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(msg + "\n");
}

function logError(msg) {
  process.stderr.write(msg + "\n");
}

function die(msg) {
  logError(`\n✖ ${msg}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (err) {
    if (!opts.allowFail) throw err;
    return err.stdout?.trim?.() ?? "";
  }
}

function runInteractive(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

/** Check whether a TCP port is available on the host. */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Find the first available port in [start, end]. */
async function findFreePort(start, end) {
  for (let port = start; port <= end; port++) {
    if (await isPortAvailable(port)) return port;
  }
  return null;
}

/** Load .env file into a plain object (no shell expansion). */
function loadDotEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const result = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return result;
}

/** Save deployment state for future reuse. */
function saveDeployState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DEPLOY_STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

/** Load previous deployment state. */
function loadDeployState() {
  if (!existsSync(DEPLOY_STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(DEPLOY_STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** Acquire a deployment lock (stale after 10 min). Returns a release function. */
function acquireLock() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(DEPLOY_LOCK_FILE)) {
    try {
      const age = Date.now() - statSync(DEPLOY_LOCK_FILE).mtimeMs;
      if (age < 10 * 60 * 1000) {
        die("Another deployment is already running. If this is stale, delete .data/deploy.lock and retry.");
      }
      // Stale lock — remove and continue.
      unlinkSync(DEPLOY_LOCK_FILE);
    } catch {
      die("Cannot read deployment lock file.");
    }
  }
  writeFileSync(DEPLOY_LOCK_FILE, String(process.pid));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try { unlinkSync(DEPLOY_LOCK_FILE); } catch {}
  };
}

/** Resolve LAN IPv4 addresses (non-loopback, non-Docker). */
function getLanAddresses() {
  const ifaces = networkInterfaces();
  const results = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("172.") && parseInt(a.address.split(".")[1], 10) >= 17 && parseInt(a.address.split(".")[1], 10) <= 31) continue;
      results.push({ name, address: a.address });
    }
  }
  return results;
}

/** Wait until a URL responds with HTTP 2xx. */
async function waitForHttp(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // service not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

/** Wait until a Docker service is healthy. */
async function waitForService(service, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = run(`docker compose -f ${COMPOSE_FILE} ps --format json ${service}`, { allowFail: true });
    if (state) {
      try {
        const parsed = JSON.parse(state);
        const health = parsed.Health ?? parsed.State ?? "";
        if (/healthy/i.test(health) || (/running/i.test(health) && service === "worker")) {
          return true;
        }
      } catch {
        // multiline or array output
        if (/healthy/i.test(state) || (/running/i.test(state) && service === "worker")) return true;
      }
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    } else if (args[i] === "--mode" && args[i + 1]) {
      result.mode = args[++i];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const dotEnv = loadDotEnv();
  const releaseLock = acquireLock();
  try {
    await deploy(args, dotEnv);
  } finally {
    releaseLock();
  }
}

async function deploy(args, dotEnv) {

  // ── Step 1: Check Docker ──────────────────────────────────────────────
  log("\n[1/7] Checking Docker...");
  try {
    run("docker --version");
  } catch {
    die("Docker is not installed or not in PATH.");
  }
  try {
    run("docker info", { stdio: "pipe" });
  } catch {
    die("Docker daemon is not running.");
  }
  try {
    run("docker compose version");
  } catch {
    die("docker compose is not available.");
  }
  log("      ✓ Docker ready");

  // ── Step 2: Select port ───────────────────────────────────────────────
  log("\n[2/7] Selecting port...");
  let webPort;
  const explicitPort = args.port || parseInt(dotEnv.WEB_PORT, 10);

  if (explicitPort) {
    // Explicit port — fail hard if occupied.
    if (!(await isPortAvailable(explicitPort))) {
      die(`Port ${explicitPort} is already in use. Free it or choose another port.`);
    }
    webPort = explicitPort;
    log(`      Using explicit port ${webPort}`);
  } else {
    // Auto mode — try last-used port first, then scan range.
    const prevState = loadDeployState();
    if (prevState?.webPort && (await isPortAvailable(prevState.webPort))) {
      webPort = prevState.webPort;
      log(`      Reusing previous port ${webPort}`);
    } else {
      webPort = await findFreePort(PORT_RANGE_START, PORT_RANGE_END);
      if (!webPort) {
        die(`No free port found in range ${PORT_RANGE_START}-${PORT_RANGE_END}.`);
      }
      log(`      Auto-selected port ${webPort}`);
    }
  }

  // ── Step 3 & 4: Build & Start (with retry for auto port) ────────────
  const autoMode = !explicitPort;
  let attempt = 0;

  while (true) {
    attempt++;
    log(`\n[3/7] Building images...`);
    runInteractive(`WEB_PORT=${webPort} docker compose -f ${COMPOSE_FILE} build`);
    log("      ✓ Build complete");

    log(`\n[4/7] Starting containers (port ${webPort})...`);
    try {
      runInteractive(`WEB_PORT=${webPort} docker compose -f ${COMPOSE_FILE} up -d`);
      break; // success
    } catch (err) {
      if (!autoMode || attempt >= MAX_PORT_RETRIES) die(`docker compose up failed: ${err.message}`);
      log(`      Port ${webPort} conflict detected, retrying with next port...`);
      const nextPort = await findFreePort(webPort + 1, PORT_RANGE_END);
      if (!nextPort) die("No more free ports available for retry.");
      webPort = nextPort;
      log(`      Retrying with port ${webPort}`);
    }
  }

  // ── Step 5: Wait for services ─────────────────────────────────────────
  log("\n[5/7] Waiting for services...");

  process.stdout.write("      Redis   ");
  const redisOk = await waitForService("redis", HEALTH_TIMEOUT_MS);
  log(redisOk ? "✓ healthy" : "✖ unhealthy");
  if (!redisOk) dumpLogsAndDie("Redis", "redis");

  process.stdout.write("      API     ");
  const apiOk = await waitForService("api", HEALTH_TIMEOUT_MS);
  log(apiOk ? "✓ healthy" : "✖ unhealthy");
  if (!apiOk) dumpLogsAndDie("API", "api");

  process.stdout.write("      Worker  ");
  const workerOk = await waitForService("worker", 60_000);
  log(workerOk ? "✓ running" : "✖ not running");
  if (!workerOk) dumpLogsAndDie("Worker", "worker");

  process.stdout.write("      Web     ");
  const webOk = await waitForService("web", HEALTH_TIMEOUT_MS);
  log(webOk ? "✓ healthy" : "✖ unhealthy");
  if (!webOk) dumpLogsAndDie("Web", "web");

  // ── Step 6: Verify HTTP through Nginx ─────────────────────────────────
  log("\n[6/7] Verifying HTTP...");

  // Query Docker for the actual published port (in case it differs from env).
  let actualPort = webPort;
  try {
    const portOutput = run(`docker compose -f ${COMPOSE_FILE} port web 80`);
    const match = portOutput.match(/:(\d+)$/);
    if (match) actualPort = parseInt(match[1], 10);
  } catch {
    // fallback to env port
  }

  const baseUrl = `http://127.0.0.1:${actualPort}`;
  const httpOk = await waitForHttp(`${baseUrl}/`, 30_000, "Web");
  if (!httpOk) die(`HTTP GET ${baseUrl}/ failed.`);
  log(`      ✓ ${baseUrl}/`);

  const healthOk = await waitForHttp(`${baseUrl}/api/v2/health`, 15_000, "Health");
  log(healthOk ? `      ✓ ${baseUrl}/api/v2/health` : `      ✖ ${baseUrl}/api/v2/health (non-critical)`);

  const readyOk = await waitForHttp(`${baseUrl}/api/v2/ready`, 15_000, "Ready");
  log(readyOk ? `      ✓ ${baseUrl}/api/v2/ready` : `      ✖ ${baseUrl}/api/v2/ready (non-critical)`);

  // ── Step 7: Save state & print result ─────────────────────────────────
  const mode = args.mode || (dotEnv.WEB_HOST_BIND === "127.0.0.1" ? "local" : "lan");
  const lanAddrs = getLanAddresses();

  saveDeployState({
    webPort: actualPort,
    mode,
    deployedAt: new Date().toISOString(),
  });

  log("\n[7/7] Deployment complete\n");
  log("────────────────────────────────────────");
  log(" GameStart Deployment");
  log("────────────────────────────────────────");
  log("");
  log("Status");
  log("");
  log("  ✓ Redis     healthy");
  log("  ✓ API       healthy");
  log("  ✓ Worker    running");
  log("  ✓ Web       healthy");
  log("");
  log("Access");
  log("");
  log(`  Local    ${baseUrl}`);
  if (lanAddrs.length > 0) {
    for (const { address } of lanAddrs) {
      log(`  LAN      http://${address}:${actualPort}`);
    }
  }
  log("");
  log(`  API      ${baseUrl}/api/v2`);
  log(`  Health   ${baseUrl}/api/v2/health`);
  log(`  Ready    ${baseUrl}/api/v2/ready`);
  log("");
  log("Internal (container-only)");
  log("");
  log("  Web      :80");
  log("  API      api:3003");
  log("  Redis    redis:6379");
  log("");
  log("────────────────────────────────────────");
  log(" Deployment completed successfully.");
  log("────────────────────────────────────────\n");
}

function dumpLogsAndDie(label, service) {
  logError(`\n${label} failed to become healthy. Recent logs:\n`);
  try {
    const logs = run(`docker compose -f ${COMPOSE_FILE} logs --tail=50 ${service}`);
    logError(logs);
  } catch {
    logError("(could not retrieve logs)");
  }
  die(`${label} deployment failed.`);
}

main().catch((err) => {
  logError(`\n✖ Deployment failed: ${err.message}`);
  process.exit(1);
});
