import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalMediaStore, StoringComfyUiClient } from "./media-storage.ts";

test("LocalMediaStore hashes content and rejects unsafe references", async () => {
  const root = await mkdtemp(join(tmpdir(), "living-network-media-"));
  try {
    const store = new LocalMediaStore(root);
    const saved = await store.put(new TextEncoder().encode("image-bytes"), "image/png", "result.png");
    assert.match(saved.mediaRef, /^media:\/\/local\/[a-f0-9]{64}\.png$/);
    const loaded = await store.get(saved.mediaRef);
    assert.equal(new TextDecoder().decode(loaded.bytes), "image-bytes");
    await assert.rejects(store.get("media://local/../../secret"), /invalid local media reference/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("StoringComfyUiClient validates and stores image results", async () => {
  const root = await mkdtemp(join(tmpdir(), "living-network-media-"));
  try {
    const store = new LocalMediaStore(root);
    const client = new StoringComfyUiClient(
      {
        async submit() { return { externalJobId: "external-1" }; },
        async getResult() { return { externalJobId: "external-1", mediaRef: "https://comfy.example/view.png" }; },
      },
      store,
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const result = await client.getResult("external-1");
    assert.match(result.mediaRef, /^media:\/\/local\//);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
