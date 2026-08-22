import assert from "node:assert/strict";
import test from "node:test";
import type {
  V2MomentId,
} from "@living-network/contracts/v2";
import { createV2CompanionClient } from "./client.ts";

test("V2CompanionClient maps moments and mediaUrl correctly", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v2/companion/moments") && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            moments: [
              {
                momentId: "m-1",
                characterId: "c-1",
                characterName: "芙宁娜",
                content: "今天的新剧排练超棒！",
                likesCount: 5,
                isLiked: true,
                commentsCount: 1,
                createdAt: "2026-08-22T10:00:00.000Z",
                comments: [],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v2/companion/moments/m-1/like") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ momentId: "m-1", isLiked: true, likesCount: 6 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const client = createV2CompanionClient({ baseUrl: "http://127.0.0.1:3003" });

    // Test list
    const moments = await client.listMoments();
    assert.equal(moments.length, 1);
    assert.equal(moments[0]?.characterName, "芙宁娜");

    // Test like
    const like = await client.toggleLikeMoment("m-1" as V2MomentId);
    assert.equal(like.isLiked, true);
    assert.equal(like.likesCount, 6);

    // Test mediaUrl
    assert.equal(
      client.mediaUrl("local://assets/photo.png"),
      "http://127.0.0.1:3003/api/v2/media/assets/photo.png",
    );
    assert.equal(
      client.mediaUrl("https://example.com/pic.jpg"),
      "https://example.com/pic.jpg",
    );
    assert.equal(client.mediaUrl(""), "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
