import { createServer } from "node:net";
import { DeploymentError } from "./cli.mjs";

export const PORT_RANGE_START = 18000;
export const PORT_RANGE_END = 18999;
export const MAX_PORT_RETRIES = 5;

function isValidPortNumber(port) {
  return port !== undefined && !isNaN(port) && port >= 1 && port <= 65535;
}

/**
 * Check whether a TCP port is available on the specified host.
 */
export function isPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

/**
 * Find the first available port in [start, end].
 */
export async function findFreePort(start = PORT_RANGE_START, end = PORT_RANGE_END, host = "127.0.0.1") {
  for (let port = start; port <= end; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  return null;
}

/**
 * Select the appropriate Web host port following the priority rule:
 * 1. Explicit port (CLI or .env) -> fail hard if in use.
 * 2. Last known successful port in deployment.json -> reuse if available.
 * 3. First free port in range [start, end].
 */
export async function selectWebPort({
  explicitPort = undefined,
  lastStatePort = undefined,
  currentDeploymentPort = undefined,
  start = PORT_RANGE_START,
  end = PORT_RANGE_END,
  host = "127.0.0.1",
  isAvailable = isPortAvailable,
  findFree = findFreePort,
} = {}) {
  const activePort = isValidPortNumber(currentDeploymentPort) ? currentDeploymentPort : undefined;
  const isCurrentDeploymentPort = (port) => activePort !== undefined && port === activePort;

  if (isValidPortNumber(explicitPort)) {
    const available = await isAvailable(explicitPort, host);
    if (available || isCurrentDeploymentPort(explicitPort)) {
      return { port: explicitPort, source: "explicit", occupiedByCurrentDeployment: !available };
    }
    throw new DeploymentError(`Port ${explicitPort} is already in use by another process. Free it or choose another port.`);
  }

  if (isValidPortNumber(lastStatePort)) {
    const available = await isAvailable(lastStatePort, host);
    if (available || isCurrentDeploymentPort(lastStatePort)) {
      return { port: lastStatePort, source: "reused", occupiedByCurrentDeployment: !available };
    }
    throw new DeploymentError(
      `Last deployment port ${lastStatePort} is already in use by another process. Stop that process or run pnpm deploy -- --port <port>.`,
    );
  }

  if (activePort !== undefined) {
    return { port: activePort, source: "current", occupiedByCurrentDeployment: true };
  }

  const freePort = await findFree(start, end, host);
  if (!freePort) {
    throw new DeploymentError(`No free port found in range ${start}-${end}.`);
  }

  return { port: freePort, source: "auto" };
}

/**
 * Parse the published port from docker compose port output.
 * Example output: "0.0.0.0:18003" or ":::18003" or "127.0.0.1:18003\n"
 */
export function parseDockerPublishedPort(output) {
  if (!output || typeof output !== "string") return null;
  const match = output.trim().match(/:(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Classify a Docker error message into "port_conflict" vs "general_failure".
 */
export function classifyDockerError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== "string") return "general_failure";
  const portConflictPattern = /address already in use|port is already allocated|bind for .* failed|ports are not available|port is already in use/i;
  if (portConflictPattern.test(errorMessage)) {
    return "port_conflict";
  }
  return "general_failure";
}
