import assert from "node:assert/strict";
import test from "node:test";

import {
  dataFlowEdges,
  dataFlowFilters,
  dataFlowNodes,
  getEdgesForFilter,
  getNodesForFilter,
} from "./workspace-data-flow.ts";

function edgeStatus(from: string, to: string): string | undefined {
  return dataFlowEdges.find((edge) => edge.from === from && edge.to === to)?.status;
}

test("Truthfulness regression: Scene Generation context matches current code", () => {
  assert.equal(edgeStatus("fact", "scene_generation"), "direct");
  assert.equal(edgeStatus("character_name", "scene_generation"), "direct");
  assert.equal(edgeStatus("scene_title", "scene_generation"), "direct");
  // These are NOT in the current GenerationContext type.
  assert.equal(edgeStatus("character_persona", "scene_generation"), "unused");
  assert.equal(edgeStatus("character_summary", "scene_generation"), "unused");
  assert.equal(edgeStatus("location", "scene_generation"), "unused");
  assert.equal(edgeStatus("rule", "scene_generation"), "unused");
  assert.equal(edgeStatus("timeline", "scene_generation"), "unused");
  assert.equal(edgeStatus("state", "scene_generation"), "unused");
  assert.equal(edgeStatus("scene_body", "scene_generation"), "unused");
  assert.equal(edgeStatus("choice", "scene_generation"), "unused");
});

test("Truthfulness regression: ComfyUI only receives manual prompt", () => {
  assert.equal(edgeStatus("manual_prompt", "comfyui"), "direct");
  assert.equal(edgeStatus("character_name", "comfyui"), "unused");
  assert.equal(edgeStatus("character_persona", "comfyui"), "unused");
  assert.equal(edgeStatus("fact", "comfyui"), "unused");
  assert.equal(edgeStatus("state", "comfyui"), "unused");
});

test("Truthfulness regression: Chat uses persona, rules, and memories", () => {
  assert.equal(edgeStatus("character_persona", "chat"), "direct");
  assert.equal(edgeStatus("rule", "chat"), "direct");
  assert.equal(edgeStatus("memory", "chat"), "direct");
  assert.equal(edgeStatus("location", "chat"), "unused");
});

test("Every filter has at least one node and one edge", () => {
  for (const filter of dataFlowFilters) {
    const nodes = getNodesForFilter(filter);
    const edges = getEdgesForFilter(filter);
    assert.ok(nodes.length > 0, `Filter ${filter.id} should have nodes`);
    if (filter.id !== "all") {
      assert.ok(edges.length > 0, `Filter ${filter.id} should have edges`);
    }
  }
});

test("Every source node has a managePath for navigation", () => {
  const sources = dataFlowNodes.filter((node) => node.category === "source");
  for (const source of sources) {
    assert.ok(source.managePath, `Source node ${source.id} should have managePath`);
    assert.ok(source.managePath.startsWith("/v2/"), `managePath should be internal: ${source.managePath}`);
  }
});

test("Processor nodes with actionPath point to existing workspace routes", () => {
  const processors = dataFlowNodes.filter((node) => node.category === "processor" && node.actionPath);
  assert.ok(processors.length >= 3, "At least chat, scene generation, and comfyui should have action paths");
  for (const processor of processors) {
    assert.ok(processor.actionPath?.startsWith("/v2/") || processor.actionPath === "/v2/chat");
  }
});

test("All edge endpoints reference existing nodes", () => {
  const ids = new Set(dataFlowNodes.map((node) => node.id));
  for (const edge of dataFlowEdges) {
    assert.ok(ids.has(edge.from), `Edge from ${edge.from} references missing node`);
    assert.ok(ids.has(edge.to), `Edge to ${edge.to} references missing node`);
  }
});
