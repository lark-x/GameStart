import assert from "node:assert/strict";
import test from "node:test";

import { SecretCipher } from "@living-network/ai";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqlitePlatformRepository,
} from "@living-network/database/v2";
import type { V2StoredModelProfile } from "@living-network/contracts/v2";
import type { V2PlatformRepository } from "@living-network/ports/v2";
import { V2DynamicModelProvider } from "./model-provider.ts";

function profile(cipher: SecretCipher): V2StoredModelProfile {
  const encrypted = cipher.encrypt("profile-secret");
  return {
    id: "profile:scene",
    name: "Scene model",
    protocol: "openai-compatible",
    baseUrl: "https://llm.example/v1",
    model: "scene-model",
    timeoutMs: 5000,
    maxTokens: 1024,
    temperature: 0.35,
    encryptedApiKey: encrypted.ciphertext,
    encryptionIv: encrypted.iv,
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
  };
}

test("V2 dynamic model provider resolves a bound profile and persists redacted call logs", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  const key = Buffer.alloc(32, 7).toString("base64");
  const cipher = new SecretCipher(key);
  const originalFetch = globalThis.fetch;
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    await repository.saveModelProfile(profile(cipher));
    await repository.setModelBinding({ capability: "scene_generation", profileId: "profile:scene" });
    globalThis.fetch = async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer profile-secret");
      return new Response(JSON.stringify({
        id: "response:scene",
        model: "scene-model",
        choices: [{ message: { content: "{\"scene\":{}}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }), { status: 200 });
    };

    const provider = new V2DynamicModelProvider({
      repository,
      secretCipher: cipher,
      capability: "scene_generation",
      fallback: { protocol: "openai-compatible", timeoutMs: 5000 },
      now: () => new Date("2026-08-14T10:01:00.000Z"),
    });
    const result = await provider.complete({
      messages: [{ role: "user", content: "Bearer profile-secret; token=do-not-store" }],
      trace: { correlationId: "corr:scene", storyWorldId: "world:scene", jobId: "job:scene" },
    });
    assert.equal(result.id, "response:scene");
    const logs = await repository.queryModelCallLogs();
    assert.equal(logs.items.length, 1);
    assert.equal(logs.items[0]?.status, "success");
    assert.equal(logs.items[0]?.profileName, "Scene model");
    assert.equal(logs.items[0]?.totalTokens, 30);
    assert.equal(logs.items[0]?.requestMessages?.[0]?.content.includes("profile-secret"), false);
    assert.equal(logs.items[0]?.requestMessages?.[0]?.content.includes("[REDACTED]"), true);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
    cleanup();
  }
});

test("V2 dynamic model provider uses environment fallback and reports missing configuration", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  const originalFetch = globalThis.fetch;
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    globalThis.fetch = async () => new Response(JSON.stringify({
      id: "response:fallback",
      model: "fallback-model",
      choices: [{ message: { content: "OK" } }],
    }), { status: 200 });
    const provider = new V2DynamicModelProvider({
      repository,
      capability: "chat",
      fallback: {
        protocol: "openai-compatible",
        baseUrl: "https://fallback.example/v1",
        model: "fallback-model",
        timeoutMs: 5000,
      },
    });
    assert.equal((await provider.complete({ messages: [{ role: "user", content: "ping" }] })).model, "fallback-model");

    const missing = new V2DynamicModelProvider({
      repository,
      capability: "chat",
      fallback: { protocol: "openai-compatible", timeoutMs: 5000 },
    });
    await assert.rejects(
      () => missing.complete({ messages: [{ role: "user", content: "ping" }] }),
      { name: "ProviderError", message: /No scene generation model is configured/ },
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
    cleanup();
  }
});

test("V2 dynamic model provider records provider failures and streamed responses", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  const originalFetch = globalThis.fetch;
  try {
    applyV2Migrations(db);
    const repository = new V2SqlitePlatformRepository(db);
    const provider = new V2DynamicModelProvider({
      repository,
      capability: "memory",
      fallback: { protocol: "openai-compatible", baseUrl: "https://fallback.example/v1", model: "fallback-model", timeoutMs: 5000 },
      now: () => new Date("2026-08-14T10:02:00.000Z"),
    });
    globalThis.fetch = async () => new Response("upstream failed", { status: 502 });
    await assert.rejects(
      () => provider.complete({ messages: [{ role: "user", content: [{ type: "text", text: "hello" }, { type: "image", mediaType: "image/png", dataBase64: "abc" }] }] }),
      /upstream failed/,
    );
    assert.equal((await repository.queryModelCallLogs({ status: "error" })).items.length, 1);

    const encoder = new TextEncoder();
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"stream-response","model":"fallback-model","choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 });
    const deltas = [];
    for await (const delta of provider.stream({ messages: [{ role: "user", content: "stream" }], trace: { correlationId: "corr:stream" } })) deltas.push(delta);
    assert.equal(deltas.length, 2);
    const successLogs = await repository.queryModelCallLogs({ status: "success" });
    assert.equal(successLogs.items[0]?.responseText, "Hello world");

    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":"interrupt-response","model":"fallback-model","choices":[{"delta":{"content":"partial"}}]}\n\n'));
      },
    }), { status: 200 });
    const interrupted = provider.stream({ messages: [{ role: "user", content: "interrupt" }] });
    await interrupted.next();
    await interrupted.return(undefined);
    const allErrors = await repository.queryModelCallLogs({ status: "error" });
    assert.equal(allErrors.items.length, 2);
    assert.equal(allErrors.items.some((log) => log.errorCode === "INTERRUPTED"), true);

    globalThis.fetch = async () => new Response("stream failed", { status: 500 });
    const brokenStream = provider.stream({ messages: [{ role: "user", content: "broken" }] });
    await assert.rejects(() => brokenStream.next(), /stream failed/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
    cleanup();
  }
});

