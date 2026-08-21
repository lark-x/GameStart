import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { parseArgs, DeploymentError } from "./deploy/cli.mjs";
import { detectEnvironment, isWsl, formatEnvironmentLabel, checkDockerPrerequisites, resolveDeployMode } from "./deploy/environment.mjs";
import { resolveHostBind, getStandardLanAddresses, getWslWindowsLanAddresses, getLanAddresses } from "./deploy/network.mjs";
import {
  selectWebPort,
  parseDockerPublishedPort,
  classifyDockerError,
  PORT_RANGE_START,
  PORT_RANGE_END,
  MAX_PORT_RETRIES,
} from "./deploy/port.mjs";
import { createDockerClient } from "./deploy/docker.mjs";
import { acquireDeployLock, readLockFile, isPidAlive, getPidStatus } from "./deploy/lock.mjs";
import { loadDotEnv, loadDeployState, saveDeployState, ensureDotEnv, ensureSecretKey } from "./deploy/state.mjs";
import { checkComfyUiHealth, verifyCriticalEndpoints, parseServiceHealth } from "./deploy/health.mjs";
import { formatDeploymentBanner, formatDoctorReport } from "./deploy/output.mjs";

const tmpRoot = resolve(import.meta.dirname, "..", ".tmp", "deploy-test");

test.beforeEach(() => {
  mkdirSync(tmpRoot, { recursive: true });
});

test.after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. CLI Parsing
// ---------------------------------------------------------------------------

test("CLI argument parser supports --port, --mode, and --help", () => {
  const parsed1 = parseArgs(["--port", "18050", "--mode", "lan"]);
  assert.equal(parsed1.port, 18050);
  assert.equal(parsed1.mode, "lan");
  assert.equal(parsed1.help, false);

  const parsed2 = parseArgs(["--port=18080", "--mode=local"]);
  assert.equal(parsed2.port, 18080);
  assert.equal(parsed2.mode, "local");

  const parsedHelp = parseArgs(["--help"]);
  assert.equal(parsedHelp.help, true);
});

test("CLI argument parser rejects invalid port and mode", () => {
  assert.throws(() => parseArgs(["--port", "not-a-port"]), DeploymentError);
  assert.throws(() => parseArgs(["--port", "70000"]), DeploymentError);
  assert.throws(() => parseArgs(["--mode", "invalid-mode"]), DeploymentError);
});

// ---------------------------------------------------------------------------
// 1b. Deploy Mode Resolution (P0-1: default local)
// ---------------------------------------------------------------------------

test("deploy mode defaults to local when nothing is configured", () => {
  assert.equal(resolveDeployMode({}), "local");
  assert.equal(resolveDeployMode({ webHostBind: undefined }), "local");
  assert.equal(resolveDeployMode({ webHostBind: "" }), "local");
});

test("deploy mode honors explicit WEB_HOST_BIND values", () => {
  assert.equal(resolveDeployMode({ webHostBind: "127.0.0.1" }), "local");
  assert.equal(resolveDeployMode({ webHostBind: "0.0.0.0" }), "lan");
});

test("deploy mode prefers CLI mode over env binding", () => {
  assert.equal(resolveDeployMode({ cliMode: "local", webHostBind: "0.0.0.0" }), "local");
  assert.equal(resolveDeployMode({ cliMode: "lan", webHostBind: "127.0.0.1" }), "lan");
  assert.equal(resolveDeployMode({ cliMode: "lan" }), "lan");
});

// ---------------------------------------------------------------------------
// 2. Environment Detection
// ---------------------------------------------------------------------------

