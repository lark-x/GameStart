import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createV2FastifyApp } from "./index.ts";

test("V2 Fastify health route responds through injection", async () => {
  const app = createV2FastifyApp();
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: "/api/v2/health" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, version: "v2" });
  } finally {
    await app.close();
  }
});

test("V2 Fastify exposes readiness and explicit capabilities", async () => {
  const app = createV2FastifyApp({
    capabilities: { sceneGeneration: { enabled: false }, assetGeneration: { enabled: true } },
    ready: () => true,
  });
  await app.ready();
  try {
    const ready = await app.inject({ method: "GET", url: "/api/v2/ready" });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { ok: true, version: "v2", storage: "sqlite" });
    const capabilities = await app.inject({ method: "GET", url: "/api/v2/capabilities" });
    assert.deepEqual(capabilities.json(), {
      sceneGeneration: { enabled: false },
      assetGeneration: { enabled: true },
    });
  } finally {
    await app.close();
  }
});

test("V2 readiness reports a dependency that is not ready and external capabilities default off", async () => {
  const app = createV2FastifyApp({ ready: () => false });
  await app.ready();
  try {
    const ready = await app.inject({ method: "GET", url: "/api/v2/ready" });
    assert.equal(ready.statusCode, 503);
    assert.equal(ready.json().error.code, "NOT_READY");
    const capabilities = await app.inject({ method: "GET", url: "/api/v2/capabilities" });
    assert.deepEqual(capabilities.json(), { sceneGeneration: { enabled: false }, assetGeneration: { enabled: false } });
  } finally {
    await app.close();
  }
});

test("V2 media route validates refs, reports missing files, and streams approved assets", async () => {
  const mediaRoot = await mkdtemp(path.join(tmpdir(), "living-network-v2-media-"));
  const assetRoot = path.join(mediaRoot, "v2", "assets");
  const filename = `${"a".repeat(64)}.png`;
  const jpegFilename = `${"b".repeat(64)}.jpg`;
  const webpFilename = `${"c".repeat(64)}.webp`;
  const gifFilename = `${"d".repeat(64)}.gif`;
  await mkdir(assetRoot, { recursive: true });
  await writeFile(path.join(assetRoot, filename), "png-test");
  await writeFile(path.join(assetRoot, jpegFilename), "jpeg-test");
  await writeFile(path.join(assetRoot, webpFilename), "webp-test");
  await writeFile(path.join(assetRoot, gifFilename), "gif-test");
  const app = createV2FastifyApp({ mediaRoot });
  await app.ready();
  try {
    const invalid = await app.inject({ method: "GET", url: "/api/v2/media/assets/not-safe.png" });
    assert.equal(invalid.statusCode, 422);
    const missing = await app.inject({ method: "GET", url: `/api/v2/media/assets/${"b".repeat(64)}.png` });
    assert.equal(missing.statusCode, 404);
    const served = await app.inject({ method: "GET", url: `/api/v2/media/assets/${filename}` });
    assert.equal(served.statusCode, 200);
    assert.equal(served.headers["content-type"], "image/png");
    assert.match(String(served.headers["cache-control"]), /immutable/);
    assert.equal(served.body, "png-test");
    const jpeg = await app.inject({ method: "GET", url: `/api/v2/media/assets/${jpegFilename}` });
    assert.equal(jpeg.headers["content-type"], "image/jpeg");
    const webp = await app.inject({ method: "GET", url: `/api/v2/media/assets/${webpFilename}` });
    assert.equal(webp.headers["content-type"], "image/webp");
    const gif = await app.inject({ method: "GET", url: `/api/v2/media/assets/${gifFilename}` });
    assert.equal(gif.headers["content-type"], "image/gif");
  } finally {
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  }
});

test("V2 media route reports an unconfigured media root", async () => {
  const app = createV2FastifyApp();
  await app.ready();
  try {
    const response = await app.inject({ method: "GET", url: `/api/v2/media/assets/${"a".repeat(64)}.png` });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "NOT_FOUND");
  } finally {
    await app.close();
  }
});