test("V2 dynamic model provider reports invalid bound profile and secret failures", async () => {
  const keyA = Buffer.alloc(32, 1).toString("base64");
  const keyB = Buffer.alloc(32, 2).toString("base64");
  const cipherA = new SecretCipher(keyA);
  const encrypted = cipherA.encrypt("secret");
  const baseProfile: V2StoredModelProfile = {
    id: "profile:bound",
    name: "Bound",
    protocol: "openai-compatible",
    baseUrl: "https://llm.example",
    model: "m",
    timeoutMs: 5000,
    maxTokens: 128,
    temperature: 0.2,
    createdAt: "now",
    updatedAt: "now",
  };
  const repositoryFor = (profile: V2StoredModelProfile | undefined): V2PlatformRepository => ({
    getModelBinding: async () => ({ capability: "scene_generation", profileId: "profile:bound" }),
    getModelProfile: async () => profile,
  } as unknown as V2PlatformRepository);
  await assert.rejects(
    () => new V2DynamicModelProvider({ repository: repositoryFor(undefined), capability: "chat", fallback: { protocol: "openai-compatible", timeoutMs: 5000 } }).complete({ messages: [{ role: "user", content: "x" }] }),
    /Bound model profile was not found/,
  );
  await assert.rejects(
    () => new V2DynamicModelProvider({ repository: repositoryFor({ ...baseProfile, encryptedApiKey: encrypted.ciphertext, encryptionIv: encrypted.iv }), capability: "chat", fallback: { protocol: "openai-compatible", timeoutMs: 5000 } }).complete({ messages: [{ role: "user", content: "x" }] }),
    /INTEGRATION_SECRET_KEY/,
  );
  await assert.rejects(
    () => new V2DynamicModelProvider({ repository: repositoryFor({ ...baseProfile, encryptedApiKey: encrypted.ciphertext, encryptionIv: encrypted.iv }), secretCipher: new SecretCipher(keyB), capability: "chat", fallback: { protocol: "openai-compatible", timeoutMs: 5000 } }).complete({ messages: [{ role: "user", content: "x" }] }),
    /cannot be decrypted/,
  );
});