test("Environment detection identifies macOS, Windows, WSL, and Linux", () => {
  assert.equal(detectEnvironment({ platform: "darwin", release: "23.0.0" }), "macos-docker-desktop");
  assert.equal(detectEnvironment({ platform: "win32", release: "10.0.19045" }), "windows-docker-desktop");
  assert.equal(detectEnvironment({ platform: "linux", release: "5.15.153.1-microsoft-standard-WSL2" }), "wsl-docker-desktop");
  assert.equal(detectEnvironment({ platform: "linux", release: "6.5.0-generic" }), "linux-docker");
  assert.equal(detectEnvironment({ platform: "freebsd", release: "14.0" }), "unknown");

  assert.equal(isWsl("linux", "5.15.90.1-microsoft-standard-WSL2"), true);
  assert.equal(isWsl("linux", "6.1.0-generic"), false);
  assert.equal(isWsl("darwin", "23.0.0"), false);
});

test("formatEnvironmentLabel returns human readable names", () => {
  assert.match(formatEnvironmentLabel("macos-docker-desktop"), /macOS/);
  assert.match(formatEnvironmentLabel("windows-docker-desktop"), /Windows/);
  assert.match(formatEnvironmentLabel("wsl-docker-desktop"), /WSL2/);
  assert.match(formatEnvironmentLabel("linux-docker"), /Linux/);
});

test("checkDockerPrerequisites verifies CLI and daemon", () => {
  const calls = [];
  const fakeRunner = (cmd) => {
    calls.push(cmd.join(" "));
  };
  checkDockerPrerequisites(fakeRunner);
  assert.equal(calls.length, 3);
  assert.equal(calls[0], "docker --version");
  assert.equal(calls[1], "docker info");
  assert.equal(calls[2], "docker compose version");
});

// ---------------------------------------------------------------------------
// 3. Network & LAN Address Resolution
// ---------------------------------------------------------------------------

test("resolveHostBind maps mode to IP", () => {
  assert.equal(resolveHostBind("local"), "127.0.0.1");
  assert.equal(resolveHostBind("lan"), "0.0.0.0");
  assert.equal(resolveHostBind(undefined), "127.0.0.1");
});

test("getStandardLanAddresses filters loopback and docker bridge subnets", () => {
  const fakeInterfaces = {
    lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    en0: [{ family: "IPv4", internal: false, address: "192.168.1.105" }],
    docker0: [{ family: "IPv4", internal: false, address: "172.17.0.1" }],
    br_custom: [{ family: "IPv4", internal: false, address: "172.20.0.1" }],
    eth0: [{ family: "IPv4", internal: false, address: "10.0.0.45" }],
  };
  const addrs = getStandardLanAddresses(fakeInterfaces);
  assert.deepEqual(addrs, [
    { name: "en0", address: "192.168.1.105" },
    { name: "eth0", address: "10.0.0.45" },
  ]);
});

test("getWslWindowsLanAddresses parses powershell output", () => {
  const fakeExec = (cmd, args) => {
    return "192.168.1.55\r\n10.10.0.2\r\n";
  };
  const addrs = getWslWindowsLanAddresses(fakeExec);
  assert.deepEqual(addrs, [
    { name: "Windows Host", address: "192.168.1.55" },
    { name: "Windows Host", address: "10.10.0.2" },
  ]);
});

// ---------------------------------------------------------------------------
// 4. Port Selection & Conflict Classification
// ---------------------------------------------------------------------------

test("selectWebPort handles explicit, reused, and auto ports", async () => {
  const freeMap = new Map([
    [18000, false],
    [18001, false],
    [18002, true],
    [18042, true],
    [19999, false],
  ]);

  const fakeIsAvailable = async (port) => freeMap.get(port) ?? true;
  const fakeFindFree = async (start, end) => 18002;

  // 1. Explicit port available
  const r1 = await selectWebPort({ explicitPort: 18042, isAvailable: fakeIsAvailable });
  assert.equal(r1.port, 18042);
  assert.equal(r1.source, "explicit");

  // 2. Explicit port unavailable throws DeploymentError
  await assert.rejects(
    async () => selectWebPort({ explicitPort: 18000, isAvailable: fakeIsAvailable }),
    DeploymentError,
  );

  // 3. Reused previous port
  const r2 = await selectWebPort({ lastStatePort: 18042, isAvailable: fakeIsAvailable, findFree: fakeFindFree });
  assert.equal(r2.port, 18042);
  assert.equal(r2.source, "reused");

  // 4. Stable previous ports fail loudly when another process owns them
  await assert.rejects(
    async () => selectWebPort({ lastStatePort: 18000, isAvailable: fakeIsAvailable, findFree: fakeFindFree }),
    DeploymentError,
  );

  // 5. Auto scan when no previous deployment exists
  const r3 = await selectWebPort({ isAvailable: fakeIsAvailable, findFree: fakeFindFree });
  assert.equal(r3.port, 18002);
  assert.equal(r3.source, "auto");
});

