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

test("validates every completion input and provider configuration boundary", async () => {
  const validMessage = [{ role: "user" as const, content: "hello" }];
  const provider = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    return new Response(JSON.stringify({ id: "id", model: "m", choices: [{ message: { content: "ok" } }] }));
  });
  await assert.rejects(provider.complete({ messages: [] }), /At least one/);
  await assert.rejects(provider.complete({ messages: [{ role: "user", content: "  " }] }), /empty content/);
  await assert.rejects(new OpenAICompatibleProvider({ baseUrl: "https://llm.example" }).complete({ messages: validMessage }), /model is required/);
  await assert.rejects(provider.complete({ messages: validMessage, temperature: Number.NaN }), /temperature/);
  await assert.rejects(provider.complete({ messages: validMessage, temperature: -1 }), /temperature/);
  await assert.rejects(provider.complete({ messages: validMessage, maxTokens: 0 }), /maxTokens/);
  await assert.rejects(provider.complete({ messages: validMessage, maxTokens: 1.5 }), /maxTokens/);
  assert.throws(() => new OpenAICompatibleProvider({ baseUrl: "" }), /baseUrl is required/);
  assert.throws(() => new OpenAICompatibleProvider({ baseUrl: "not-a-url" }), /valid URL/);
  assert.throws(() => new OpenAICompatibleProvider({ baseUrl: "https://llm.example", timeoutMs: 0 }), /timeoutMs/);
  assert.ok(createProviderFromConfig({ baseUrl: "https://llm.example" }));
});

test("normalizes invalid completion and stream responses", async () => {
  const invalid = (payload: unknown) => new OpenAICompatibleProvider(
    { baseUrl: "https://llm.example", model: "m" },
    async () => new Response(JSON.stringify(payload)),
  );
  await assert.rejects(invalid(null).complete({ messages: request.messages }), /must be an object/);
  await assert.rejects(invalid({ choices: [] }).complete({ messages: request.messages }), /no choices/);
  await assert.rejects(invalid({ choices: [{}] }).complete({ messages: request.messages }), /no text content/);
  await assert.rejects(invalid({ choices: [{ message: { content: "ok" } }] }).complete({ messages: request.messages }), /missing id or model/);
  const emptyUsage = await invalid({
    id: "id",
    model: "m",
    choices: [{ message: { content: "ok" } }],
    usage: { prompt_tokens: "bad" },
  }).complete({ messages: request.messages });
  assert.deepEqual(emptyUsage.usage, {});

  const invalidJson = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => ({
    ok: true,
    json: async () => { throw new Error("bad json"); },
  } as unknown as Response));
  await assert.rejects(invalidJson.complete({ messages: request.messages }), /not valid JSON/);

  const nullBody = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => new Response(null));
  await assert.rejects(nullBody.stream({ messages: request.messages }).next(), /no stream body/);

  const badStream = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: not-json\n\n"));
        controller.close();
      },
    });
    return new Response(stream);
  });
  await assert.rejects(badStream.stream({ messages: request.messages }).next(), /not valid JSON/);

  const wrongShape = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {}\n\n"));
        controller.close();
      },
    });
    return new Response(stream);
  });
  await assert.rejects(wrongShape.stream({ messages: request.messages }).next(), /invalid shape/);
});

test("covers provider network, timeout, and error-body handling", async () => {
  const network = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    throw new Error("socket closed");
  });
  await assert.rejects(network.complete({ messages: request.messages }), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.equal(error.retryable, true);
    return true;
  });

  const timeout = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m", timeoutMs: 1 }, async (_input, init) => {
    await new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    throw new Error("unreachable");
  });
  await assert.rejects(timeout.complete({ messages: request.messages }), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "TIMEOUT");
    return true;
  });

  const genericBody = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => ({
    ok: false,
    status: 400,
    text: async () => { throw new Error("cannot read"); },
  } as unknown as Response));
  await assert.rejects(genericBody.complete({ messages: request.messages }), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "HTTP_ERROR");
    assert.equal(error.retryable, false);
    assert.equal(error.message, "LLM provider returned an error");
    return true;
  });

  const finalEvent = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"tail"}}]}'));
        controller.close();
      },
    });
    return new Response(stream);
  });
  const finalDeltas = [];
  for await (const delta of finalEvent.stream({ messages: request.messages })) finalDeltas.push(delta);
  assert.deepEqual(finalDeltas, [{ content: "tail" }]);

  const brokenStream = new OpenAICompatibleProvider({ baseUrl: "https://llm.example", model: "m" }, async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error("stream socket closed")); },
    });
    return new Response(stream);
  });
  await assert.rejects(brokenStream.stream({ messages: request.messages }).next(), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "STREAM_ERROR");
    assert.equal(error.retryable, true);
    return true;
  });
});

test("sends image content parts as OpenAI-compatible data URLs", async () => {
  const recorder = fetchRecorder(new Response(JSON.stringify({
    id: "completion-image",
    model: "vision-model",
    choices: [{ message: { content: "I can see it" } }],
  })));
  const provider = new OpenAICompatibleProvider({ baseUrl: "https://llm.example/v1", model: "vision-model" }, recorder.fetch);

  await provider.complete({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "describe this" },
        { type: "image", mediaType: "image/png", dataBase64: "aGVsbG8=" },
      ],
    }],
  });

  const body = JSON.parse(String(recorder.calls[0]?.init?.body));
  assert.deepEqual(body.messages[0].content, [
    { type: "text", text: "describe this" },
    { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
  ]);
});

// Test A: HTTP 200 returned but body never ends → TIMEOUT
test("complete() body timeout when response body never ends", async () => {
  const provider = new OpenAICompatibleProvider(
    { baseUrl: "https://llm.example", model: "m", timeoutMs: 50 },
    async () => {
      // HTTP 200 with a body that never closes.
      const stream = new ReadableStream<Uint8Array>({
        start() { /* never enqueue, never close */ },
      });
      return new Response(stream, { status: 200 });
    },
  );
  await assert.rejects(provider.complete({ messages: request.messages }), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.retryable, true);
    return true;
  });
});

// Test C: tokens arriving regularly within timeout → no false timeout
test("complete() body does not timeout when data arrives within window", async () => {
  const provider = new OpenAICompatibleProvider(
    { baseUrl: "https://llm.example", model: "m", timeoutMs: 500 },
    async () => {
      const payload = JSON.stringify({
        id: "r1", model: "m",
        choices: [{ message: { content: "slow but fine" } }],
      });
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Simulate a slow but eventually complete body (well within timeout).
          await new Promise((r) => setTimeout(r, 20));
          controller.enqueue(new TextEncoder().encode(payload));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    },
  );
  const result = await provider.complete({ messages: request.messages });
  assert.equal(result.content, "slow but fine");
});

// Test D: Provider returns oversized JSON body → explicit failure
test("complete() rejects oversized response body", async () => {
  const provider = new OpenAICompatibleProvider(
    { baseUrl: "https://llm.example", model: "m", timeoutMs: 5000 },
    async () => {
      // 5 MiB exceeds the 4 MiB limit.
      const big = "x".repeat(5 * 1024 * 1024);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(big));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    },
  );
  await assert.rejects(provider.complete({ messages: request.messages }), (error: unknown) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.code, "INVALID_RESPONSE");
    assert.match(error.message, /maximum size/);
    return true;
  });
});
