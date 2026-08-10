import assert from "node:assert/strict";
import test from "node:test";

import { focusedLogQueries, isUsefulInteractionLog } from "./interaction-log.ts";

test("focused log queries fetch meaningful actions and warnings without routine scans", () => {
  const queries = focusedLogQueries({ limit: 100, category: "IMAGE" });
  assert.ok(queries.some((query) => query.action === "image.progress"));
  assert.ok(queries.some((query) => query.level === "ERROR" && query.action === undefined));
  assert.ok(queries.some((query) => query.level === "WARN" && query.action === undefined));
  assert.ok(queries.every((query) => query.category === "IMAGE"));

  const infoQueries = focusedLogQueries({ limit: 100, level: "INFO" });
  assert.ok(infoQueries.every((query) => query.level === "INFO"));
});

test("useful log filtering keeps outcomes people need and hides idle image scans", () => {
  const base = {
    id: "log",
    createdAt: "2026-08-10T00:00:00.000Z",
    source: "WORKER" as const,
    category: "IMAGE" as const,
    action: "image.progress",
    outcome: "STARTED",
    level: "DEBUG" as const,
  };
  assert.equal(isUsefulInteractionLog(base), false);
  assert.equal(isUsefulInteractionLog({ ...base, outcome: "COMPLETED" }), true);
  assert.equal(isUsefulInteractionLog({ ...base, category: "SYSTEM", action: "worker.heartbeat", level: "ERROR" }), true);
});