test("selectWebPort reuses the current GameStart deployment port even while the old web container is listening", async () => {
  const fakeIsAvailable = async (port) => port !== 18000;
  const fakeFindFree = async () => 18001;

  const explicit = await selectWebPort({
    explicitPort: 18000,
    currentDeploymentPort: 18000,
    isAvailable: fakeIsAvailable,
    findFree: fakeFindFree,
  });
  assert.equal(explicit.port, 18000);
  assert.equal(explicit.source, "explicit");
  assert.equal(explicit.occupiedByCurrentDeployment, true);

  const reused = await selectWebPort({
    lastStatePort: 18000,
    currentDeploymentPort: 18000,
    isAvailable: fakeIsAvailable,
    findFree: fakeFindFree,
  });
  assert.equal(reused.port, 18000);
  assert.equal(reused.source, "reused");
  assert.equal(reused.occupiedByCurrentDeployment, true);

  const current = await selectWebPort({
    currentDeploymentPort: 18000,
    isAvailable: fakeIsAvailable,
    findFree: fakeFindFree,
  });
  assert.equal(current.port, 18000);
  assert.equal(current.source, "current");
  assert.equal(current.occupiedByCurrentDeployment, true);
});

test("parseDockerPublishedPort extracts host port number", () => {
  assert.equal(parseDockerPublishedPort("0.0.0.0:18003"), 18003);
  assert.equal(parseDockerPublishedPort("127.0.0.1:18042\n"), 18042);
  assert.equal(parseDockerPublishedPort(":::18005"), 18005);
  assert.equal(parseDockerPublishedPort(""), null);
  assert.equal(parseDockerPublishedPort(null), null);
});

test("classifyDockerError differentiates port bind conflicts from other errors", () => {
  assert.equal(classifyDockerError("Error: Bind for 0.0.0.0:18003 failed: port is already allocated"), "port_conflict");
  assert.equal(classifyDockerError("listen tcp 127.0.0.1:18003: bind: address already in use"), "port_conflict");
  assert.equal(classifyDockerError("Ports are not available: exposing port TCP 0.0.0.0:18000"), "port_conflict");
  assert.equal(classifyDockerError("permission denied while trying to connect to Docker daemon"), "general_failure");
  assert.equal(classifyDockerError("no space left on device"), "general_failure");
});

// ---------------------------------------------------------------------------
// 5. Deployment Lock Management
// ---------------------------------------------------------------------------

test("acquireDeployLock creates lock and safely cleans up in release()", () => {
  const lockFile = resolve(tmpRoot, "lock-1", "deploy.lock");
  const release = acquireDeployLock(lockFile);

  assert.ok(existsSync(lockFile));
  const data = readLockFile(lockFile);
  assert.equal(data.pid, process.pid);

  release();
  assert.ok(!existsSync(lockFile));
});

test("acquireDeployLock cleans up dead PID lock automatically", () => {
  const lockFile = resolve(tmpRoot, "lock-dead", "deploy.lock");
  mkdirSync(resolve(tmpRoot, "lock-dead"), { recursive: true });

  // 99999999 is an unused PID that is not alive
  writeFileSync(lockFile, JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }));
  assert.equal(isPidAlive(99999999), false);

  const release = acquireDeployLock(lockFile);
  assert.ok(existsSync(lockFile));
  const fresh = readLockFile(lockFile);
  assert.equal(fresh.pid, process.pid);

  release();
});

