import test from "node:test";
import assert from "node:assert/strict";
import { deterministicReplyId, findPendingSource, normalizeAutoReply } from "./auto-reply.ts";
test("normalizes reply states", () => { assert.equal(normalizeAutoReply({ status: "QUEUED" })?.status, "QUEUED"); assert.equal(normalizeAutoReply({ status: "ALREADY_EXISTS" })?.status, "ALREADY_EXISTS"); assert.equal(normalizeAutoReply({ status: "NOT_APPLICABLE" })?.status, "NOT_APPLICABLE"); });
test("uses deterministic reply ids", () => { assert.equal(deterministicReplyId("c", "s"), "assistant:c:s"); assert.equal(normalizeAutoReply({ status: "COMPLETED", messageId: "assistant:c:s" })?.messageId, "assistant:c:s"); });
test("pending source excludes existing assistant reply", () => { const messages = [{ id: "s", authorCharacterId: "u", kind: "TEXT" }]; assert.equal(findPendingSource("c", { type: "PRIVATE" }, { role: "USER" }, "u", messages)?.id, "s"); assert.equal(findPendingSource("c", { type: "PRIVATE" }, { role: "USER" }, "u", [...messages, { id: "assistant:c:s", authorCharacterId: "a", kind: "TEXT" }]), undefined); });
