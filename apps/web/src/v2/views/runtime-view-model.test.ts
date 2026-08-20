import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutomationOverviewCards,
  buildJobQuery,
  buildMemoryStatusSummary,
  formatRuntimeClientError,
  shouldShowMemoryStats,
} from "./runtime-view-model.ts";
import type { V2MemoryOverviewDto } from "@living-network/contracts/v2";

function overview(partial: Partial<V2MemoryOverviewDto>): V2MemoryOverviewDto {
  return {
    facts: { total: 0, relatedCharacterCount: 0, averageImportance: 0, averageConfidence: 0, typeDistribution: [] },
    extraction: {},
    consolidation: {},
    engines: [],
    recentFailures: [],
    ...partial,
  };
}

const formatTime = (value: string | undefined) => value ?? "—";

test("memory view model distinguishes loading, empty, success, and current failure states", () => {
  assert.equal(shouldShowMemoryStats(0), false);
  assert.equal(shouldShowMemoryStats(1), true);

  assert.deepEqual(buildMemoryStatusSummary({
    loadState: "loading",
    overview: null,
    error: null,
    formatTime,
  }), {
    tone: "neutral",
    title: "正在读取 Memory 状态",
    detail: "正在加载长期记忆与最近运行记录。",
  });

  assert.equal(buildMemoryStatusSummary({
    loadState: "ready",
    overview: overview({ facts: { total: 0, relatedCharacterCount: 0, averageImportance: 0, averageConfidence: 0, typeDistribution: [] } }),
    error: null,
    formatTime,
  }).title, "Memory 暂无数据");

  assert.deepEqual(buildMemoryStatusSummary({
    loadState: "ready",
    overview: overview({
      facts: { total: 2, relatedCharacterCount: 1, averageImportance: 0.8, averageConfidence: 0.9, typeDistribution: [] },
      extraction: { latest: { jobId: "job:1", status: "completed", updatedAt: "2026-08-20T00:00:00.000Z" } },
    }),
    error: null,
    formatTime,
  }), {
    tone: "success",
    title: "Memory 正常",
    detail: "最近提取成功 · 2026-08-20T00:00:00.000Z",
  });

  const failed = buildMemoryStatusSummary({
    loadState: "ready",
    overview: overview({
      extraction: { latest: { jobId: "job:2", status: "failed", updatedAt: "2026-08-20T01:00:00.000Z" } },
    }),
    error: null,
    formatTime,
  });
  assert.equal(failed.tone, "danger");
  assert.match(failed.detail, /Extraction 失败/);
});

test("automation view model builds filters, cards, and user-readable retry conflicts", () => {
  assert.deepEqual(buildJobQuery({ statusFilter: "", typeFilter: "", limit: 50 }), { limit: 50 });
  assert.deepEqual(buildJobQuery({
    statusFilter: "failed",
    typeFilter: "memory_extract",
    limit: 50,
    cursor: "next",
  }), {
    status: "failed",
    type: "memory_extract",
    limit: 50,
    cursor: "next",
  });

  assert.equal(formatRuntimeClientError({ status: 409, code: "CONFLICT", message: "Only failed jobs can be retried" }, "重试失败"), "任务状态已变化，当前不能重新执行。");
  assert.equal(formatRuntimeClientError({ code: "VALIDATION_FAILED", message: "bad input" }, "加载失败"), "VALIDATION_FAILED: bad input");

  const cards = buildAutomationOverviewCards({ pending: 1, claimed: 2, running: 3, completed: 4, failed: 5 });
  assert.deepEqual(cards.map((card) => card.label), ["等待中", "已认领", "运行中", "当前失败", "累计完成"]);
  assert.equal(cards.find((card) => card.label === "当前失败")?.value, 5);
  assert.equal(cards.find((card) => card.label === "当前失败")?.tone, "danger");
});
