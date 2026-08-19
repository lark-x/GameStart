/**
 * CLI argument parser for deployment commands.
 */

export class DeploymentError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "DeploymentError";
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    port: undefined,
    mode: undefined,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port") {
      const val = argv[++i];
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        throw new DeploymentError(`Invalid port number: "${val}". Port must be between 1 and 65535.`);
      }
      result.port = parsed;
    } else if (arg.startsWith("--port=")) {
      const val = arg.slice("--port=".length);
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        throw new DeploymentError(`Invalid port number: "${val}". Port must be between 1 and 65535.`);
      }
      result.port = parsed;
    } else if (arg === "--mode") {
      const val = (argv[++i] || "").toLowerCase();
      if (val !== "local" && val !== "lan") {
        throw new DeploymentError(`Invalid mode: "${val}". Allowed modes are "local" or "lan".`);
      }
      result.mode = val;
    } else if (arg.startsWith("--mode=")) {
      const val = arg.slice("--mode=".length).toLowerCase();
      if (val !== "local" && val !== "lan") {
        throw new DeploymentError(`Invalid mode: "${val}". Allowed modes are "local" or "lan".`);
      }
      result.mode = val;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}
