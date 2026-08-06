import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ComfyUiHttpClient,
} from "../apps/worker/src/media.ts";
import type { ComfyUiProgressEvent } from "../apps/worker/src/media.ts";
import { LocalMediaStore, StoringComfyUiClient } from "../apps/worker/src/media-storage.ts";
import type { JsonObject } from "../packages/domain/src/index.ts";

const enabled = process.env.RUN_COMFYUI_ACCEPTANCE === "1";
const comfyuiBaseUrl = process.env.COMFYUI_BASE_URL ?? "http://127.0.0.1:8188";
const workflowFile = process.env.COMFYUI_WORKFLOW_FILE ?? "";
const workflowJson = process.env.COMFYUI_WORKFLOW_JSON ?? "";
const fullChainEnabled = enabled && (workflowFile.length > 0 || workflowJson.length > 0);
const progressEnabled = fullChainEnabled && process.env.COMFYUI_PROGRESS_ACCEPTANCE === "1" && typeof WebSocket === "function";

async function loadWorkflow(): Promise<JsonObject> {
  const source = workflowFile.length > 0
    ? await readFile(workflowFile, "utf8")
    : workflowJson;
  const value: unknown = JSON.parse(source);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("COMFYUI workflow must be a JSON object");
  }
  return value as JsonObject;
}

test("ComfyUI instance is reachable", { skip: !enabled }, async () => {
  const response = await fetch(`${comfyuiBaseUrl}/system_stats`);
  assert.ok(response.ok, `ComfyUI should respond with 200, got ${response.status}`);
  const stats = await response.json() as Record<string, unknown>;
  assert.ok(stats !== null, "ComfyUI system_stats should return JSON");
  console.log("ComfyUI system_stats:", JSON.stringify(stats).slice(0, 200));
});

test("ComfyUI workflow queue endpoint accepts task", { skip: !fullChainEnabled }, async () => {
  const prompt = await loadWorkflow();
  const response = await fetch(`${comfyuiBaseUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  assert.ok(response.ok, `ComfyUI /prompt should accept a valid workflow, got ${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  assert.ok(body !== null, "ComfyUI /prompt should return JSON");
  assert.equal(typeof body.prompt_id, "string", "ComfyUI should return a prompt_id");
  console.log("ComfyUI prompt response:", JSON.stringify(body).slice(0, 200));
});

test("ComfyUI WebSocket progress reaches a terminal event", { skip: !progressEnabled }, async () => {
  const workflow = await loadWorkflow();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const client = new ComfyUiHttpClient({
    baseUrl: comfyuiBaseUrl,
    timeoutMs: Number(process.env.COMFYUI_PROGRESS_TIMEOUT_MS ?? 120_000),
    clientId: `living-network-progress-${suffix}`,
  });
  const submitted = await client.submit({
    jobId: `progress-${suffix}`,
    workflowVersion: "acceptance@v1",
    prompt: "living-network progress acceptance image",
    workflow,
  });
  const events: ComfyUiProgressEvent[] = [];
  for await (const event of client.watchProgress(submitted.externalJobId)) {
    events.push(event);
    if (event.kind === "completed" || event.kind === "error") break;
  }
  assert.ok(events.length > 0, "ComfyUI should emit at least one progress event");
  const terminal = events.at(-1);
  assert.ok(terminal);
  assert.equal(terminal.kind, "completed", terminal.message ?? "ComfyUI execution did not complete");
  console.log(`ComfyUI emitted ${events.length} progress events for ${submitted.externalJobId}`);
});

test("ComfyUI HTTP result is downloaded and stored locally", { skip: !fullChainEnabled }, async () => {
  const workflow = await loadWorkflow();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const root = await mkdtemp(join(tmpdir(), "living-network-comfyui-"));
  try {
    const external = new ComfyUiHttpClient({
      baseUrl: comfyuiBaseUrl,
      timeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS ?? 30_000),
      clientId: `living-network-acceptance-${suffix}`,
    });
    const client = new StoringComfyUiClient(external, new LocalMediaStore(root));
    const submitted = await client.submit({
      jobId: `acceptance-${suffix}`,
      workflowVersion: "acceptance@v1",
      prompt: "living-network acceptance image",
      workflow,
    });

    const maxAttempts = Number(process.env.COMFYUI_MAX_ATTEMPTS ?? 30);
    const delayMs = Number(process.env.COMFYUI_POLL_DELAY_MS ?? 2_000);
    let result: { externalJobId: string; mediaRef: string } | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        result = await client.getResult(submitted.externalJobId);
        break;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) throw error;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    assert.ok(result, lastError instanceof Error ? lastError.message : "ComfyUI result was not ready");
    assert.match(result.mediaRef, /^media:\/\/local\//);
    const stored = await new LocalMediaStore(root).get(result.mediaRef);
    assert.ok(stored.bytes.byteLength > 0, "stored image should not be empty");
    assert.match(stored.contentType, /^image\//);
    console.log(`ComfyUI generated ${stored.bytes.byteLength} bytes at ${result.mediaRef}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
