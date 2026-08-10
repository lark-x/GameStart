import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDevelopmentRepositories } from "./dev-seed.ts";
import { ApiApplication } from "./app.ts";

test("uploads and serves local chat images through the API", async () => {
  const root = await mkdtemp(join(tmpdir(), "living-network-media-"));
  try {
    const application = new ApiApplication(createDevelopmentRepositories(), undefined, {}, {}, {
      mediaRoot: root,
      loggingCleanupEnabled: false,
    });
    const upload = await application.handle(new Request("http://localhost/v1/media/chat-images", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71, 13, 10]),
    }));
    assert.equal(upload.status, 201);
    const uploaded = (await upload.json()) as { data: { mediaRef: string; contentType: string } };
    assert.equal(uploaded.data.contentType, "image/png");
    assert.match(uploaded.data.mediaRef, /^media:\/\/local\/[a-f0-9]{64}\.png$/);

    const filename = uploaded.data.mediaRef.slice("media://local/".length);
    const served = await application.handle(new Request(`http://localhost/v1/media/local/${filename}`));
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.deepEqual([...new Uint8Array(await served.arrayBuffer())], [137, 80, 78, 71, 13, 10]);
    assert.equal((await readFile(join(root, filename))).byteLength, 6);

    const rejected = await application.handle(new Request("http://localhost/v1/media/chat-images", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not an image",
    }));
    assert.equal(rejected.status, 415);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
