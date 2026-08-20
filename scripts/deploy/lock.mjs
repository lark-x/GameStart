import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DeploymentError } from "./cli.mjs";

const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check whether a process with the given PID is currently active.
 * EPERM means the process exists (alive) but is not signalable.
 */
export function isPidAlive(pid) {
  if (typeof pid !== "number" || isNaN(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we don't have permission to signal it
    return err.code === "EPERM";
  }
}

/**
 * Categorize a PID's lifecycle status.
 * Returns "alive" (confirmed running), "dead" (confirmed gone),
 * or "unknown" (cannot confirm; e.g. no permission to signal).
 */
export function getPidStatus(pid) {
  if (typeof pid !== "number" || isNaN(pid) || pid <= 0) return "dead";
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (err) {
    if (err.code === "EPERM") return "unknown";
    return "dead";
  }
}

/**
 * Read lock file contents safely.
 */
export function readLockFile(lockPath) {
  if (!existsSync(lockPath)) return null;
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    if (!raw) return null;
    if (raw.startsWith("{")) {
      return JSON.parse(raw);
    }
    // Backward compatibility with raw PID string
    const pid = parseInt(raw, 10);
    const mtimeMs = statSync(lockPath).mtimeMs;
    return { pid, startedAt: new Date(mtimeMs).toISOString() };
  } catch {
    return null;
  }
}

/**
 * Acquire a deployment lock.
 * Returns a release function that safely cleans up the lock file.
 */
export function acquireDeployLock(lockPath, maxAgeMs = DEFAULT_STALE_LOCK_MS) {
  mkdirSync(dirname(lockPath), { recursive: true });

  const existing = readLockFile(lockPath);
  if (existing) {
    const pidStatus = getPidStatus(existing.pid);
    const startedTime = existing.startedAt ? new Date(existing.startedAt).getTime() : 0;
    const age = Date.now() - (startedTime || Date.now());

    if (pidStatus === "alive") {
      // A live PID always blocks a second deploy, regardless of lock age.
      // A long Docker build can legitimately hold the lock for > 10 minutes.
      throw new DeploymentError(
        `Another deployment is currently running (PID: ${existing.pid}, started at ${existing.startedAt}). ` +
        `If you are sure this is stale, remove "${lockPath}" and retry.`
      );
    }

    if (pidStatus === "unknown" && age < maxAgeMs) {
      // Cannot confirm the PID; only clear an old lock.
      throw new DeploymentError(
        `Another deployment may still be running (PID: ${existing.pid}, started at ${existing.startedAt}). ` +
        `If you are sure this is stale, remove "${lockPath}" and retry.`
      );
    }

    // PID is dead (or unconfirmable but old) — clear the stale lock safely.
    try {
      unlinkSync(lockPath);
    } catch {}
  }

  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  writeFileSync(lockPath, JSON.stringify(payload, null, 2) + "\n");

  let released = false;
  return function release() {
    if (released) return;
    released = true;
    try {
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
      }
    } catch {}
  };
}
