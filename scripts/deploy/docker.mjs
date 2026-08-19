import { execFileSync } from "node:child_process";

/**
 * Factory to create a unified cross-platform Docker Compose client.
 */
export function createDockerClient({
  rootDir,
  composeFile = "infra/compose/docker-compose.yml",
  execRunner = execFileSync,
} = {}) {
  const defaultComposeArgs = ["compose", "-f", composeFile];

  function runCompose(args, extraEnv = {}, options = {}) {
    const fullArgs = [...defaultComposeArgs, ...args];
    const env = {
      ...process.env,
      ...extraEnv,
    };
    return execRunner("docker", fullArgs, {
      cwd: rootDir,
      encoding: "utf8",
      env,
      stdio: "pipe",
      ...options,
    });
  }

  function runComposeInteractive(args, extraEnv = {}, options = {}) {
    const fullArgs = [...defaultComposeArgs, ...args];
    const env = {
      ...process.env,
      ...extraEnv,
    };
    return execRunner("docker", fullArgs, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      ...options,
    });
  }

  return {
    compose: (args, extraEnv, opts) => runCompose(args, extraEnv, opts),
    composeInteractive: (args, extraEnv, opts) => runComposeInteractive(args, extraEnv, opts),

    build: (extraEnv) => runComposeInteractive(["build"], extraEnv),
    up: (extraEnv) => runComposeInteractive(["up", "-d", "--remove-orphans"], extraEnv),
    down: (extraEnv) => runComposeInteractive(["down"], extraEnv),

    ps: (service = "", extraEnv = {}) => {
      try {
        const args = ["ps", "--format", "json"];
        if (service) args.push(service);
        return runCompose(args, extraEnv).trim();
      } catch {
        return "";
      }
    },

    port: (service = "web", containerPort = 80, extraEnv = {}) => {
      try {
        return runCompose(["port", service, String(containerPort)], extraEnv).trim();
      } catch {
        return "";
      }
    },

    logs: (service, tail = 80, extraEnv = {}) => {
      try {
        const args = ["logs", `--tail=${tail}`];
        if (service) args.push(service);
        return runCompose(args, extraEnv);
      } catch (err) {
        return err.stdout ? String(err.stdout) : "(could not retrieve logs)";
      }
    },
  };
}
