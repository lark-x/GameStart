/**
 * Service health polling, critical endpoint verification, and ComfyUI diagnostics.
 */

const DEFAULT_POLL_MS = 2500;

/**
 * Parse Docker Compose ps output (JSON array, single JSON object, NDJSON, or plain text).
 */
export function parseServiceHealth(raw, service) {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, status: "not running" };
  }

  const trimmed = raw.trim();

  // Try parsing JSON formats
  try {
    let items = [];
    if (trimmed.startsWith("[")) {
      items = JSON.parse(trimmed);
    } else if (trimmed.startsWith("{")) {
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
      items = lines.map((l) => JSON.parse(l));
    }

    if (items.length > 0) {
      const item = items[0];
      const health = (item.Health || "").toLowerCase();
      const state = (item.State || "").toLowerCase();
      const statusStr = (item.Status || "").toLowerCase();

      const displayStatus = health || state || statusStr || "running";

      // Check unhealthy FIRST (because "unhealthy" includes the substring "healthy")
      if (health === "unhealthy" || statusStr.includes("unhealthy")) {
        return { ok: false, status: "unhealthy" };
      }
      if (health === "healthy" || (statusStr.includes("healthy") && !statusStr.includes("unhealthy"))) {
        return { ok: true, status: displayStatus };
      }
      // Worker has no custom healthcheck, so running / up state is healthy
      if (service === "worker" && (state === "running" || statusStr.includes("running") || statusStr.includes("up"))) {
        return { ok: true, status: displayStatus };
      }
      if (state === "running" || statusStr.includes("up")) {
        return { ok: true, status: displayStatus };
      }
      return { ok: false, status: displayStatus };
    }
  } catch {
    // Fallback to string matching
  }

  const isUnhealthy = /unhealthy/i.test(trimmed);
  const isHealthy = /healthy/i.test(trimmed) && !isUnhealthy;
  const isRunning = /running|up/i.test(trimmed);

  if (isUnhealthy) return { ok: false, status: "unhealthy" };
  if (isHealthy) return { ok: true, status: "healthy" };
  if (service === "worker" && isRunning) return { ok: true, status: "running" };
  if (isRunning) return { ok: true, status: "running" };

  return { ok: false, status: trimmed.slice(0, 30) };
}

export async function waitForService(
  dockerClient,
  service,
  timeoutMs = 180_000,
  pollIntervalMs = DEFAULT_POLL_MS,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = dockerClient.ps(service);
    const parsed = parseServiceHealth(raw, service);
    if (parsed.ok) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function waitForHttp(
  url,
  timeoutMs = 30_000,
  pollIntervalMs = 2_000,
  fetchFn = globalThis.fetch,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // service not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

export async function verifyCriticalEndpoints(
  baseUrl,
  { timeoutMs = 20_000, fetchFn = globalThis.fetch } = {},
) {
  const webOk = await waitForHttp(`${baseUrl}/`, timeoutMs, 1500, fetchFn);
  const healthOk = await waitForHttp(`${baseUrl}/api/v2/health`, timeoutMs, 1500, fetchFn);
  const readyOk = await waitForHttp(`${baseUrl}/api/v2/ready`, timeoutMs, 1500, fetchFn);

  return {
    webOk,
    healthOk,
    readyOk,
    allOk: webOk && healthOk && readyOk,
  };
}

export async function checkComfyUiHealth(
  comfyUrl,
  { timeoutMs = 5_000, fetchFn = globalThis.fetch } = {},
) {
  if (!comfyUrl || typeof comfyUrl !== "string" || !comfyUrl.trim()) {
    return { configured: false, reachable: false, message: "未配置 ComfyUI 服务地址" };
  }

  const normalizedUrl = comfyUrl.trim().replace(/\/+$/, "");
  const target = `${normalizedUrl}/system_stats`;
  const startTime = Date.now();

  try {
    const res = await fetchFn(target, { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - startTime;
    if (res.ok) {
      return {
        configured: true,
        reachable: true,
        latencyMs,
        endpoint: normalizedUrl,
        message: `ComfyUI 响应正常 (${latencyMs}ms)`,
      };
    }
    return {
      configured: true,
      reachable: false,
      latencyMs,
      endpoint: normalizedUrl,
      errorCategory: "HTTP_ERROR",
      message: `ComfyUI 返回 HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errStr = String(err);
    let errorCategory = "CONNECTION_REFUSED";

    if (/timeout|aborted/i.test(errStr)) {
      errorCategory = "TIMEOUT";
    } else if (/enotfound|eai_again|dns/i.test(errStr)) {
      errorCategory = "DNS_ERROR";
    }

    return {
      configured: true,
      reachable: false,
      latencyMs,
      endpoint: normalizedUrl,
      errorCategory,
      message: `无法连接 ComfyUI (${errorCategory}): ${err instanceof Error ? err.message : errStr}`,
    };
  }
}

/**
 * Read the ComfyUI configuration that the running API actually uses.
 *
 * The V2 Settings page persists ComfyUI settings in SQLite, which is the
 * authoritative runtime source. Environment variables are only a bootstrap
 * fallback for containers that never opened Settings.
 *
 * Returns:
 *   { runtimeAvailable: false }            — API is not reachable
 *   { runtimeAvailable: true, baseUrl }    — API answered; baseUrl may be ""
 */
export async function fetchRuntimeComfyConfig(
  baseUrl,
  { timeoutMs = 6_000, fetchFn = globalThis.fetch } = {},
) {
  try {
    const res = await fetchFn(`${baseUrl}/api/v2/platform/image-service`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { runtimeAvailable: false, status: res.status };
    }
    const payload = await res.json().catch(() => null);
    const settings = payload?.settings;
    const comfyBaseUrl =
      settings && typeof settings.baseUrl === "string" ? settings.baseUrl.trim() : "";
    return { runtimeAvailable: true, baseUrl: comfyBaseUrl };
  } catch {
    return { runtimeAvailable: false };
  }
}