test("acquireDeployLock blocks if active process holds recent lock", () => {
  const lockFile = resolve(tmpRoot, "lock-active", "deploy.lock");
  mkdirSync(resolve(tmpRoot, "lock-active"), { recursive: true });

  // Use current process PID which is alive
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));

  assert.throws(() => acquireDeployLock(lockFile, 60000), DeploymentError);
});

test("getPidStatus categorizes alive, dead, and invalid PIDs", () => {
  assert.equal(getPidStatus(process.pid), "alive");
  assert.equal(getPidStatus(99999999), "dead");
  assert.equal(getPidStatus(0), "dead");
  assert.equal(getPidStatus(NaN), "dead");
});

test("acquireDeployLock blocks an alive PID even when lock is old", () => {
  const lockFile = resolve(tmpRoot, "lock-alive-old", "deploy.lock");
  mkdirSync(resolve(tmpRoot, "lock-alive-old"), { recursive: true });

  // Current process PID is alive; startedAt is > 10 minutes ago
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: old }));

  assert.throws(() => acquireDeployLock(lockFile, 10 * 60 * 1000), DeploymentError);
});

test("acquireDeployLock clears a dead PID lock regardless of age", () => {
  const lockFile = resolve(tmpRoot, "lock-dead-old", "deploy.lock");
  mkdirSync(resolve(tmpRoot, "lock-dead-old"), { recursive: true });

  // Dead PID, recent timestamp
  writeFileSync(lockFile, JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() }));
  const release = acquireDeployLock(lockFile);
  assert.equal(readLockFile(lockFile).pid, process.pid);
  release();
});

