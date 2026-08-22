import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionRequest, ChatCompletionResult, ChatProvider } from "@living-network/ai/v2";
import type {
  V2CandidateId,
  V2ConversationId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import { openV2TempSqliteConnection, V2SqliteChatUnitOfWork } from "@living-network/database/v2";
import { V2MaintenanceDispatchPump } from "@living-network/worker";
import { createV2ApiRuntime } from "../platform/runtime.ts";

function extractContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "string" ? item : (item as { text?: string }).text ?? ""))
      .join(" ");
  }
  return "";
}

class StoryAnalyzeChatProvider implements ChatProvider {
  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const lastMessage = extractContentText(request.messages[request.messages.length - 1]?.content);
    const systemMessage = extractContentText(request.messages.find((m) => m.role === "system")?.content);

    if (systemMessage.includes("Story Analyzer") || lastMessage.includes("待分析的对话实录")) {
      return {
        id: "story-analyze-res",
        model: "fake-story-analyzer",
        content: JSON.stringify({
          scenes: [
            {
              title: "迷雾森林的古老神庙",
              body: "旅者与伙伴穿过浓重的白雾，一座被青苔覆盖的古代神庙映入眼帘。神庙石门紧闭，两侧刻有神秘的星体符文。",
              choices: [
                {
                  label: "尝试解读左侧的月亮符文",
                  consequenceSummary: "触发机关并照亮神庙入口",
                },
                {
                  label: "绕到神庙后方寻找隐蔽入口",
                  consequenceSummary: "发现一处坍塌的石隙",
                },
              ],
            },
          ],
        }),
      };
    }

