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
  assert.equal(edgeStatus("fact", "scene_generation_context"), "direct");
  assert.equal(edgeStatus("character_name", "scene_generation_context"), "direct");
  assert.equal(edgeStatus("scene_title", "scene_generation_context"), "direct");
  assert.equal(edgeStatus("scene_generation_context", "scene_generation"), "direct");
  // These are NOT in the current GenerationContext type.
  assert.equal(edgeStatus("character_persona", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("character_summary", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("location", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("rule", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("timeline", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("state", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("scene_body", "scene_generation_context"), "unused");
  assert.equal(edgeStatus("choice", "scene_generation_context"), "unused");
});

test("Truthfulness regression: ComfyUI only receives manual prompt", () => {
  assert.equal(edgeStatus("manual_prompt", "comfyui_payload"), "direct");
  assert.equal(edgeStatus("comfyui_payload", "comfyui"), "direct");
  assert.equal(edgeStatus("character_name", "comfyui_payload"), "unused");
  assert.equal(edgeStatus("character_persona", "comfyui_payload"), "unused");
  assert.equal(edgeStatus("fact", "comfyui_payload"), "unused");
  assert.equal(edgeStatus("state", "comfyui_payload"), "unused");
});

test("Truthfulness regression: Chat routes through chat context", () => {
  assert.equal(edgeStatus("character_persona", "chat_context"), "direct");
  assert.equal(edgeStatus("rule", "chat_context"), "direct");
  assert.equal(edgeStatus("memory", "chat_context"), "direct");
  assert.equal(edgeStatus("chat_context", "chat"), "direct");
  assert.equal(edgeStatus("location", "chat_context"), "partial");
});

test("Context and pipeline nodes exist", () => {
  const ids = new Set(dataFlowNodes.map((node) => node.id));
  for (const id of ["chat_context", "scene_generation_context", "comfyui_payload", "fact_extraction", "scene_review", "asset_review", "formal_scene_graph"]) {
    assert.ok(ids.has(id), id + " should exist");
  }
});

test("Review boundary: candidates never flow directly into formal data", () => {
  assert.equal(edgeStatus("scene_candidate", "scene_review"), "direct");
  assert.equal(edgeStatus("scene_review", "formal_scene_graph"), "direct");
  assert.equal(edgeStatus("scene_candidate", "formal_scene_graph"), undefined);
  assert.equal(edgeStatus("image_candidate", "asset_review"), "direct");
  assert.equal(edgeStatus("asset_review", "formal_asset"), "direct");
  assert.equal(edgeStatus("image_candidate", "formal_asset"), undefined);
});

test("Release direction: manifest -> player, never the reverse", () => {
  assert.equal(edgeStatus("release_manifest", "player_runtime"), "direct");
  assert.equal(edgeStatus("player_runtime", "release_manifest"), undefined);
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
