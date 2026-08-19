import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { parseArgs, DeploymentError } from "./deploy/cli.mjs";
import { detectEnvironment, isWsl, formatEnvironmentLabel, checkDockerPrerequisites } from "./deploy/environment.mjs";
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
import { acquireDeployLock, readLockFile, isPidAlive } from "./deploy/lock.mjs";
import { loadDotEnv, loadDeployState, saveDeployState } from "./deploy/state.mjs";
import { checkComfyUiHealth, verifyCriticalEndpoints } from "./deploy/health.mjs";
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

  // 4. Auto scan
  const r3 = await selectWebPort({ lastStatePort: 18000, isAvailable: fakeIsAvailable, findFree: fakeFindFree });
  assert.equal(r3.port, 18002);
  assert.equal(r3.source, "auto");
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
