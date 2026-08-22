import assert from "node:assert/strict";
import test from "node:test";
import { applyV2Migrations, openV2TempSqliteConnection, V2CompanionRepository } from "@living-network/database/v2";
import Fastify from "fastify";
import { createV2CompanionPlugin } from "./plugin.ts";
import { V2CompanionUseCases } from "./use-cases.ts";

test("V2 companion plugin serves moments, comments, and roster endpoints", async () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const repo = new V2CompanionRepository(temp.db);
    const useCases = new V2CompanionUseCases({ companionRepo: repo });
    const app = Fastify();
    await app.register(createV2CompanionPlugin({ useCases }), { prefix: "/api/v2" });

    // 1. List Moments (bootstrap test)
    const listRes = await app.inject({ method: "GET", url: "/api/v2/companion/moments" });
    assert.equal(listRes.statusCode, 200);
    const listBody = listRes.json();
    assert.ok(listBody.moments.length > 0);
    const firstMoment = listBody.moments[0];

    // 2. Toggle Like
    const likeRes = await app.inject({
      method: "POST",
      url: `/api/v2/companion/moments/${firstMoment.momentId}/like`,
    });
    assert.equal(likeRes.statusCode, 200);
    const likeBody = likeRes.json();
    assert.equal(likeBody.isLiked, true);

    // 3. Add Comment
    const commentRes = await app.inject({
      method: "POST",
      url: `/api/v2/companion/moments/${firstMoment.momentId}/comments`,
      payload: { content: "真棒！支持一下！" },
    });
    assert.equal(commentRes.statusCode, 200);
    const commentBody = commentRes.json();
    assert.equal(commentBody.userComment.content, "真棒！支持一下！");
    assert.ok(commentBody.characterReply);
    assert.ok(commentBody.updatedAffinity);

    // 4. Get Roster
    const rosterRes = await app.inject({ method: "GET", url: "/api/v2/companion/roster" });
    assert.equal(rosterRes.statusCode, 200);
    const rosterBody = rosterRes.json();
    assert.ok(rosterBody.characters.length > 0);
    assert.ok(rosterBody.characters[0].affinity.level >= 1);
    assert.ok(rosterBody.characters[0].schedule.routines.length > 0);

    // 5. Get Gallery
    const galleryRes = await app.inject({ method: "GET", url: "/api/v2/companion/gallery" });
    assert.equal(galleryRes.statusCode, 200);
    const galleryBody = galleryRes.json();
    assert.ok(Array.isArray(galleryBody.gallery));

    await app.close();
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
