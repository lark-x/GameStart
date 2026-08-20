#!/usr/bin/env node
/**
 * deploy-doctor.mjs — GameStart deployment pre-flight diagnostics without deploying.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { detectEnvironment } from "./deploy/environment.mjs";
import { getLanAddresses } from "./deploy/network.mjs";
import { findFreePort, PORT_RANGE_START, PORT_RANGE_END } from "./deploy/port.mjs";
import { loadDotEnv, loadDeployState } from "./deploy/state.mjs";
import { checkComfyUiHealth, fetchRuntimeComfyConfig } from "./deploy/health.mjs";
import { formatDoctorReport } from "./deploy/output.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ENV_FILE = resolve(ROOT, ".env");

async function runDoctor() {
  const envType = detectEnvironment();

  // 1. Docker checks
  let dockerCliOk = false;
  let dockerDaemonOk = false;
  let composeOk = false;

  try {
    execFileSync("docker", ["--version"], { stdio: "ignore" });
    dockerCliOk = true;
  } catch {}

  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    dockerDaemonOk = true;
  } catch {}

  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    composeOk = true;
  } catch {}

  // 2. Port check
  const samplePort = await findFreePort(PORT_RANGE_START, PORT_RANGE_END);
  const freePortAvailable = samplePort !== null;

  // 3. Network & LAN check
  const lanAddrs = getLanAddresses({ envType });

  // 4. Config & ComfyUI check
  const envFileExists = existsSync(ENV_FILE);
  const dotEnv = loadDotEnv(ENV_FILE);
  let comfyResult = null;

  // Prefer the runtime configuration from a running API (SQLite settings),
  // then fall back to environment variables, then report unavailable.
  const lastState = loadDeployState(resolve(ROOT, ".data", "deployment.json"));
  const runtimePort = lastState?.webPort ?? 18000;
  const runtime = await fetchRuntimeComfyConfig(`http://127.0.0.1:${runtimePort}`);
  if (runtime.runtimeAvailable) {
    const comfyUrl = runtime.baseUrl || dotEnv.COMFYUI_BASE_URL || dotEnv.V2_IMAGE_BASE_URL;
    comfyResult = await checkComfyUiHealth(comfyUrl);
    if (!runtime.baseUrl && comfyUrl) {
      comfyResult = {
        ...comfyResult,
        message: `${comfyResult.message} (from env fallback)`,
      };
    }
  } else if (dotEnv.COMFYUI_BASE_URL || dotEnv.V2_IMAGE_BASE_URL) {
    const comfyUrl = dotEnv.COMFYUI_BASE_URL || dotEnv.V2_IMAGE_BASE_URL;
    comfyResult = await checkComfyUiHealth(comfyUrl);
  } else {
    comfyResult = { configured: false, reachable: false, message: "Runtime configuration unavailable" };
  }

  const report = formatDoctorReport({
    envType,
    dockerCliOk,
    dockerDaemonOk,
    composeOk,
    freePortAvailable,
    samplePort,
    lanAddrs,
    envFileExists,
    comfyResult,
  });

  process.stdout.write(report);

  const ready = dockerCliOk && dockerDaemonOk && composeOk && freePortAvailable;
  if (!ready) {
    process.exitCode = 1;
  }
}

runDoctor().catch((err) => {
  console.error("Doctor error:", err);
  process.exitCode = 1;
});
