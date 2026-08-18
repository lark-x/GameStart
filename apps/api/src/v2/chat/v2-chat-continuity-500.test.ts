import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ChatCompletionRequest, ChatCompletionResult, ChatDelta, ChatProvider } from "@living-network/ai/v2";
import type {
  V2CreateInstantStoryResponse,
  V2SendChatMessageResponse,
  V2ConversationId,
  V2MemoryId,
  V2MessageId,
} from "@living-network/contracts/v2";
import { openV2TempSqliteConnection, V2SqliteChatUnitOfWork } from "@living-network/database/v2";
import { createV2ChatMaintenanceJob } from "@living-network/domain/v2";
import { V2MaintenanceDispatchPump } from "@living-network/worker";
import { createV2ApiRuntime } from "../platform/runtime.ts";
import { createV2ChatUseCases } from "./use-cases.ts";

class DeterministicChatProvider implements ChatProvider {
  public simulate429Once = false;
  public completeCalls: string[] = [];

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const lastMessage = String(request.messages.at(-1)?.content ?? "");
    this.completeCalls.push(lastMessage);

    if (this.simulate429Once) {
      this.simulate429Once = false;
      throw new Error("HTTP 429: Too Many Requests / Rate limit exceeded");
    }

    // Memory extraction prompt handling
    if (lastMessage.includes("memory extraction agent")) {
      const allIds = Array.from(lastMessage.matchAll(/\[ID: (message:[^\]]+)\]/g)).map((m) => m[1]!);
      const sourceIds = allIds.length > 0 ? allIds : ["message:user:fallback"];

      if (lastMessage.includes("3 月 12 日")) {
        return {
          id: "mem-extract-1",
          model: "fake-chat",
          content: JSON.stringify([
            {
              kind: "profile",
              content: "用户的生日是 3 月 12 日",
              importance: 5,
              confidence: 0.95,
              sourceMessageIds: sourceIds,
            },
          ]),
        };
      }

      if (lastMessage.includes("喜欢喝咖啡")) {
        return {
          id: "mem-extract-2",
          model: "fake-chat",
          content: JSON.stringify([
            {
              kind: "preference",
              content: "用户喜欢喝咖啡",
              importance: 4,
              confidence: 0.9,
              sourceMessageIds: sourceIds,
            },
          ]),
        };
      }

      if (lastMessage.includes("我现在不喝咖啡了") || lastMessage.includes("更喜欢喝茶")) {
        return {
          id: "mem-extract-3",
          model: "fake-chat",
          content: JSON.stringify([
            {
              kind: "preference",
              content: "用户现在不喝咖啡了，更喜欢喝茶",
              importance: 4,
              confidence: 0.95,
              sourceMessageIds: sourceIds,
            },
          ]),
        };
      }

      return {
        id: "mem-extract-empty",
        model: "fake-chat",
        content: "[]",
      };
    }

    // Memory consolidation prompt handling
    if (lastMessage.includes("Compare this existing memory with a new memory candidate")) {
      if (lastMessage.includes("咖啡") && lastMessage.includes("茶")) {
        return {
          id: "mem-consolidate-1",
          model: "fake-chat",
          content: JSON.stringify({
            action: "supersede",
            rationale: "用户偏好已从咖啡转变为喝茶",
          }),
        };
      }
      return {
        id: "mem-consolidate-default",
        model: "fake-chat",
        content: JSON.stringify({
          action: "keep_both",
          rationale: "非冲突事实",
        }),
      };
    }

    // Conversation summary prompt handling
    if (lastMessage.includes("conversational summary agent")) {
      return {
        id: "summary-1",
        model: "fake-chat",
        content: "花火与用户进行了持续的愉快交谈，讨论了生活琐事、生日以及各种偏好喜好，关系逐渐加深。",
      };
    }

    return {
      id: "fake-complete",
      model: "fake-chat",
      content: "OK",
    };
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    const lastMsg = String(request.messages.at(-1)?.content ?? "");
    if (lastMsg.includes("生日")) {
      yield { content: "我当然记得，你的生日是 3 月 12 日！" };
    } else {
      yield { content: "收到你的消息了，让我们继续故事吧！" };
    }
    yield { finishReason: "stop" };
  }
}

