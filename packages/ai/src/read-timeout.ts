import { ProviderError } from "./provider.ts";

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * Read an entire response body with a timeout.
 *
 * Uses `response.body.getReader()` + `Promise.race` so the timeout actually
 * interrupts a hanging body read — unlike passing an AbortController that
 * is never wired to the underlying stream.
 */
export async function readBodyWithTimeout(
  response: Response,
  timeoutMs: number,
): Promise<string> {
  if (response.body === null) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => { /* ignore cancel errors */ });
      reject(new ProviderError("TIMEOUT", "LLM response body read timed out", { retryable: true }));
    }, timeoutMs);
  });

  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeout]);
      // If the timeout fired, its rejection wins — even if reader.cancel()
      // caused reader.read() to resolve with {done:true} concurrently.
      if (timedOut) break;
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => { /* ignore */ });
        throw new ProviderError("INVALID_RESPONSE", "LLM response body exceeds maximum size", { retryable: false });
      }
      chunks.push(result.value);
    }
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    try { reader.releaseLock(); } catch { /* already released */ }
  }

  if (timedOut) {
    // The timeout promise rejected — re-throw via the race result on next await.
    // The while loop already broke; just await the timeout to propagate the error.
    await timeout;
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(body);
}