test("release does not remove a newer owner's lock", () => {
  const lockFile = resolve(tmpRoot, "lock-replaced", "deploy.lock");
  const release = acquireDeployLock(lockFile);
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, startedAt: "2099-01-01T00:00:00.000Z" }));

  release();

  assert.ok(existsSync(lockFile));
  rmSync(resolve(tmpRoot, "lock-replaced"), { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 6b. INTEGRATION_SECRET_KEY Auto Generation (P1-3)
// ---------------------------------------------------------------------------

test("ensureSecretKey generates a key when missing", () => {
  const envFile = resolve(tmpRoot, "secret-missing", ".env");
  mkdirSync(resolve(tmpRoot, "secret-missing"), { recursive: true });
  writeFileSync(envFile, "NODE_ENV=development\n\nINTEGRATION_SECRET_KEY=\n");

  const generated = ensureSecretKey(envFile);
  assert.equal(generated, true);

  const content = readFileSync(envFile, "utf8");
  const match = content.match(/^INTEGRATION_SECRET_KEY=(.+)$/m);
  assert.ok(match, "key line should exist");
  const decoded = Buffer.from(match[1], "base64");
  assert.equal(decoded.length, 32, "generated key must decode to 32 bytes");
});

test("ensureSecretKey does not overwrite an existing key", () => {
  const envFile = resolve(tmpRoot, "secret-existing", ".env");
  mkdirSync(resolve(tmpRoot, "secret-existing"), { recursive: true });
  const existing = Buffer.alloc(32, 7).toString("base64");
  writeFileSync(envFile, `INTEGRATION_SECRET_KEY=${existing}\n`);

  const generated = ensureSecretKey(envFile);
  assert.equal(generated, false);
  assert.match(readFileSync(envFile, "utf8"), new RegExp(`^INTEGRATION_SECRET_KEY=${existing}$`, "m"));
});

test("ensureSecretKey appends the variable when entirely absent", () => {
  const envFile = resolve(tmpRoot, "secret-absent", ".env");
  mkdirSync(resolve(tmpRoot, "secret-absent"), { recursive: true });
  writeFileSync(envFile, "NODE_ENV=development\n");

  const generated = ensureSecretKey(envFile);
  assert.equal(generated, true);

  const content = readFileSync(envFile, "utf8");
  assert.match(content, /^INTEGRATION_SECRET_KEY=.+$/m);
});

test("ensureSecretKey returns false when .env is missing", () => {
  assert.equal(ensureSecretKey(resolve(tmpRoot, "no-such-dir", ".env")), false);
});

// ---------------------------------------------------------------------------
// 6. Deployment State & DotEnv
// ---------------------------------------------------------------------------

test("saveDeployState and loadDeployState persist deployment records", () => {
  const stateFile = resolve(tmpRoot, "state", "deployment.json");
  const state = {
    environment: "macos-docker-desktop",
    mode: "lan",
    webPort: 18003,
    hostBind: "0.0.0.0",
  };

  saveDeployState(stateFile, state);
  const loaded = loadDeployState(stateFile);

  assert.equal(loaded.version, 1);
  assert.equal(loaded.environment, "macos-docker-desktop");
  assert.equal(loaded.webPort, 18003);
  assert.equal(loaded.mode, "lan");
  assert.ok(loaded.deployedAt);
});

test("loadDotEnv parses key-value pairs without shell execution", () => {
  const envFile = resolve(tmpRoot, "test.env");
  writeFileSync(
    envFile,
    `
# Comment
WEB_PORT=18055
WEB_HOST_BIND='127.0.0.1'
COMFYUI_BASE_URL="http://192.168.1.50:8188"
EMPTY_VAL=
`
  );

  const parsed = loadDotEnv(envFile);
  assert.equal(parsed.WEB_PORT, "18055");
  assert.equal(parsed.WEB_HOST_BIND, "127.0.0.1");
  assert.equal(parsed.COMFYUI_BASE_URL, "http://192.168.1.50:8188");
  assert.equal(parsed.EMPTY_VAL, "");
});

test("ensureDotEnv copies .env.example when .env is missing", () => {
  const exampleFile = resolve(tmpRoot, "env-example", ".env.example");
  const targetEnv = resolve(tmpRoot, "env-example", ".env");
  mkdirSync(resolve(tmpRoot, "env-example"), { recursive: true });
  writeFileSync(exampleFile, "V2_API_PORT=3003\n");

  const created = ensureDotEnv(targetEnv, exampleFile);
  assert.equal(created, true);
  assert.ok(existsSync(targetEnv));
  assert.equal(readFileSync(targetEnv, "utf8"), "V2_API_PORT=3003\n");

  // Second run does nothing
  const skipped = ensureDotEnv(targetEnv, exampleFile);
  assert.equal(skipped, false);
});

test("compose Dockerfile keeps application data writable without world-writable permissions", () => {
  const dockerfile = readFileSync(resolve(import.meta.dirname, "..", "infra", "compose", "Dockerfile"), "utf8");
  assert.match(dockerfile, /chown -R node:node \/app/);
  assert.match(dockerfile, /chmod -R 770 \/app\/data/);
  assert.doesNotMatch(dockerfile, /chmod -R 777 \/app\/data/);
});

// ---------------------------------------------------------------------------
// 7. Health & ComfyUI Diagnostics
// ---------------------------------------------------------------------------

test("checkComfyUiHealth distinguishes connection results", async () => {
  // 1. Success
  const fakeOkFetch = async () => ({ ok: true, status: 200 });
  const r1 = await checkComfyUiHealth("http://192.168.1.50:8188", { fetchFn: fakeOkFetch });
  assert.equal(r1.reachable, true);
  assert.equal(r1.configured, true);

  // 2. Connection Refused
  const fakeErrFetch = async () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:8188");
    throw err;
  };
  const r2 = await checkComfyUiHealth("http://127.0.0.1:8188", { fetchFn: fakeErrFetch });
  assert.equal(r2.reachable, false);
  assert.equal(r2.errorCategory, "CONNECTION_REFUSED");

  // 3. Timeout
  const fakeTimeoutFetch = async () => {
    const err = new Error("The operation was aborted due to timeout");
    throw err;
  };
  const r3 = await checkComfyUiHealth("http://192.168.1.50:8188", { fetchFn: fakeTimeoutFetch });
  assert.equal(r3.reachable, false);
  assert.equal(r3.errorCategory, "TIMEOUT");

  // 4. Not configured
  const r4 = await checkComfyUiHealth("");
  assert.equal(r4.configured, false);
  assert.equal(r4.reachable, false);
});

// ---------------------------------------------------------------------------
// 8. Output Formatting
// ---------------------------------------------------------------------------

test("formatDeploymentBanner prints local, LAN, API, and internal ports", () => {
  const banner = formatDeploymentBanner({
    envType: "macos-docker-desktop",
    mode: "lan",
    webPort: 18003,
    hostBind: "0.0.0.0",
    lanAddrs: [{ name: "en0", address: "192.168.1.20" }],
    comfyResult: { configured: true, reachable: true, endpoint: "http://192.168.1.50:8188", message: "OK" },
  });

  assert.match(banner, /GameStart Deployment/);
  assert.match(banner, /macOS \/ Docker Desktop/);
  assert.match(banner, /http:\/\/127\.0\.0\.1:18003/);
  assert.match(banner, /http:\/\/192\.168\.1\.20:18003/);
  assert.match(banner, /api:3003/);
  assert.match(banner, /redis:6379/);
  assert.match(banner, /http:\/\/192\.168\.1\.50:8188/);
});

test("formatDoctorReport structures pre-flight checklist", () => {
  const report = formatDoctorReport({
    envType: "wsl-docker-desktop",
    dockerCliOk: true,
    dockerDaemonOk: true,
    composeOk: true,
    freePortAvailable: true,
    samplePort: 18000,
    lanAddrs: [{ name: "Windows Host", address: "192.168.1.30" }],
    envFileExists: true,
  });

  assert.match(report, /GameStart Deployment Doctor/);
  assert.match(report, /WSL2 \/ Docker Desktop Integration/);
  assert.match(report, /Docker CLI reachable/);
  assert.match(report, /Windows Host IP: 192\.168\.1\.30/);
  assert.match(report, /Ready to deploy/);
});

// ---------------------------------------------------------------------------
// 9. Docker ps output parsing
// ---------------------------------------------------------------------------

test("parseServiceHealth accurately handles JSON array, object, and plain string outputs", () => {
  // 1. Array output from Docker Compose (Worker without healthcheck)
  const workerJsonArray = JSON.stringify([
    {
      ID: "abc12345",
      Name: "living-network-worker-1",
      Service: "worker",
      State: "running",
      Health: "",
      Status: "Up 15 seconds",
    },
  ]);
  const workerRes = parseServiceHealth(workerJsonArray, "worker");
  assert.equal(workerRes.ok, true);
  assert.match(workerRes.status, /running|Up 15 seconds/i);

  // 2. Single object output (API with healthy status)
  const apiJsonObject = JSON.stringify({
    Health: "healthy",
    State: "running",
    Status: "Up 20 seconds (healthy)",
  });
  const apiRes = parseServiceHealth(apiJsonObject, "api");
  assert.equal(apiRes.ok, true);
  assert.equal(apiRes.status, "healthy");

  // 3. Unhealthy object
  const unhealthJsonObject = JSON.stringify({
    Health: "unhealthy",
    State: "running",
    Status: "Up 20 seconds (unhealthy)",
  });
  const unhealthyRes = parseServiceHealth(unhealthJsonObject, "redis");
  assert.equal(unhealthyRes.ok, false);
  assert.equal(unhealthyRes.status, "unhealthy");

  // 4. Empty or not running
  const emptyRes = parseServiceHealth("", "worker");
  assert.equal(emptyRes.ok, false);
  assert.equal(emptyRes.status, "not running");

  // 5. Raw string fallback
  const rawRunning = parseServiceHealth("living-network-worker-1 Up 2 minutes", "worker");
  assert.equal(rawRunning.ok, true);
});
