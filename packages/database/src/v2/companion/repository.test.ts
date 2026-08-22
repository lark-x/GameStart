import assert from "node:assert/strict";
import test from "node:test";
import type {
  V2CharacterId,
  V2IsoDateTime,
  V2MediaId,
  V2MomentCommentId,
  V2MomentId,
} from "@living-network/contracts/v2";
import { applyV2Migrations, openV2TempSqliteConnection } from "../platform/index.ts";
import { V2CompanionRepository } from "./repository.ts";

test("V2CompanionRepository manages moments, likes, and comments lifecycle", () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const repo = new V2CompanionRepository(temp.db);

    const moment1 = repo.createMoment({
      momentId: "moment-1" as V2MomentId,
      characterId: "char-1" as V2CharacterId,
      characterName: "芙宁娜",
      content: "今天在枫丹歌剧院旁喝了超棒的红茶！☕️",
      mediaRef: "local://assets/cafe.png",
      mediaId: "media-1" as V2MediaId,
      createdAt: "2026-08-22T10:00:00.000Z" as V2IsoDateTime,
    });

    assert.equal(moment1.momentId, "moment-1");
    assert.equal(moment1.characterName, "芙宁娜");
    assert.equal(moment1.likesCount, 0);
    assert.equal(moment1.isLiked, false);

    // Toggle like
    const likeRes = repo.toggleLikeMoment("moment-1" as V2MomentId);
    assert.equal(likeRes.isLiked, true);
    assert.equal(likeRes.likesCount, 1);

    // Add user comment
    const comment1 = repo.addComment({
      commentId: "comment-1" as V2MomentCommentId,
      momentId: "moment-1" as V2MomentId,
      authorType: "user",
      authorName: "旅行者",
      content: "我也很喜欢那家咖啡厅的甜点！",
      createdAt: "2026-08-22T10:05:00.000Z" as V2IsoDateTime,
    });
    assert.equal(comment1.authorName, "旅行者");

    // Add character auto-reply comment
    const comment2 = repo.addComment({
      commentId: "comment-2" as V2MomentCommentId,
      momentId: "moment-1" as V2MomentId,
      authorType: "character",
      authorId: "char-1" as V2CharacterId,
      authorName: "芙宁娜",
      content: "哼哼，下次可以本女士带你去尝尝限定慕斯~",
      replyToCommentId: "comment-1" as V2MomentCommentId,
      createdAt: "2026-08-22T10:06:00.000Z" as V2IsoDateTime,
    });
    assert.equal(comment2.replyToCommentId, "comment-1");

    // Query list
    const list = repo.listMoments();
    assert.equal(list.length, 1);
    assert.equal(list[0]?.isLiked, true);
    assert.equal(list[0]?.likesCount, 1);
    assert.equal(list[0]?.comments.length, 2);

    // Gallery query
    const gallery = repo.listGallery("char-1" as V2CharacterId);
    assert.equal(gallery.length, 1);
    assert.equal(gallery[0]?.mediaRef, "local://assets/cafe.png");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});

test("V2CompanionRepository manages character affinity and daily schedule routines", () => {
  const temp = openV2TempSqliteConnection();
  try {
    applyV2Migrations(temp.db);
    const repo = new V2CompanionRepository(temp.db);

    const initial = repo.getAffinityAndSchedule("char-1" as V2CharacterId, "芙宁娜");
    assert.equal(initial.affinity.level, 1);
    assert.equal(initial.affinity.levelTitle, "初识之客");
    assert.ok(initial.schedule.routines.length > 0);
    assert.ok(initial.schedule.currentActivity.activityName);

    // Update affinity & emotion
    const updated = repo.updateAffinityAndEmotion("char-1" as V2CharacterId, "芙宁娜", {
      expGained: 150,
      valenceDelta: 0.3,
      arousalDelta: 0.2,
    });
    assert.equal(updated.level, 2);
    assert.equal(updated.levelTitle, "熟络好友");
    assert.equal(updated.interactionCount, 1);
    assert.equal(updated.emotion.moodLabel, "愉悦期待");
  } finally {
    temp.db.close();
    temp.cleanup();
  }
});
