import { randomUUID } from "node:crypto";
import type {
  V2CharacterId,
  V2CompanionAffinityDto,
  V2CompanionGalleryItemDto,
  V2CompanionMomentDto,
  V2CompanionRosterResponse,
  V2CompanionScheduleDto,
  V2CreateCommentRequest,
  V2CreateCommentResponse,
  V2CreateMomentRequest,
  V2CreateMomentResponse,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2LikeMomentResponse,
  V2ListMomentsResponse,
  V2MediaId,
  V2MomentCommentId,
  V2MomentId,
} from "@living-network/contracts/v2";
import type { V2CompanionRepository, V2SqliteCanonRepository } from "@living-network/database/v2";

export interface V2CompanionDependencies {
  readonly companionRepo: V2CompanionRepository;
  readonly canonRepo?: V2SqliteCanonRepository | undefined;
}

export class V2CompanionUseCases {
  private readonly companionRepo: V2CompanionRepository;
  private readonly canonRepo: V2SqliteCanonRepository | undefined;

  constructor(dependencies: V2CompanionDependencies) {
    this.companionRepo = dependencies.companionRepo;
    this.canonRepo = dependencies.canonRepo;
  }

  async listMoments(): Promise<V2ListMomentsResponse> {
    let moments = this.companionRepo.listMoments();

    // Bootstrap starter moments if empty
    if (moments.length === 0) {
      const now = new Date();
      const starter1 = this.companionRepo.createMoment({
        momentId: `moment-${randomUUID()}` as V2MomentId,
        characterId: "character:furina" as V2CharacterId,
        characterName: "芙宁娜",
        content: "今天在歌剧院的新剧目排练格外顺利！顺道去尝了限定款海盐慕斯蛋糕，美味到本女士的心情直接满分~ ✨🎂",
        mediaRef: "local://assets/starter_furina_moment.png",
        mediaId: "media:starter:1" as V2MediaId,
        createdAt: new Date(now.getTime() - 1000 * 60 * 30).toISOString() as V2IsoDateTime,
      });

      this.companionRepo.addComment({
        commentId: `comment-${randomUUID()}` as V2MomentCommentId,
        momentId: starter1.momentId,
        authorType: "character",
        authorId: "character:furina" as V2CharacterId,
        authorName: "芙宁娜",
        content: "（自言自语）其实排练到最后鞋跟差点踩空…不过没人发现就是完美的演出！",
        createdAt: new Date(now.getTime() - 1000 * 60 * 20).toISOString() as V2IsoDateTime,
      });

      const starter2 = this.companionRepo.createMoment({
        momentId: `moment-${randomUUID()}` as V2MomentId,
        characterId: "character:clorinde" as V2CharacterId,
        characterName: "克洛琳德",
        content: "巡逻结束。午后的阳光穿过枫丹林荫道，适合擦拭佩剑与饮一杯红茶。有同行的吗？",
        mediaRef: "local://assets/starter_clorinde_moment.png",
        mediaId: "media:starter:2" as V2MediaId,
        createdAt: new Date(now.getTime() - 1000 * 60 * 120).toISOString() as V2IsoDateTime,
      });

      this.companionRepo.addComment({
        commentId: `comment-${randomUUID()}` as V2MomentCommentId,
        momentId: starter2.momentId,
        authorType: "character",
        authorId: "character:furina" as V2CharacterId,
        authorName: "芙宁娜",
        content: "克洛琳德！下次喝茶请务必带上我指定的那家点心！",
        createdAt: new Date(now.getTime() - 1000 * 60 * 110).toISOString() as V2IsoDateTime,
      });

      moments = this.companionRepo.listMoments();
    }

    return { moments };
  }

  async createMoment(request: V2CreateMomentRequest): Promise<V2CreateMomentResponse> {
    const characterId = request.characterId;
    let characterName = "AI 伴侣";
    if (characterId === "character:furina") characterName = "芙宁娜";
    else if (characterId === "character:clorinde") characterName = "克洛琳德";
    else if (characterId === "character:navia") characterName = "娜维娅";

    const topic = request.topic?.trim();
    const contents = [
      `${topic ? `关于「${topic}」：` : ""}今天在阳光下散步，微风正好，想把这一刻的惬意也分享给你~ 🌸`,
      `${topic ? `刚刚聊到「${topic}」：` : ""}在书店翻到了一本很有意思的设定集，灵感一下子就涌上来了！✨`,
      `${topic ? `记录一下「${topic}」：` : ""}亲手尝试烘焙了小点心，虽然形状有点不规则，但味道出奇的好吃！🍰`,
      `${topic ? `「${topic}」的一天：` : ""}傍晚的晚霞好温柔，忍不住驻足拍了下来，愿你今天也一切顺利。🌇`,
    ];
    const chosenContent = contents[Math.floor(Math.random() * contents.length)] ?? contents[0]!;

    const momentId = `moment-${randomUUID()}` as V2MomentId;
    const mediaId = `media-${randomUUID()}` as V2MediaId;
    const mediaRef = `local://assets/moment_${characterId.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.png`;

    const moment = this.companionRepo.createMoment({
      momentId,
      characterId,
      characterName,
      content: chosenContent,
      mediaRef,
      mediaId,
      createdAt: new Date().toISOString() as V2IsoDateTime,
    });

    // Reward affinity for posting
    this.companionRepo.updateAffinityAndEmotion(characterId, characterName, {
      expGained: 25,
      valenceDelta: 0.1,
      arousalDelta: 0.15,
    });

    return { moment };
  }