    return {
      id: "fake-chat-reply",
      model: "fake-chat",
      content: "好呀，迷雾森林深处据说藏着很多未解之谜，我们一起出发吧！",
    };
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<{ readonly content?: string; readonly finishReason?: string }> {
    const res = await this.complete(request);
    yield { content: res.content };
    yield { finishReason: "stop" };
  }
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("V2 Story Analyzer End-to-End: Chat -> story_analyze -> Candidate -> Review Approval -> Canon Graph", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "story-analyzer-"));
  const dbPath = join(tempDir, "v2-story-analyzer.sqlite");
  const provider = new StoryAnalyzeChatProvider();
  const runtime = await createV2ApiRuntime({
    sqlitePath: dbPath,
    chatProvider: provider,
  });

  const { openV2SqliteConnection } = await import("@living-network/database/v2");
  const workerDb = openV2SqliteConnection({ path: dbPath });
  const uow = new V2SqliteChatUnitOfWork(workerDb);
  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_e2e_analyzer",
    unitOfWork: uow,
    provider,
  });

  try {
    // 1. Create Instant Story
    const createRes = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/instant-stories",
      payload: {
        persona: "花火是欢愉星神的信徒，活泼机智，喜欢引导他人进行有趣的冒险。",
        displayName: "花火",
        idempotencyKey: "story:bootstrap:e2e",
      },
    });
    assert.equal(createRes.statusCode, 201);
    const story = createRes.json();
    const conversationId = story.conversation.conversationId as V2ConversationId;
    const storyWorldId = story.conversation.storyWorldId as V2StoryWorldId;

    // 2. User sends message & generates assistant reply
    const sendRes = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/messages`,
      payload: {
        text: "花火，我们去探索迷雾森林的古老神庙吧！",
        idempotencyKey: "user:msg:e2e:1",
      },
    });
    assert.equal(sendRes.statusCode, 201);

    const replyRes = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/replies`,
      payload: { idempotencyKey: "reply:e2e:1" },
    });
    assert.equal(replyRes.statusCode, 200);

    // 3. Trigger Story Analyzer
    const analyzeRes = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/analyze`,
      payload: { idempotencyKey: "analyze:e2e:1" },
    });
    assert.equal(analyzeRes.statusCode, 202);
    const analyzePayload = analyzeRes.json();
    assert.ok(analyzePayload.jobId, "Must return enqueued maintenance jobId");

    // 3b. Replay with the same idempotency key returns the same job (no duplicate).
    const analyzeReplay = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/analyze`,
      payload: { idempotencyKey: "analyze:e2e:1" },
    });
    assert.equal(analyzeReplay.statusCode, 202);
    assert.equal(analyzeReplay.json().jobId, analyzePayload.jobId);

    // 4. Worker executes maintenance jobs
    let ran = 0;
    while (await pump.tick()) {
      ran++;
    }
    assert.ok(ran >= 1, "Pump should have processed maintenance jobs");

    await uow.withChatTransaction(async (repos) => {
      const job = await repos.maintenanceJobs.get(analyzePayload.jobId);
      assert.equal(job?.status, "completed", `Job failed with: ${job?.lastError}`);
    });

    // 5. Verify scene candidate is submitted to Candidate Review repository
    const candidatesRes = await runtime.app.inject({
      method: "GET",
      url: `/api/v2/core/worlds/${encodeURIComponent(storyWorldId)}/candidates/scenes`,
    });
    assert.equal(candidatesRes.statusCode, 200);
    const candidatesList = candidatesRes.json() as any[];
    assert.equal(candidatesList.length, 1);
    const candidate = candidatesList[0];
    assert.equal(candidate.payload.scene.title, "迷雾森林的古老神庙");
    assert.equal(candidate.provenance.source, "llm");
    assert.equal(candidate.status, "pending");

    // 6. Creator/Human reviews and approves the candidate
    const candidateId = candidate.candidateId as V2CandidateId;
    const reviewRes = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/core/worlds/${encodeURIComponent(storyWorldId)}/candidates/scenes/${encodeURIComponent(candidateId)}/review`,
      payload: {
        action: "approve",
        reviewer: "story_editor",
        expectedRevision: 1,
        idempotencyKey: "review:approve:e2e:1",
      },
    });
    assert.equal(reviewRes.statusCode, 200);
    const reviewResult = reviewRes.json();
    assert.equal(reviewResult.candidate.status, "approved");
    assert.ok(reviewResult.appliedSceneId, "Applied sceneId must be returned upon approval");

    // 7. Verify the scene is now committed into the narrative graph
    const graphRes = await runtime.app.inject({
      method: "GET",
      url: `/api/v2/core/worlds/${encodeURIComponent(storyWorldId)}/graph`,
    });
    assert.equal(graphRes.statusCode, 200);
    const graph = graphRes.json();
    assert.ok(graph.scenes.some((s: any) => s.title === "迷雾森林的古老神庙"), "Approved scene must exist in Canon graph");
  } finally {
    pump.stop();
    await runtime.close();
    workerDb.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Safe on Windows
    }
  }
});

test("V2 Story Analyzer analyzes recent messages first and only new messages incrementally", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "story-analyzer-incremental-"));
  const dbPath = join(tempDir, "v2-story-analyzer-incremental.sqlite");
  const provider = new StoryAnalyzeChatProvider();
  const runtime = await createV2ApiRuntime({
    sqlitePath: dbPath,
    chatProvider: provider,
  });

  const { openV2SqliteConnection } = await import("@living-network/database/v2");
  const workerDb = openV2SqliteConnection({ path: dbPath });
  const uow = new V2SqliteChatUnitOfWork(workerDb);
  const pump = new V2MaintenanceDispatchPump({
    workerId: "test_worker_analyzer_incremental",
    unitOfWork: uow,
    provider,
  });

  try {
    const createRes = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/instant-stories",
      payload: { persona: "花火是爱笑角色", displayName: "花火", idempotencyKey: "incremental:instant" },
    });
    assert.equal(createRes.statusCode, 201);
    const conversationId = (createRes.json() as { readonly conversation: { readonly conversationId: string } }).conversation.conversationId;

    // Seed 1000 messages directly through the repository.
    await uow.withChatTransaction(async (repos) => {
      for (let index = 1; index <= 1000; index += 1) {
        await repos.messages.create({
          messageId: `message:inc:${index}`,
          conversationId: conversationId as V2ConversationId,
          role: index % 2 === 0 ? "assistant" : "user",
          text: `这是第 ${index} 条消息`,
          idempotencyKey: `inc:${index}`,
          status: "completed",
          attachments: [],
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        });
      }
    });

    // First analyze: should use the most recent 80 messages (921..1000).
    const firstAnalyze = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/analyze`,
      payload: { idempotencyKey: "incremental:analyze:1" },
    });
    assert.equal(firstAnalyze.statusCode, 202);
    const firstJobId = (firstAnalyze.json() as { readonly jobId: string }).jobId;
    let ran = 0;
    while (await pump.tick()) {
      ran += 1;
      if (ran > 5) break;
    }
    assert.ok(ran >= 1, "First analyze job should have been processed");

    const firstPayload = await uow.withChatTransaction(async (repos) => {
      const job = await repos.maintenanceJobs.get(firstJobId);
      return job?.payload as { readonly sourceMessageIds: readonly string[] };
    });
    const firstIds = firstPayload.sourceMessageIds;
    assert.equal(firstIds.length, 80);
    assert.equal(firstIds[0], "message:inc:921");
    assert.equal(firstIds.at(-1), "message:inc:1000");

    // Add 40 more messages and analyze again: only the new range is analyzed.
    await uow.withChatTransaction(async (repos) => {
      for (let index = 1001; index <= 1040; index += 1) {
        await repos.messages.create({
          messageId: `message:inc:${index}`,
          conversationId: conversationId as V2ConversationId,
          role: index % 2 === 0 ? "assistant" : "user",
          text: `这是第 ${index} 条消息`,
          idempotencyKey: `inc:${index}`,
          status: "completed",
          attachments: [],
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        });
      }
    });

    const secondAnalyze = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/analyze`,
      payload: { idempotencyKey: "incremental:analyze:2" },
    });
    assert.equal(secondAnalyze.statusCode, 202);
    const secondJobId = (secondAnalyze.json() as { readonly jobId: string }).jobId;
    assert.notEqual(secondJobId, firstJobId);
    ran = 0;
    while (await pump.tick()) {
      ran += 1;
      if (ran > 5) break;
    }
    assert.ok(ran >= 1, "Second analyze job should have been processed");

    const secondPayload = await uow.withChatTransaction(async (repos) => {
      const job = await repos.maintenanceJobs.get(secondJobId);
      return job?.payload as { readonly sourceMessageIds: readonly string[] };
    });
    const secondIds = secondPayload.sourceMessageIds;
    assert.equal(secondIds.length, 40);
    assert.equal(secondIds[0], "message:inc:1001");
    assert.equal(secondIds.at(-1), "message:inc:1040");
  } finally {
    await runtime.close();
    workerDb.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Safe on Windows
    }
  }
});
