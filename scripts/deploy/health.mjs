/**
 * Service health polling, critical endpoint verification, and ComfyUI diagnostics.
 */

const DEFAULT_POLL_MS = 2500;

export async function waitForService(
  dockerClient,
  service,
  timeoutMs = 180_000,
  pollIntervalMs = DEFAULT_POLL_MS,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = dockerClient.ps(service);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const health = parsed.Health ?? parsed.State ?? "";
        if (/healthy/i.test(health) || (/running/i.test(health) && service === "worker")) {
          return true;
        }
      } catch {
        if (/healthy/i.test(raw) || (/running/i.test(raw) && service === "worker")) {
          return true;
        }
      }
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
