import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { V2IsoDateTime, V2JobId } from "@living-network/contracts";
import { V2AssetMediaStoreError, V2LocalAssetMediaStore } from "./local-asset-media-store.ts";

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function withTempMediaRoot<T>(run: (mediaRoot: string) => Promise<T>): Promise<T> {
  const mediaRoot = await mkdtemp(path.join(os.tmpdir(), "living-network-v2-media-"));
  try {
    return await run(mediaRoot);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
}

test("V2 local asset media store downloads through temp file and exposes a controlled ref", async () => {
  await withTempMediaRoot(async (mediaRoot) => {
    const requested: string[] = [];
    const store = new V2LocalAssetMediaStore({
      mediaRoot,
      fetchImpl: async (input) => {
        requested.push(String(input));
        return new Response(pngBytes, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(pngBytes.byteLength),
          },
        });
      },
    });
    const first = await store.storeGeneratedAsset({
      jobId: "job_asset_bridge" as V2JobId,
      externalJobId: "comfy:bridge",
      sourceMediaRef: "https://comfy.local/view?filename=bridge.png&type=output",
      storedAt: "2026-08-12T03:10:00.000Z" as V2IsoDateTime,
    });
    assert.equal(first.mediaRef.startsWith("media://local/v2/assets/"), true);
    assert.equal(first.mediaRef.endsWith(".png"), true);
    assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(first.byteLength, pngBytes.byteLength);
    assert.equal(first.contentType, "image/png");
    const relativePath = first.mediaRef.slice("media://local/".length).split("/").join(path.sep);
    assert.deepEqual(new Uint8Array(await readFile(path.join(mediaRoot, relativePath))), pngBytes);
    const files = await readdir(path.join(mediaRoot, "v2", "assets"));
    assert.equal(files.some((file) => file.endsWith(".tmp")), false);

    const replay = await store.storeGeneratedAsset({
      jobId: "job_asset_bridge" as V2JobId,
      externalJobId: "comfy:bridge",
      sourceMediaRef: "https://comfy.local/view?filename=bridge.png&type=output",
      storedAt: "2026-08-12T03:11:00.000Z" as V2IsoDateTime,
    });
    assert.deepEqual(replay, first);
    assert.equal(requested.length, 2);
  });
});

test("V2 local asset media store rejects unsafe or oversized source responses", async () => {
  await withTempMediaRoot(async (mediaRoot) => {
    const htmlStore = new V2LocalAssetMediaStore({
      mediaRoot,
      fetchImpl: async () => new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    });
    await assert.rejects(
      htmlStore.storeGeneratedAsset({
        jobId: "job_asset_bridge" as V2JobId,
        externalJobId: "comfy:bridge",
        sourceMediaRef: "https://comfy.local/view?filename=bridge.html",
        storedAt: "2026-08-12T03:12:00.000Z" as V2IsoDateTime,
      }),
      (error) => error instanceof V2AssetMediaStoreError && error.code === "INVALID_RESPONSE",
    );

    const oversizedStore = new V2LocalAssetMediaStore({
      mediaRoot,
      maxBytes: 4,
      fetchImpl: async () => new Response(pngBytes, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(pngBytes.byteLength),
        },
      }),
    });
    await assert.rejects(
      oversizedStore.storeGeneratedAsset({
        jobId: "job_asset_bridge" as V2JobId,
        externalJobId: "comfy:bridge",
        sourceMediaRef: "https://comfy.local/view?filename=bridge.png",
        storedAt: "2026-08-12T03:13:00.000Z" as V2IsoDateTime,
      }),
      (error) => error instanceof V2AssetMediaStoreError && error.code === "OVERSIZED_MEDIA",
    );
  });
});
