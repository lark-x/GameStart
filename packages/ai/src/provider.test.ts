import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAICompatibleProvider,
  ProviderError,
  createProviderFromConfig,
  type FetchImplementation,
} from "./index.ts";

function fetchRecorder(
  response: Response,
): { fetch: FetchImplementation; calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> } {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetch: FetchImplementation = async (input, init) => {
    const call: { input: RequestInfo | URL; init?: RequestInit } = { input };
    if (init !== undefined) call.init = init;
    calls.push(call);
    return response;
  };
  return { fetch, calls };
}

const request = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "Hello" }],
  temperature: 0.2,
  maxTokens: 32,
  responseFormat: "json_object" as const,
};

test("sends OpenAI-compatible complete requests and parses usage", async () => {
  const response = new Response(JSON.stringify({
    id: "completion-1",
    model: "test-model",
    choices: [{ message: { content: "Hi" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
  }), { status: 200 });
  const recorder = fetchRecorder(response);
  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://llm.example/v1/",
    apiKey: "secret-token",
    model: "default-model",
  }, recorder.fetch);

  const result = await provider.complete(request);
  assert.deepEqual(result, {
    id: "completion-1",
    model: "test-model",
    content: "Hi",
    finishReason: "stop",
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
  });
  assert.equal(recorder.calls[0]?.input, "https://llm.example/v1/chat/completions");
  const init = recorder.calls[0]?.init;
  assert.equal(init?.headers && new Headers(init.headers).get("authorization"), "Bearer secret-token");
  const body = JSON.parse(String(init?.body));
  assert.equal(body.model, "test-model");
  assert.equal(body.stream, false);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(String(init?.body).includes("secret-token"), false);
});

test("parses chunked SSE deltas and stops at DONE", async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"id":"stream-1","model":"m","choices":[{"delta":{"content":"Hel"}}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const recorder = fetchRecorder(new Response(stream, { status: 200 }));
  const provider = new OpenAICompatibleProvider({ baseUrl: "http://localhost:9000", model: "m" }, recorder.fetch);

  const deltas = [];
  for await (const delta of provider.stream({ messages: request.messages })) deltas.push(delta);
  assert.deepEqual(deltas, [
    { id: "stream-1", model: "m", content: "Hel" },
    { content: "lo", finishReason: "stop" },
  ]);
  assert.equal(JSON.parse(String(recorder.calls[0]?.init?.body)).stream, true);
});

test("normalizes HTTP failures without exposing API keys", async () => {
  const recorder = fetchRecorder(new Response("provider-secret-error", { status: 429 }));
  const provider = new OpenAICompatibleProvider({
    baseUrl: "https://llm.example",
    apiKey: "hidden-key",
    model: "m",
  }, recorder.fetch);

  await assert.rejects(
    provider.complete({ messages: request.messages }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "HTTP_ERROR");
      assert.equal(error.status, 429);
      assert.equal(error.retryable, true);
      assert.equal(error.message.includes("hidden-key"), false);
      return true;
    },
  );
});

test("rejects invalid setup/input and supports optional config construction", () => {
  assert.equal(createProviderFromConfig({}), undefined);
  assert.throws(
    () => new OpenAICompatibleProvider({ baseUrl: "file:///tmp/model", model: "m" }),
    { name: "ProviderError", message: /http or https/ },
  );
  const provider = createProviderFromConfig({ baseUrl: "http://localhost", model: "m" });
  assert.ok(provider);
  assert.rejects(
    provider.complete({ messages: [] }),
    { name: "ProviderError", message: /At least one/ },
  );
});