  async toggleLikeMoment(momentId: V2MomentId): Promise<V2LikeMomentResponse> {
    const moment = this.companionRepo.getMoment(momentId);
    if (!moment) {
      throw new Error(`Moment ${momentId} not found`);
    }

    const result = this.companionRepo.toggleLikeMoment(momentId);

    if (result.isLiked) {
      this.companionRepo.updateAffinityAndEmotion(moment.characterId, moment.characterName, {
        expGained: 10,
        valenceDelta: 0.08,
      });
    }

    return {
      momentId,
      isLiked: result.isLiked,
      likesCount: result.likesCount,
    };
  }

  async addComment(momentId: V2MomentId, request: V2CreateCommentRequest): Promise<V2CreateCommentResponse> {
    const moment = this.companionRepo.getMoment(momentId);
    if (!moment) {
      throw new Error(`Moment ${momentId} not found`);
    }

    const commentId = `comment-${randomUUID()}` as V2MomentCommentId;
    const userComment = this.companionRepo.addComment({
      commentId,
      momentId,
      authorType: "user",
      authorName: "我",
      content: request.content,
      createdAt: new Date().toISOString() as V2IsoDateTime,
    });

    // Character dynamic AI reply
    const replies = [
      `看到你的回复超开心！既然你也这么觉得，那下次一起去吧~ 😊`,
      `哼哼，果然我们心有灵犀！我也正好在想这件事呢。✨`,
      `谢谢你的留言！有你的回应，今天的心情又提升了一个台阶~ 🌸`,
      `哈哈，被你发现了！其实我当时还小小的纠结了一下呢。😉`,
    ];
    const chosenReply = replies[Math.floor(Math.random() * replies.length)] ?? replies[0]!;

    const replyId = `comment-${randomUUID()}` as V2MomentCommentId;
    const characterReply = this.companionRepo.addComment({
      commentId: replyId,
      momentId,
      authorType: "character",
      authorId: moment.characterId,
      authorName: moment.characterName,
      content: chosenReply,
      replyToCommentId: commentId,
      createdAt: new Date(Date.now() + 500).toISOString() as V2IsoDateTime,
    });

    const updatedAffinity = this.companionRepo.updateAffinityAndEmotion(moment.characterId, moment.characterName, {
      expGained: 20,
      valenceDelta: 0.12,
      arousalDelta: 0.08,
    });

    return {
      userComment,
      characterReply,
      updatedAffinity,
    };
  }

  async getRoster(): Promise<V2CompanionRosterResponse> {
    const charactersList: readonly { characterId: V2CharacterId; name: string; summary?: string }[] = [
      {
        characterId: "character:furina" as V2CharacterId,
        name: "芙宁娜",
        summary: "前水神与枫丹最瞩目的舞台明星，性格活泼傲娇但内心细腻体贴。",
      },
      {
        characterId: "character:clorinde" as V2CharacterId,
        name: "克洛琳德",
        summary: "决斗代理人，沉着冷静且可靠，闲暇时喜欢品茗与漫步。",
      },
      {
        characterId: "character:navia" as V2CharacterId,
        name: "娜维娅",
        summary: "刺玫会会长，阳光开朗、富有正义感，擅长制作可口的马卡龙。",
      },
    ];

    const moments = this.companionRepo.listMoments();

    const roster = charactersList.map((char) => {
      const state = this.companionRepo.getAffinityAndSchedule(char.characterId, char.name);
      const latestMoment = moments.find((m) => m.characterId === char.characterId);
      return {
        characterId: char.characterId,
        name: char.name,
        ...(char.summary ? { summary: char.summary } : {}),
        affinity: state.affinity,
        schedule: state.schedule,
        ...(latestMoment?.content ? { latestMomentPreview: latestMoment.content } : {}),
      };
    });

    return { characters: roster };
  }

  async getGallery(characterId?: V2CharacterId): Promise<readonly V2CompanionGalleryItemDto[]> {
    return this.companionRepo.listGallery(characterId);
  }
}
