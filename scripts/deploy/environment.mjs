import { release as osRelease } from "node:os";
import { DeploymentError } from "./cli.mjs";

/**
 * Check whether the current process is running inside Windows Subsystem for Linux (WSL).
 */
export function isWsl(platform = process.platform, release = osRelease()) {
  return platform === "linux" && /microsoft|wsl/i.test(release);
}

/**
 * Detect runtime deployment environment type.
 * Returns: 'macos-docker-desktop' | 'windows-docker-desktop' | 'wsl-docker-desktop' | 'linux-docker' | 'unknown'
 */
export function detectEnvironment({ platform = process.platform, release = osRelease() } = {}) {
  if (platform === "darwin") {
    return "macos-docker-desktop";
  }
  if (platform === "win32") {
    return "windows-docker-desktop";
  }
  if (isWsl(platform, release)) {
    return "wsl-docker-desktop";
  }
  if (platform === "linux") {
    return "linux-docker";
  }
  return "unknown";
}

/**
 * Format a human-readable environment label.
 */
export function formatEnvironmentLabel(envType) {
  switch (envType) {
    case "macos-docker-desktop":
      return "macOS / Docker Desktop";
    case "windows-docker-desktop":
      return "Windows / Docker Desktop (PowerShell)";
    case "wsl-docker-desktop":
      return "WSL2 / Docker Desktop Integration";
    case "linux-docker":
      return "Linux / Docker Engine";
    default:
      return "Unknown Environment";
  }
}

/**
 * Resolve the deployment mode.
 *
 * Explicit CLI mode always wins. Otherwise the mode is derived from
 * WEB_HOST_BIND: only an explicit 0.0.0.0 opts into LAN; missing/empty
 * values default to local (127.0.0.1) so a first deploy never
 * accidentally exposes the service to the LAN.
 */
export function resolveDeployMode({ cliMode, webHostBind } = {}) {
  if (cliMode === "local" || cliMode === "lan") return cliMode;
  return webHostBind === "0.0.0.0" ? "lan" : "local";
}

/**
 * Verify that Docker CLI, daemon, and Compose are accessible and running.
 */
export function checkDockerPrerequisites(runCommand) {
  try {
    runCommand(["docker", "--version"]);
  } catch {
    throw new DeploymentError("Docker is not installed or not in PATH.");
  }

  try {
    runCommand(["docker", "info"]);
  } catch {
    throw new DeploymentError("Docker daemon is not running. Please start Docker Desktop or the Docker daemon.");
  }

  try {
    runCommand(["docker", "compose", "version"]);
  } catch {
    throw new DeploymentError("docker compose is not available. Please verify your Docker installation.");
  }
}
