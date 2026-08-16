#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, extname, join } from "node:path";

const separatorIndex = process.argv.indexOf("--", 2);

if (separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
  console.error("Usage: node scripts/run-with-env.mjs KEY=value [KEY=value ...] -- command [args ...]");
  process.exit(1);
}

const env = { ...process.env };
for (const assignment of process.argv.slice(2, separatorIndex)) {
  const equalsIndex = assignment.indexOf("=");
  if (equalsIndex <= 0) {
    console.error(`Invalid environment assignment: ${assignment}`);
    process.exit(1);
  }
  env[assignment.slice(0, equalsIndex)] = assignment.slice(equalsIndex + 1);
}

function resolveWindowsCommand(command, args) {
  if (process.platform !== "win32" || /[\\/]/.test(command) || extname(command) !== "") {
    return { command, args };
  }

  const extensions = [".EXE", ".COM", ".PS1", ".CMD", ".BAT"];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension.toLowerCase()}`);
      const alternateCandidate = join(directory, `${command}${extension.toUpperCase()}`);
      const resolved = existsSync(candidate) ? candidate : existsSync(alternateCandidate) ? alternateCandidate : undefined;
      if (resolved === undefined) continue;
      const resolvedExtension = extname(resolved).toLowerCase();
      if (resolvedExtension === ".ps1") {
        return {
          command: "powershell",
          args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved, ...args],
        };
      }
      if (resolvedExtension === ".cmd" || resolvedExtension === ".bat") {
        return {
          command: "cmd.exe",
          args: ["/d", "/s", "/c", [resolved, ...args].map(quoteCmdArg).join(" ")],
        };
      }
      return { command: resolved, args };
    }
  }
  return { command, args };
}

function quoteCmdArg(value) {
  if (!/[\s"&<>|^]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

const [rawCommand, ...rawArgs] = process.argv.slice(separatorIndex + 1);
const { command, args } = resolveWindowsCommand(rawCommand, rawArgs);
const child = spawn(command, args, {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Command terminated by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