test("500 Turn System-level E2E Continuity and Stability Test", async () => {
  const temp = openV2TempSqliteConnection();
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-continuity-media-"));
  temp.db.close();

  const provider = new DeterministicChatProvider();
  let runtime = createV2ApiRuntime({
    sqlitePath: temp.path,
    mediaRoot,
    chatProvider: provider,
  });

  const getUnitOfWork = () => new V2SqliteChatUnitOfWork(runtime.db);
  let simulatedTime = Date.now();
  const getNow = () => new Date(simulatedTime);

  let pump: V2MaintenanceDispatchPump | undefined = new V2MaintenanceDispatchPump({
    workerId: "test-worker-1",
    unitOfWork: getUnitOfWork(),
    provider,
    pollIntervalMs: 50,
    now: getNow,
  });

  // Helper to drain pending maintenance pump jobs
  const drainPump = async () => {
    if (!pump) return;
    let worked = true;
    let iterations = 0;
    while (worked && iterations < 200) {
      worked = await pump.tick();
      iterations += 1;
    }
  };

  try {
    // ==========================================
    // Turn 1: Persona creation and AI Opening
    // ==========================================
    const storyRes = await runtime.app.inject({
      method: "POST",
      url: "/api/v2/instant-stories",
      payload: {
        persona: "花火是欢愉星神的虔诚信徒，爱捉弄人，机智敏锐，善解人意。",
        displayName: "花火",
        idempotencyKey: "continuity:instant:1",
      },
    });
    assert.equal(storyRes.statusCode, 201);
    const story = storyRes.json() as V2CreateInstantStoryResponse;
    const conversationId = story.conversation.conversationId as V2ConversationId;
    assert.ok(conversationId);

    // Initial opening reply
    const openReplyRes = await runtime.app.inject({
      method: "POST",
      url: `/api/v2/chat/conversations/${conversationId}/replies`,
      payload: { idempotencyKey: "continuity:reply:1" },
    });
    assert.equal(openReplyRes.statusCode, 200);

    const tokenBudgetHistory: { turn: number; estimatedTokens: number; budget: number }[] = [];

    // ==========================================
    // Loop through 500 Turns with defined milestones
    // ==========================================
    for (let turn = 2; turn <= 500; turn += 1) {
      simulatedTime += 60000; // advance 1 minute per turn

      let userText = `这是第 ${turn} 轮对话，今天的冒险如何？`;
      if (turn === 10) {
        userText = "顺便告诉你，我的生日是 3 月 12 日，不要忘记哦。";
      } else if (turn === 350) {
        userText = "告诉你一个小秘密，我平时很喜欢喝咖啡。";
      } else if (turn === 400) {
        userText = "我最近口味变了，我现在不喝咖啡了，更喜欢喝茶。";
      } else if (turn === 500) {
        userText = "聊了这么久，你还记得我的生日吗？";
      }

      // 1. Send User Message
      const userMsgRes = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/messages`,
        payload: {
          text: userText,
          idempotencyKey: `continuity:user:${turn}`,
        },
      });
      assert.equal(userMsgRes.statusCode, 201);

      // 2. Prepare & Generate Assistant Reply
      const replyRes = await runtime.app.inject({
        method: "POST",
        url: `/api/v2/chat/conversations/${conversationId}/replies`,
        payload: { idempotencyKey: `continuity:reply:${turn}` },
      });
      assert.equal(replyRes.statusCode, 200);

      // Milestone Checks

      // Turn 14: Memory Extraction of Birthday
      // With the active-job gate + 16-message batches, the batch containing the
      // birthday message lands a few turns after the message itself.
      if (turn === 14) {
        await drainPump();
        const memories = await getUnitOfWork().withChatTransaction(async ({ memories }) => {
          return memories.listByConversation(conversationId);
        });
        const birthdayMem = memories.find((m) => m.content.includes("3 月 12 日"));
        assert.ok(birthdayMem, "Birthday memory must be extracted at turn 10");
        assert.equal(birthdayMem.kind, "profile");
        assert.equal(birthdayMem.status, "active");
      }

      // Turn 80: Multiple Summary verification
      if (turn === 80) {
        await drainPump();
        const summary = await getUnitOfWork().withChatTransaction(async ({ summaries }) => {
          return summaries.get(conversationId);
        });
        assert.ok(summary, "Summary must exist at turn 80");
        assert.ok(summary.version >= 2, `Summary version should be >= 2, got ${summary.version}`);
        assert.ok(summary.coveredUntilMessageId, "Summary must track coveredUntilMessageId");
      }

      // Turn 150: Stop Worker Pump, chat continues for 50 turns
      if (turn === 150 && pump) {
        pump.stop();
        pump = undefined;
      }

      // Turn 151 - 200: Chat operates with pump stopped -> pending jobs accumulate
      if (turn === 200) {
        // Restart worker pump
        pump = new V2MaintenanceDispatchPump({
          workerId: "test-worker-1",
          unitOfWork: getUnitOfWork(),
          provider,
          pollIntervalMs: 50,
          now: getNow,
        });
        pump.start();
        await drainPump();
      }

      // Turn 250: API Restart (re-opening SQLite database)
      if (turn === 250) {
        await drainPump();
        await runtime.app.close();
        if (pump) {
          pump.stop();
          pump = undefined;
        }

        // Recreate API runtime on the exact same database
        runtime = createV2ApiRuntime({
          sqlitePath: temp.path,
          mediaRoot,
          chatProvider: provider,
        });

        // Recreate worker pump
        pump = new V2MaintenanceDispatchPump({
          workerId: "test-worker-1",
          unitOfWork: getUnitOfWork(),
          provider,
          pollIntervalMs: 50,
          now: getNow,
        });
        pump.start();

        // Verify conversation, messages, memories, and summary restored
        const convRes = await runtime.app.inject({
          method: "GET",
          url: `/api/v2/chat/conversations/${conversationId}`,
        });
        assert.equal(convRes.statusCode, 200);

        const messagesRes = await runtime.app.inject({
          method: "GET",
          url: `/api/v2/chat/conversations/${conversationId}/messages?limit=50`,
        });
        assert.equal(messagesRes.statusCode, 200);
        assert.equal(messagesRes.json().messages.length, 50);
        assert.equal(messagesRes.json().hasMore, true);
      }

      // Turn 300: Simulate 429 Provider error and verify retry backoff
      if (turn === 300) {
        // Enqueue a deterministic memory_extract job so the 429 simulation has a target.
        await getUnitOfWork().withChatTransaction(async (repos) => {
          const conversation = await repos.conversations.get(conversationId);
          const recent = await repos.messages.listRecentByConversation(conversationId, 4);
          if (conversation !== undefined && recent.length > 0) {
            await repos.maintenanceJobs.enqueue(createV2ChatMaintenanceJob({
              jobId: `job:maint:429:${Date.now()}`,
              conversationId,
              jobType: "memory_extract",
              status: "pending",
              payload: {
                conversationId,
                storyWorldId: conversation.storyWorldId,
                characterId: conversation.primaryCharacterId,
                sourceMessageIds: recent.map((m) => m.messageId as V2MessageId),
              },
              attempts: 0,
              maxAttempts: 3,
              availableAt: getNow().toISOString(),
            }));
          }
        });
        // Stop the async pump so the 429 is consumed deterministically by the manual tick.
        if (pump) {
          pump.stop();
        }
        provider.simulate429Once = true;
        // Claim deterministically until the 429 is consumed by a manual tick.
        if (pump) {
          let worked = false;
          for (let attempt = 0; attempt < 50 && !worked; attempt += 1) {
            worked = await pump.tick();
          }
          assert.equal(worked, true, "429 simulation should claim a job");
        }
        // Advance time to pass backoff delay
        simulatedTime += 30000;
        await drainPump();
        if (pump) {
          pump.start();
        }
      }

      // Turn 354: Extract Coffee preference (cursor batches trigger every 8 messages,
      // so the extraction lands a few turns after the coffee message).
      if (turn === 354) {
        await drainPump();
        const memories = await getUnitOfWork().withChatTransaction(async ({ memories }) => {
          return memories.listByConversation(conversationId);
        });
        const coffeeMem = memories.find((m) => m.content.includes("咖啡") && m.status === "active");
        assert.ok(coffeeMem, "Coffee preference memory should be extracted and active at turn 350");
      }

      // Turn 404: Preference change -> Memory Consolidation (supersede)
      if (turn === 404) {
        await drainPump();
        const memories = await getUnitOfWork().withChatTransaction(async ({ memories }) => {
          return memories.listByConversation(conversationId);
        });
        const activeTeaMem = memories.find((m) => m.content.includes("茶") && m.status === "active");
        const supersededCoffeeMem = memories.find((m) => m.content.includes("咖啡") && m.status === "superseded");
        assert.ok(activeTeaMem, "Tea preference memory should be active after consolidation");
        assert.ok(supersededCoffeeMem, "Old coffee preference memory should be superseded after consolidation");
      }

      // Periodic Context Token Bounds Check
      if (turn % 50 === 0) {
        const diagnosticsRes = await runtime.app.inject({
          method: "GET",
          url: `/api/v2/chat/conversations/${conversationId}/diagnostics/latest`,
        });
        assert.equal(diagnosticsRes.statusCode, 200);
        const diag = diagnosticsRes.json();
        assert.ok(
          diag.estimatedTokens <= diag.inputBudget,
          `Estimated tokens (${diag.estimatedTokens}) must fit within the input budget (${diag.inputBudget})`,
        );
        tokenBudgetHistory.push({
          turn,
          estimatedTokens: diag.estimatedTokens ?? diag.recentCount * 50,
          budget: diag.inputBudget,
        });
      }

      // Drain pump periodically
      if (pump && turn % 5 === 0) {
        await drainPump();
      }
    }

    // ==========================================
    // Turn 500: Long-term Recall of Birthday Memory
    // ==========================================
    await drainPump();

    // Prepare reply manually to inspect prepared prompt context
    const chatUseCases = createV2ChatUseCases(getUnitOfWork());
    const prepared = await chatUseCases.prepareReply(
      conversationId,
      { idempotencyKey: "continuity:verify:turn500" as any },
      { contextWindow: 4096, maxTokens: 1000 },
    );
    assert.ok(prepared.prompt, "Prompt must be prepared");
    assert.ok(prepared.prompt.budget.contextWindow <= 4096, "Context window must be bounded at 4096");
    assert.ok(prepared.prompt.estimatedTokens <= prepared.prompt.budget.inputBudget, "Estimated tokens must stay within input budget");

    // Verify prompt messages contain the long-term birthday memory
    const systemPrompt = prepared.prompt.messages.map((m) => m.content).join("\n");
    assert.match(systemPrompt, /3 月 12 日/, "Prepared prompt must include the long-term birthday memory extracted at turn 10");

    // Verify total messages count
    const allMessages = await getUnitOfWork().withChatTransaction(async ({ messages }) => {
      return messages.listByConversation(conversationId, 2000);
    });
    assert.ok(allMessages.length >= 999, `All messages must be persisted, got ${allMessages.length}`);
  } finally {
    if (pump) {
      pump.stop();
    }
    await runtime.app.close();
  }
});
