import assert from "node:assert/strict";
import test from "node:test";

import { StructuredOutputError } from "../story-analyzer.ts";
import { buildFactExtractionPrompt } from "./build-fact-extraction-prompt.ts";
import { parseFactExtractionOutput } from "./fact-extraction-schema.ts";

test("buildFactExtractionPrompt includes message ids and extractor version", () => {
  const { system, user } = buildFactExtractionPrompt({
    extractorVersion: "fact.extract:v1",
    messages: [
      { role: "user", messageId: "message:1", text: "我最近更喜欢手冲咖啡。" },
      { role: "assistant", messageId: "message:2", text: "好的，记住了。" },
    ],
  });
  assert.ok(system.includes("Fact Extractor"));
  assert.ok(user.includes("fact.extract:v1"));
  assert.ok(user.includes("[ID: message:1]"));
  assert.ok(user.includes("[ID: message:2]"));
});

test("parseFactExtractionOutput extracts valid assertions", () => {
  const output = JSON.stringify([
    {
      subject: { entityType: "user", entityId: "user:local", label: "用户" },
      predicate: "preferred_coffee",
      object: { type: "text", value: "pour_over" },
      kind: "preference",
      text: "用户更喜欢手冲咖啡",
      changeHint: "replaces_previous",
      confidence: 0.95,
      importanceHint: 0.7,
      sourceMessageIds: ["message:1"],
    },
  ]);
  const parsed = parseFactExtractionOutput(output);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.predicate, "preferred_coffee");
  assert.equal(parsed[0]?.subject.label, "用户");
  assert.deepEqual(parsed[0]?.sourceMessageIds, ["message:1"]);
  assert.equal("epistemicStatus" in parsed[0]!, false);
});

test("parseFactExtractionOutput accepts a facts wrapper and markdown fences", () => {
  const output = [
    "```json",
    JSON.stringify({
      facts: [
        {
          subject: { entityType: "character", entityId: "character:alice" },
          predicate: "location",
          object: { type: "entity", value: "character:alice", entityId: "location:forest" },
          kind: "episodic",
          text: "Alice 在迷雾森林",
          changeHint: "new",
          epistemicStatus: "observed",
          confidence: 0.9,
          importanceHint: 0.4,
          sourceMessageIds: ["message:5"],
        },
      ],
    }),
    "```",
  ].join("\n");
  const parsed = parseFactExtractionOutput(output);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.epistemicStatus, "observed");
  assert.equal(parsed[0]?.object.entityId, "location:forest");
});

test("parseFactExtractionOutput fails fast on invalid output", () => {
  assert.throws(
    () => parseFactExtractionOutput("not json"),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_JSON",
  );
  assert.throws(
    () => parseFactExtractionOutput(JSON.stringify({ notFacts: [] })),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
  assert.throws(
    () => parseFactExtractionOutput(JSON.stringify([
      {
        subject: { entityType: "user", entityId: "user:local" },
        predicate: "preferred_coffee",
        object: { type: "text", value: "pour_over" },
        kind: "nonsense",
        text: "x",
        changeHint: "new",
        confidence: 0.9,
        importanceHint: 0.5,
        sourceMessageIds: ["message:1"],
      },
    ])),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
  assert.throws(
    () => parseFactExtractionOutput(JSON.stringify([
      {
        subject: { entityType: "user", entityId: "user:local" },
        predicate: "preferred_coffee",
        object: { type: "text", value: "pour_over" },
        kind: "preference",
        text: "x",
        changeHint: "new",
        confidence: 1.2,
        importanceHint: 0.5,
        sourceMessageIds: ["message:1"],
      },
    ])),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
  assert.throws(
    () => parseFactExtractionOutput(JSON.stringify([
      {
        subject: { entityType: "user", entityId: "user:local" },
        predicate: "preferred_coffee",
        object: { type: "text", value: "pour_over" },
        kind: "preference",
        text: "x",
        changeHint: "new",
        confidence: 0.9,
        importanceHint: 0.5,
        sourceMessageIds: [],
      },
    ])),
    (error: unknown) => error instanceof StructuredOutputError && error.code === "INVALID_SCHEMA",
  );
});
